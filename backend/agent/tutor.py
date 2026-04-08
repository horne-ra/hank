"""HankTutor Agent — wraps the system prompt into a LiveKit Agent."""
from livekit.agents import Agent

from agent.prompts import HANK_SYSTEM_PROMPT


class HankTutor(Agent):
    def __init__(self, extra_instructions: str | None = None) -> None:
        instructions = HANK_SYSTEM_PROMPT
        if extra_instructions:
            instructions = f"{HANK_SYSTEM_PROMPT}\n\n{extra_instructions}"
        super().__init__(instructions=instructions)
