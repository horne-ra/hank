"""LiveKit agent worker — Phase 1 minimum viable voice loop.

Run in console mode for terminal testing:
    cd backend && uv run python -m agent.worker console

Run in dev mode to connect to LiveKit Cloud (used by frontend):
    cd backend && uv run python -m agent.worker dev
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from livekit.agents import AgentSession, JobContext, WorkerOptions, cli
from livekit.plugins import openai, silero
from openai.types.beta.realtime.session import InputAudioTranscription

from agent.session_store import create_session, finalize_session, init_db
from agent.tutor import HankTutor

# Load .env from project root (one level up from backend/)
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

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
        "Set them in the project-root .env file or export them in your shell."
    )


def prewarm_fnc(proc):
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext):
    await ctx.connect()

    init_db()
    session_id = create_session(ctx.room.name)

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
            pass
        await finalize_session(session_id, history)

    ctx.add_shutdown_callback(on_shutdown)

    await session.start(
        room=ctx.room,
        agent=HankTutor(),
    )

    await session.generate_reply(
        instructions=(
            "Respond in English only. Greet the user briefly as Hank in English: "
            "say hey, introduce yourself, ask what they're fixing today. "
            "Two sentences maximum. English only."
        )
    )


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm_fnc,
        )
    )
