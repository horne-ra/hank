"""HankTutor Agent — wraps the system prompt into a LiveKit Agent."""
from livekit.agents import Agent
from livekit.agents import llm
from livekit.agents.types import NOT_GIVEN, NotGivenOr

from agent.prompts import HANK_SYSTEM_PROMPT


class HankTutor(Agent):
    def __init__(
        self,
        extra_instructions: str | None = None,
        *,
        chat_ctx: NotGivenOr[llm.ChatContext | None] = NOT_GIVEN,
    ) -> None:
        instructions = HANK_SYSTEM_PROMPT
        if extra_instructions:
            instructions = f"{HANK_SYSTEM_PROMPT}\n\n{extra_instructions}"
        super().__init__(instructions=instructions, chat_ctx=chat_ctx)
