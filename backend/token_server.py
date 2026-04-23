"""FastAPI token server: mints LiveKit JWTs and serves session summaries."""

import logging
import os
import uuid
from pathlib import Path

from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from livekit import api
from pydantic import BaseModel

from agent.session_store import (
    DATA_DIR,
    create_session,
    get_session_by_room,
    get_session_detail,
    get_summary,
    init_db,
    list_sessions,
    session_exists,
)

logger = logging.getLogger(__name__)

MAX_IMAGE_BYTES = 10 * 1024 * 1024
_ALLOWED_IMAGE_MIMES = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
)
_MIME_TO_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heic",
}


def _ext_from_upload_filename(filename: str | None) -> str | None:
    if not filename:
        return None
    lower = filename.lower()
    for suffix, ext in (
        (".jpeg", "jpg"),
        (".jpg", "jpg"),
        (".png", "png"),
        (".webp", "webp"),
        (".heic", "heic"),
        (".heif", "heic"),
    ):
        if lower.endswith(suffix):
            return ext
    return None


def _resolve_image_mime(content_type: str | None, filename: str | None) -> str:
    raw = (content_type or "").split(";")[0].strip().lower()
    if raw in _ALLOWED_IMAGE_MIMES:
        return raw
    ext = _ext_from_upload_filename(filename)
    if ext is None:
        raise HTTPException(status_code=415, detail="Unsupported media type")
    # Infer MIME when missing, generic, or wrong (trust extension for upload field)
    if raw in ("", "application/octet-stream"):
        return {
            "jpg": "image/jpeg",
            "png": "image/png",
            "webp": "image/webp",
            "heic": "image/heic",
        }[ext]
    raise HTTPException(status_code=415, detail="Unsupported media type")


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
    initial_message: str | None = None


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
        initial_message=req.initial_message,
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


@app.post("/sessions/{session_id}/images")
async def upload_session_image(
    session_id: int,
    request: Request,
    image: UploadFile = File(...),
) -> dict:
    """Accept one image per session; stored on disk for the agent worker."""
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail="Session not found")

    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > MAX_IMAGE_BYTES:
                raise HTTPException(status_code=413, detail="Image too large")
        except ValueError:
            pass

    mime = _resolve_image_mime(image.content_type, image.filename)
    ext = _MIME_TO_EXT[mime]

    image_id = str(uuid.uuid4())
    dest_dir = (DATA_DIR / "images" / str(session_id)).resolve()
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / f"{image_id}.{ext}"

    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await image.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Image too large")
        chunks.append(chunk)

    if total == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    data = b"".join(chunks)
    dest_path.write_bytes(data)
    logger.info("Stored image session_id=%s image_id=%s path=%s", session_id, image_id, dest_path)

    return {"image_id": image_id, "path": str(dest_path.resolve())}


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}
