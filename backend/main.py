import hashlib
import hmac
import json
import os
import time
import base64
import logging

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from google import genai
from services.gemini_service import stream_text, generate_image, is_image_request

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise RuntimeError("GEMINI_API_KEY is missing in .env")

client = genai.Client(api_key=api_key)

app = FastAPI(title="NISAKSHI AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# HMAC Token Verification
# ─────────────────────────────────────────────

def _b64url_decode(s: str) -> bytes:
    s = s.replace("-", "+").replace("_", "/")
    padding = 4 - len(s) % 4
    if padding != 4:
        s += "=" * padding
    return base64.b64decode(s)


def verify_token(token: str) -> str:
    secret = os.getenv("AUTH_SECRET", "")
    if not secret:
        raise HTTPException(status_code=500, detail="AUTH_SECRET not configured")

    try:
        parts = token.split(".")
        if len(parts) != 2:
            raise ValueError("Bad token format")

        payload_b64, sig_b64 = parts
        payload_bytes = _b64url_decode(payload_b64)
        sig_bytes = _b64url_decode(sig_b64)

        expected = hmac.new(
            secret.encode(),
            payload_bytes,
            hashlib.sha256,
        ).digest()

        if not hmac.compare_digest(expected, sig_bytes):
            raise ValueError("Invalid signature")

        payload = json.loads(payload_bytes.decode())
        now = int(time.time())
        if payload.get("exp", 0) < now:
            raise ValueError("Token expired")

        user_id = payload.get("userId")
        if not user_id:
            raise ValueError("No userId in token")

        return user_id

    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Unauthorized: {e}") from e


def get_user_id(authorization: str) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization[7:]
    return verify_token(token)


# ─────────────────────────────────────────────
# Request Models
# ─────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    model: str | None = None
    conversation_id: str | None = None


class ImageRequest(BaseModel):
    prompt: str
    model: str | None = None


# ─────────────────────────────────────────────
# Public Endpoints
# ─────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "NISAKSHI AI Backend 🚀"}


@app.get("/health")
def health():
    return {"status": "healthy"}


# ─────────────────────────────────────────────
# Protected: Chat (Gemini Text Streaming)
# ─────────────────────────────────────────────

@app.post("/chat")
def chat(
    request: ChatRequest,
    authorization: str = Header(default=""),
):
    user_id = get_user_id(authorization)

    def gemini_stream():
        for update in stream_text(client, request.message, model=request.model):
            yield f"data: {json.dumps(update)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(gemini_stream(), media_type="text/event-stream")


# ─────────────────────────────────────────────
# Protected: Image Generation (Gemini)
# ─────────────────────────────────────────────

@app.post("/image/generate")
def gen_image(
    request: ImageRequest,
    authorization: str = Header(default=""),
):
    user_id = get_user_id(authorization)

    result = generate_image(client, request.prompt, model=request.model)

    if not result.get("success"):
        return {
            "success": False,
            "error": result.get("error", "Image generation failed. Please try again."),
        }

    data_uri = f"data:{result['mime_type']};base64,{result['data']}"
    return {
        "success": True,
        "type": "image",
        "mime_type": result.get("mime_type", "image/png"),
        "data": result.get("data"),
        "image_url": data_uri,
        "model": result.get("model"),
    }