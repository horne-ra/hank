"""SQLite persistence for Hank sessions + summary generation."""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import openai
from openai import AsyncOpenAI
from sqlmodel import Field, Session, SQLModel, create_engine, select

from agent.prompts import SUMMARY_SYSTEM_PROMPT

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "hank.db"

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    echo=False,
    connect_args={"check_same_thread": False},
)


class HankSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    room_name: str
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
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


def get_session_by_room(room_name: str) -> Optional[int]:
    """Return the most recent session id for a room, or None if not found."""
    with Session(engine) as db:
        stmt = (
            select(HankSession)
            .where(HankSession.room_name == room_name)
            .order_by(HankSession.started_at.desc())  # type: ignore[union-attr]
        )
        row = db.exec(stmt).first()
        return row.id if row else None


def get_summary(session_id: int) -> Optional[dict]:
    with Session(engine) as db:
        row = db.get(HankSession, session_id)
        if row is None or row.summary_json is None:
            return None
        return json.loads(row.summary_json)


async def finalize_session(session_id: int, chat_history: list[dict]) -> None:
    """Save transcript, generate summary via gpt-4.1-mini, persist both."""
    transcript_str = json.dumps(chat_history)

    # Persist transcript and ended_at immediately so they survive even if
    # the summary step fails or is interrupted.
    with Session(engine) as db:
        row = db.get(HankSession, session_id)
        if row is None:
            return
        row.ended_at = datetime.now(timezone.utc)
        row.transcript_json = transcript_str
        db.add(row)
        db.commit()

    summary: dict = {}
    try:
        client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
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
    except (openai.APIError, json.JSONDecodeError) as e:
        summary = {
            "topics_covered": [],
            "key_steps_taught": [],
            "things_user_struggled_with": [],
            "suggested_next_lessons": [],
            "_error": f"Summary generation failed: {e}",
        }

    # Backfill summary in a second commit.
    with Session(engine) as db:
        row = db.get(HankSession, session_id)
        if row is None:
            return
        row.summary_json = json.dumps(summary)
        db.add(row)
        db.commit()
