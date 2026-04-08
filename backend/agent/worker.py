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
from livekit.agents import AgentSession, JobContext, WorkerOptions, cli
from livekit.plugins import openai, silero
from openai.types.beta.realtime.session import InputAudioTranscription

from agent.session_store import (
    create_session,
    finalize_session,
    get_resume_context,
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


async def entrypoint(ctx: JobContext):
    await ctx.connect()

    init_db()
    session_id = get_session_by_room(ctx.room.name) or create_session(ctx.room.name)

    resume_context = get_resume_context(session_id)

    extra_instructions = None
    if resume_context:
        topics = resume_context.get("topics_covered", [])
        steps = resume_context.get("key_steps_taught", [])
        extra_instructions = (
            "CONTEXT FROM PREVIOUS SESSION (the user is picking up where they left off):\n"
            f"Last time, you covered: {', '.join(topics) if topics else 'general topics'}.\n"
            f"Steps you walked them through: {', '.join(steps) if steps else 'general guidance'}.\n"
            "When you greet the user, briefly acknowledge that you remember the previous session "
            "and ask if they want to continue with that work or start something new. "
            "Don't recap the entire previous session — just a quick acknowledgment."
        )

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
        agent=HankTutor(extra_instructions=extra_instructions),
    )

    if resume_context:
        greeting_instructions = (
            "Respond in English only. The user is resuming a previous session with you. "
            "Briefly welcome them back, mention you remember what you were working on last time, "
            "and ask if they want to continue or start something new. "
            "Two sentences maximum. English only."
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
