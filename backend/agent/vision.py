"""Vision analysis for user-uploaded session images (OpenAI chat + image)."""

import asyncio
import base64
import os
from pathlib import Path

from openai import AsyncOpenAI

from agent.prompts import IMAGE_ANALYSIS_SYSTEM_PROMPT

_VISION_MODEL = "gpt-5.4-mini"


def _mime_for_path(image_path: str) -> str:
    ext = Path(image_path).suffix.lower().lstrip(".")
    if ext in ("jpg", "jpeg"):
        return "image/jpeg"
    if ext == "png":
        return "image/png"
    if ext == "webp":
        return "image/webp"
    if ext in ("heic", "heif"):
        return "image/heic"
    return "image/jpeg"


def _read_image_sync(path: str) -> bytes:
    return Path(path).read_bytes()


async def analyze_image(image_path: str) -> str:
    data = await asyncio.to_thread(_read_image_sync, image_path)
    mime = _mime_for_path(image_path)
    b64 = base64.b64encode(data).decode("ascii")
    data_url = f"data:{mime};base64,{b64}"

    client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
    response = await client.chat.completions.create(
        model=_VISION_MODEL,
        temperature=0.2,
        max_tokens=300,
        messages=[
            {"role": "system", "content": IMAGE_ANALYSIS_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": data_url},
                    }
                ],
            },
        ],
    )
    content = response.choices[0].message.content
    return (content or "").strip()
