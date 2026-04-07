"""LiveKit agent worker — Phase 1 minimum viable voice loop.

Run in console mode for terminal testing:
    cd backend && uv run python -m agent.worker console

Run in dev mode to connect to LiveKit Cloud (used by frontend):
    cd backend && uv run python -m agent.worker dev
"""
from pathlib import Path

from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.plugins import openai, silero

# Load .env from project root (one level up from backend/)
load_dotenv(Path(__file__).resolve().parents[2] / ".env")


async def entrypoint(ctx: JobContext):
    await ctx.connect()

    session = AgentSession(
        vad=silero.VAD.load(),
        llm=openai.realtime.RealtimeModel(
            voice="ash",
            temperature=0.7,
        ),
    )

    await session.start(
        room=ctx.room,
        agent=Agent(
            instructions=(
                "You are a helpful voice assistant. Keep responses short and "
                "conversational. This is a Phase 1 placeholder — Hank's real "
                "personality comes in Phase 2."
            ),
        ),
    )

    await session.generate_reply(
        instructions="Greet the user briefly and ask how you can help."
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
