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
# Keep the API process bootable so health diagnostics can still run if a key is missing.
# Never log or return the key itself.
client = genai.Client(api_key=api_key) if api_key else None

app = FastAPI(title="NISAKSHI AI API")

allowed_origins = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
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
    return {"status": "healthy", "gemini_configured": client is not None}


@app.get("/ready")
def ready():
    if not os.getenv("AUTH_SECRET", "").strip():
        raise HTTPException(status_code=503, detail="Backend AUTH_SECRET is not configured")
    if client is None:
        raise HTTPException(status_code=503, detail="Backend GEMINI_API_KEY is not configured")
    return {"status": "ready"}


# ─────────────────────────────────────────────
# Protected: Chat (Gemini Text Streaming)
# ─────────────────────────────────────────────

@app.post("/chat")
def chat(
    request: ChatRequest,
    authorization: str = Header(default=""),
):
    user_id = get_user_id(authorization)
    if client is None:
        raise HTTPException(
            status_code=503,
            detail="The backend GEMINI_API_KEY is not configured. Add it to the backend deployment environment.",
        )

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
    if client is None:
        raise HTTPException(
            status_code=503,
            detail="The backend GEMINI_API_KEY is not configured. Add it to the backend deployment environment.",
        )

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


# ─────────────────────────────────────────────
# Run with: python main.py
# Respects PORT env var for cloud deployment.
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port)