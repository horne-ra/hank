"""LiveKit agent worker — Phase 1 minimum viable voice loop.

Run in console mode for terminal testing:
    cd backend && uv run python -m agent.worker console

Run in dev mode to connect to LiveKit Cloud (used by frontend):
    cd backend && uv run python -m agent.worker dev
"""
import asyncio
import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import AgentSession, JobContext, WorkerOptions, cli, llm
from livekit.plugins import openai, silero
from openai.types.beta.realtime.session import InputAudioTranscription

from agent.session_store import (
    create_session,
    finalize_session,
    get_initial_message,
    get_resume_context,
    get_resume_transcript,
    get_session_by_room,
    init_db,
)
from agent.tutor import HankTutor
from agent.vision import analyze_image

# Repo root (parent of backend/) and backend/ — either location may hold .env
_backend_dir = Path(__file__).resolve().parents[1]
_repo_root = _backend_dir.parent
load_dotenv(_repo_root / ".env")
load_dotenv(_backend_dir / ".env")

_REQUIRED_ENV_VARS = [
    "LIVEKIT_URL",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "OPENAI_API_KEY",
]
_missing = [v for v in _REQUIRED_ENV_VARS if not os.environ.get(v)]
if _missing:
    raise RuntimeError(
        f"Missing required environment variable(s): {', '.join(_missing)}. "
        "Copy .env.example to .env at the project root or in backend/, fill in "
        "LIVEKIT_*, OPENAI_API_KEY, then restart."
    )


def prewarm_fnc(proc):
    proc.userdata["vad"] = silero.VAD.load()


def _resume_chat_ctx_from_transcript(messages: list[dict]) -> llm.ChatContext:
    """Seed LiveKit ChatContext with prior user/assistant turns (skip system)."""
    ctx = llm.ChatContext.empty()
    for msg in messages:
        role = msg.get("role")
        content = msg.get("content") or ""
        if not content.strip():
            continue
        if role == "system":
            continue
        if role == "user":
            ctx.add_message(role="user", content=content)
        elif role == "assistant":
            ctx.add_message(role="assistant", content=content)
    return ctx


async def entrypoint(ctx: JobContext):
    await ctx.connect()
    loop = asyncio.get_running_loop()

    init_db()
    session_id = get_session_by_room(ctx.room.name) or create_session(ctx.room.name)

    resume_transcript = get_resume_transcript(session_id)
    resume_summary = get_resume_context(session_id) if resume_transcript is None else None
    initial_message = get_initial_message(session_id)

    extra_instructions = None
    if resume_summary:
        topics = resume_summary.get("topics_covered", [])
        if topics:
            extra_instructions = (
                "PRIOR SESSION CONTEXT (for awareness only — DO NOT invent details beyond this):\n"
                f"You previously helped this user with: {', '.join(topics)}.\n"
                "When you greet them, briefly acknowledge that you remember helping with one of those topics. "
                "Do NOT invent specific tools, steps, or details that aren't listed above. "
                "If the user wants to continue, ask them which one they want to pick back up."
            )
        else:
            extra_instructions = (
                "PRIOR SESSION CONTEXT (for awareness only — DO NOT invent details beyond this):\n"
                "You have a high-level summary of a prior session but no topic list was stored. "
                "Welcome them back without inventing what you worked on. Ask what they want to work on today."
            )

    if resume_transcript:
        agent = HankTutor(chat_ctx=_resume_chat_ctx_from_transcript(resume_transcript))
    elif resume_summary:
        agent = HankTutor(extra_instructions=extra_instructions)
    else:
        agent = HankTutor()

    vad = ctx.proc.userdata.get("vad") or silero.VAD.load()

    session = AgentSession(
        vad=vad,
        llm=openai.realtime.RealtimeModel(
            voice="ash",
            temperature=0.7,
            input_audio_transcription=InputAudioTranscription(
                model="gpt-4o-transcribe",
                language="en",
            ),
        ),
    )

    pending_nudge_task: asyncio.Task | None = None
    vision_task: asyncio.Task | None = None

    async def nudge_after_delay() -> None:
        try:
            await asyncio.sleep(12)
            await session.say(
                "Still waiting on that image — want to send it, or just tell me what you're seeing?"
            )
        except asyncio.CancelledError:
            return

    async def acknowledge_image() -> None:
        try:
            await session.say("Got it — let me take a look.")
        except Exception:
            logging.exception("acknowledge_image failed")

    async def process_image_and_reply(image_path: str) -> None:
        try:
            analysis = await analyze_image(image_path)
        except Exception:
            logging.exception("analyze_image failed")
            try:
                await session.say(
                    "Hmm, I had trouble making out that photo — can you describe what you're seeing, or try another angle?"
                )
            except Exception:
                logging.exception("recovery say after vision failure")
            return
        try:
            # If the user spoke after the ack and Hank is mid-response when vision
            # finishes, observe whether this interrupts or queues in practice.
            await session.generate_reply(
                instructions=(
                    f"The user just shared a photo. Here's what's visible in it: {analysis}\n\n"
                    "Incorporate this observation naturally into your next response. Do not "
                    "read the description verbatim — talk about what you see as if you're "
                    "looking at it with them. Then continue guiding them toward the next "
                    "step of the fix."
                )
            )
        except Exception:
            logging.exception("generate_reply after image failed")

    def on_data_received(packet: rtc.DataPacket) -> None:
        nonlocal pending_nudge_task, vision_task
        if packet.topic != "image":
            return
        if packet.participant is None:
            return
        try:
            payload = json.loads(packet.data.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            logging.warning("Malformed image-topic data packet")
            return

        msg_type = payload.get("type")
        if msg_type == "image_pending":
            if pending_nudge_task and not pending_nudge_task.done():
                pending_nudge_task.cancel()
            pending_nudge_task = loop.create_task(nudge_after_delay())
        elif msg_type == "image_cancelled":
            if pending_nudge_task and not pending_nudge_task.done():
                pending_nudge_task.cancel()
        elif msg_type == "image_uploaded":
            if pending_nudge_task and not pending_nudge_task.done():
                pending_nudge_task.cancel()
            image_path = payload.get("path")
            if not image_path:
                logging.warning("image_uploaded without path")
                return
            loop.create_task(acknowledge_image())
            vision_task = loop.create_task(process_image_and_reply(str(image_path)))

    async def on_shutdown() -> None:
        nonlocal pending_nudge_task, vision_task
        for t in (pending_nudge_task, vision_task):
            if t is not None and not t.done():
                t.cancel()
                try:
                    await t
                except asyncio.CancelledError:
                    pass
                except Exception:
                    logging.exception("Error while awaiting cancelled image task")
        pending_nudge_task = None
        vision_task = None

        history: list[dict] = []
        try:
            for msg in session.history.messages():
                history.append(
                    {
                        "role": str(msg.role),
                        "content": msg.text_content or "",
                    }
                )
        except Exception:
            logging.exception("Failed to collect session history")
        await finalize_session(session_id, history)

    ctx.add_shutdown_callback(on_shutdown)

    await session.start(
        room=ctx.room,
        agent=agent,
    )

    ctx.room.on("data_received", on_data_received)

    if resume_transcript:
        greeting_instructions = (
            "Respond in English only. The user is resuming a previous conversation with you. "
            "You have the full transcript of that conversation in your context — review it and respond "
            "naturally as if continuing where you left off. Briefly welcome them back, reference one specific "
            "thing from the actual prior conversation (not invented details), and ask if they want to keep "
            "going on that or move to something new. Two sentences maximum. English only."
        )
    elif resume_summary:
        greeting_instructions = (
            "Respond in English only. The user is returning to you. "
            "Welcome them back briefly. You only have a high-level summary of past topics, NOT specific details. "
            "Mention generally that you remember helping them before, and ask what they want to work on today. "
            "Do NOT invent or guess at specific things you previously discussed. "
            "Two sentences maximum. English only."
        )
    elif initial_message and initial_message.strip():
        topic = initial_message.strip()[:200].replace("\n", " ").replace("\r", " ")
        greeting_instructions = (
            f"Respond in English only. The user just started a session and chose this topic: '{topic}'. "
            "Greet them briefly as Hank, acknowledge what they're working on, and ask one specific clarifying "
            "question to get started — like what tools they have on hand or where the problem is. "
            "Two sentences maximum. English only. Don't ask 'what are we fixing today' since they've already told you."
        )
    else:
        greeting_instructions = (
            "Respond in English only. Greet the user briefly as Hank in English: "
            "say hey, introduce yourself, ask what they're fixing today. "
            "Two sentences maximum. English only."
        )

    await session.generate_reply(instructions=greeting_instructions)


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm_fnc,
        )
    )
