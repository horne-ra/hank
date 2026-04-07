"""HankTutor Agent — wraps the system prompt into a LiveKit Agent."""
from livekit.agents import Agent

from agent.prompts import HANK_SYSTEM_PROMPT


class HankTutor(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=HANK_SYSTEM_PROMPT)
