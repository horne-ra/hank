"""LiveKit agent worker — Phase 1 minimum viable voice loop.

Run in console mode for terminal testing:
    cd backend && uv run python -m agent.worker console

Run in dev mode to connect to LiveKit Cloud (used by frontend):
    cd backend && uv run python -m agent.worker dev
"""
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
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

    async def on_shutdown() -> None:
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
        topic = initial_message.strip()
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
