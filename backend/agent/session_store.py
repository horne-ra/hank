"""SQLite persistence for Hank sessions + summary generation."""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from openai import AsyncOpenAI
from sqlmodel import Field, Session, SQLModel, create_engine, select

from agent.prompts import SUMMARY_SYSTEM_PROMPT

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "hank.db"

engine = create_engine(f"sqlite:///{DB_PATH}", echo=False)


class HankSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    room_name: str
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    transcript_json: Optional[str] = None
    summary_json: Optional[str] = None


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def create_session(room_name: str) -> int:
    with Session(engine) as db:
        row = HankSession(room_name=room_name)
        db.add(row)
        db.commit()
        db.refresh(row)
        assert row.id is not None
        return row.id


def get_summary(session_id: int) -> Optional[dict]:
    with Session(engine) as db:
        row = db.get(HankSession, session_id)
        if row is None or row.summary_json is None:
            return None
        return json.loads(row.summary_json)


async def finalize_session(session_id: int, chat_history: list[dict]) -> None:
    """Save transcript, generate summary via gpt-4.1-mini, persist both."""
    transcript_str = json.dumps(chat_history)

    summary: dict = {}
    try:
        client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
        # Build a simple text rendering for the summarizer
        rendered = "\n".join(
            f"{turn.get('role', 'unknown').upper()}: {turn.get('content', '')}"
            for turn in chat_history
            if turn.get("content")
        )
        response = await client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
                {"role": "user", "content": rendered or "(no conversation)"},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        content = response.choices[0].message.content or "{}"
        summary = json.loads(content)
    except Exception as e:
        summary = {
            "topics_covered": [],
            "key_steps_taught": [],
            "things_user_struggled_with": [],
            "suggested_next_lessons": [],
            "_error": f"Summary generation failed: {e}",
        }

    with Session(engine) as db:
        row = db.get(HankSession, session_id)
        if row is None:
            return
        row.ended_at = datetime.utcnow()
        row.transcript_json = transcript_str
        row.summary_json = json.dumps(summary)
        db.add(row)
        db.commit()
