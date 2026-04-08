"""FastAPI token server: mints LiveKit JWTs and serves session summaries."""

import logging
import os
import uuid
from pathlib import Path

from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from livekit import api
from pydantic import BaseModel

from agent.session_store import (
    create_session,
    get_session_by_room,
    get_session_detail,
    get_summary,
    init_db,
    list_sessions,
)

logger = logging.getLogger(__name__)

# Repo root (parent of backend/) and backend/ — either location may hold .env
_backend_dir = Path(__file__).resolve().parent
_repo_root = _backend_dir.parent
load_dotenv(_repo_root / ".env")
load_dotenv(_backend_dir / ".env")

_REQUIRED_ENV_VARS = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]
_missing = [v for v in _REQUIRED_ENV_VARS if not os.environ.get(v)]
if _missing:
    raise RuntimeError(
        f"Missing required environment variable(s): {', '.join(_missing)}. "
        "Copy .env.example to .env at the project root or in backend/, fill in "
        "LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET, then restart."
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Hank Token Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TokenRequest(BaseModel):
    room_name: str | None = None
    participant_name: str | None = None
    resume_from_session_id: int | None = None


class TokenResponse(BaseModel):
    token: str
    url: str
    room_name: str
    session_id: int


# The /token endpoint is intentionally unauthenticated.
#
# The LiveKit JWT returned here is scoped to a single room name, grants only
# the permissions needed for that room, and expires in ~6 hours. That JWT is
# the actual auth boundary for the voice session.
#
# In production behind a real frontend, this route would sit behind app-level
# auth (the user must be logged in to mint a token tied to their identity),
# but layering a separate shared-secret check here adds operational complexity
# for a take-home without strengthening the security model.
@app.post("/token", response_model=TokenResponse)
def create_token(req: TokenRequest) -> TokenResponse:
    livekit_url = os.environ["LIVEKIT_URL"]
    api_key = os.environ["LIVEKIT_API_KEY"]
    api_secret = os.environ["LIVEKIT_API_SECRET"]

    room_name = req.room_name or f"hank-{uuid.uuid4().hex[:8]}"
    participant_name = req.participant_name or f"user-{uuid.uuid4().hex[:6]}"

    session_id = get_session_by_room(room_name) or create_session(
        room_name,
        resume_from_session_id=req.resume_from_session_id,
    )

    token = (
        api.AccessToken(api_key, api_secret)
        .with_identity(participant_name)
        .with_name(participant_name)
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
            )
        )
        .to_jwt()
    )

    logger.info("Token issued for room=%s participant=%s", room_name, participant_name)

    return TokenResponse(
        token=token, url=livekit_url, room_name=room_name, session_id=session_id
    )


@app.get("/sessions")
def sessions_list(limit: int = 20) -> list[dict]:
    """List recent sessions with metadata, newest first."""
    return list_sessions(limit=limit)


@app.get("/sessions/{session_id}")
def session_detail_endpoint(session_id: int) -> dict:
    """Get full details for a single session, including its summary."""
    detail = get_session_detail(session_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return detail


@app.get("/sessions/{session_id}/summary")
def session_summary(session_id: int) -> dict:
    summary = get_summary(session_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="Summary not found")
    return summary


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}
