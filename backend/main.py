import json
import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from security import RequestBodyLimitMiddleware, get_user_id
from services.self_hosted_service import (
    check_text_model_server,
    generate_image,
    stream_text,
)

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="NISAKSHI AI API")

# The Next.js server proxy does not require CORS. Browser-to-backend traffic is
# limited to an explicit allowlist for deployments that use it directly.
frontend_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.add_middleware(
    RequestBodyLimitMiddleware,
    limits={"/chat": 64 * 1024, "/image/generate": 16 * 1024},
)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=20000)
    model: str | None = Field(default=None, max_length=120)
    conversation_id: str | None = Field(default=None, max_length=128)


class ImageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prompt: str = Field(min_length=1, max_length=4000)
    model: str | None = Field(default=None, max_length=120)


@app.get("/")
def root():
    return {"message": "NISAKSHI AI API"}


@app.get("/health")
def health():
    # Liveness only; do not expose secrets or internal configuration.
    return {"status": "healthy"}


@app.get("/ready")
def ready():
    ready_state, reason = check_text_model_server()
    if not ready_state:
        # Deliberately return only a generic state, not URLs or provider details.
        raise HTTPException(status_code=503, detail={"status": "not_ready", "reason": reason})
    return {"status": "ready"}


@app.post("/chat")
def chat(request: ChatRequest, authorization: str = Header(default="")):
    get_user_id(authorization)
    if not request.message.strip():
        raise HTTPException(status_code=422, detail="Message must not be blank")

    def model_stream():
        for update in stream_text(None, request.message, model=request.model):
            yield f"data: {json.dumps(update)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        model_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.post("/image/generate")
def gen_image(request: ImageRequest, authorization: str = Header(default="")):
    get_user_id(authorization)
    if not request.prompt.strip():
        raise HTTPException(status_code=422, detail="Prompt must not be blank")

    result = generate_image(None, request.prompt, model=request.model)
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


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
