"""SQLite persistence for Hank sessions + summary generation."""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import openai
from openai import AsyncOpenAI
from sqlalchemy import text
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
    resume_from_session_id: Optional[int] = None
    initial_message: Optional[str] = None


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    with engine.connect() as conn:
        conn.execute(text("PRAGMA journal_mode=WAL"))
        conn.commit()


def create_session(
    room_name: str,
    resume_from_session_id: Optional[int] = None,
    initial_message: Optional[str] = None,
) -> int:
    with Session(engine) as db:
        row = HankSession(
            room_name=room_name,
            resume_from_session_id=resume_from_session_id,
            initial_message=initial_message,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        assert row.id is not None
        return row.id


def get_initial_message(session_id: int) -> Optional[str]:
    with Session(engine) as db:
        row = db.get(HankSession, session_id)
        return row.initial_message if row else None


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


def list_sessions(limit: int = 20) -> list[dict]:
    """Return recent sessions with metadata, newest first.

    Includes both completed sessions (with summary) and in-flight sessions
    (ended_at set but summary_json still null) so the frontend can show
    a 'generating' state for sessions whose summary is still being written.
    """
    with Session(engine) as db:
        stmt = (
            select(HankSession)
            .where(HankSession.ended_at.is_not(None))  # type: ignore[union-attr]
            .order_by(HankSession.started_at.desc())  # type: ignore[union-attr]
            .limit(limit)
        )
        rows = db.exec(stmt).all()

        result = []
        for row in rows:
            summary = json.loads(row.summary_json) if row.summary_json else None
            if summary:
                title = (
                    summary.get("session_title")
                    or (summary.get("topics_covered") or [None])[0]
                    or "Hank session"
                )
            else:
                title = None

            result.append(
                {
                    "id": row.id,
                    "title": title,
                    "started_at": row.started_at.isoformat() if row.started_at else None,
                    "ended_at": row.ended_at.isoformat() if row.ended_at else None,
                    "summary_ready": summary is not None,
                }
            )
        return result


def get_session_detail(session_id: int) -> Optional[dict]:
    """Return full session details including summary, for the detail view."""
    with Session(engine) as db:
        row = db.get(HankSession, session_id)
        if row is None:
            return None
        summary = json.loads(row.summary_json) if row.summary_json else None
        return {
            "id": row.id,
            "started_at": row.started_at.isoformat() if row.started_at else None,
            "ended_at": row.ended_at.isoformat() if row.ended_at else None,
            "summary": summary,
            "summary_ready": summary is not None,
            "resume_from_session_id": row.resume_from_session_id,
        }


def get_resume_context(session_id: int) -> Optional[dict]:
    """Get the resume_from session's summary, called by the worker on start.

    Returns None if the current session isn't a resume, or if the previous
    session has no summary yet.
    """
    with Session(engine) as db:
        current = db.get(HankSession, session_id)
        if current is None or current.resume_from_session_id is None:
            return None
        previous = db.get(HankSession, current.resume_from_session_id)
        if previous is None or previous.summary_json is None:
            return None
        return json.loads(previous.summary_json)


def _coerce_transcript_role(raw: object) -> Optional[str]:
    """Map stored role strings (including str(ChatRole)) to user/assistant/system."""
    if raw is None:
        return None
    s = str(raw).strip().lower()
    if "." in s:
        s = s.rsplit(".", 1)[-1]
    if s in ("user", "assistant", "system"):
        return s
    if s == "developer":
        return "system"
    return None


def get_resume_transcript(session_id: int) -> Optional[list[dict]]:
    """Load the previous session's full transcript for replay into a new session.

    Returns the parsed list of {role, content} message dicts from the previous
    session pointed to by `resume_from_session_id`. Returns None if:
    - The current session isn't a resume
    - The previous session doesn't exist
    - The previous session has no transcript yet
    - The transcript JSON is corrupt
    """
    with Session(engine) as db:
        current = db.get(HankSession, session_id)
        if current is None or current.resume_from_session_id is None:
            return None
        previous = db.get(HankSession, current.resume_from_session_id)
        if previous is None or previous.transcript_json is None:
            return None
        try:
            history = json.loads(previous.transcript_json)
            if not isinstance(history, list):
                return None
            valid: list[dict] = []
            for msg in history:
                if not isinstance(msg, dict):
                    continue
                role = _coerce_transcript_role(msg.get("role"))
                content = msg.get("content")
                if role is None or not content:
                    continue
                valid.append({"role": role, "content": str(content)})
            return valid if valid else None
        except (json.JSONDecodeError, TypeError):
            return None


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
            "session_title": "Session summary",
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
