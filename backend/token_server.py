"""FastAPI token server: mints LiveKit JWTs and serves session summaries."""

import os
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from livekit import api
from pydantic import BaseModel

from agent.session_store import get_summary, init_db

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

_REQUIRED_ENV_VARS = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]
_missing = [v for v in _REQUIRED_ENV_VARS if not os.environ.get(v)]
if _missing:
    raise RuntimeError(
        f"Missing required environment variable(s): {', '.join(_missing)}. "
        "Set them in the project-root .env file or export them in your shell."
    )

app = FastAPI(title="Hank Token Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


class TokenRequest(BaseModel):
    room_name: str | None = None
    participant_name: str | None = None


class TokenResponse(BaseModel):
    token: str
    url: str
    room_name: str


@app.post("/token", response_model=TokenResponse)
def create_token(req: TokenRequest) -> TokenResponse:
    livekit_url = os.environ["LIVEKIT_URL"]
    api_key = os.environ["LIVEKIT_API_KEY"]
    api_secret = os.environ["LIVEKIT_API_SECRET"]

    room_name = req.room_name or f"hank-{uuid.uuid4().hex[:8]}"
    participant_name = req.participant_name or f"user-{uuid.uuid4().hex[:6]}"

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

    return TokenResponse(token=token, url=livekit_url, room_name=room_name)


@app.get("/sessions/{session_id}/summary")
def session_summary(session_id: int) -> dict:
    summary = get_summary(session_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="Summary not found")
    return summary


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}
