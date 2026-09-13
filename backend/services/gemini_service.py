"""
Gemini Service — Unified Google Gemini API abstraction.
Handles text generation (streaming) and native image generation.
Includes automatic model fallback rotation for free-tier rate limits.
"""

import base64
import os
import re
import logging

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# ─── Text model configuration with fallback rotation ───
# Free tier allows ~20 requests/day/model.  By rotating through
# multiple models we effectively multiply the daily budget.
TEXT_MODEL = os.getenv("GEMINI_TEXT_MODEL", "gemini-3.5-flash")

TEXT_FALLBACKS = [
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
]

# ─── Image model configuration ───
IMAGE_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image")

IMAGE_FALLBACKS = [
    "gemini-3.1-flash-image",
    "gemini-3-pro-image",
    "gemini-2.5-flash-image",
]

# ─── Intent detection ───

TEXT_KEYWORDS = [
    "code", "program", "script", "function", "algorithm",
    "study plan", "plan", "notes", "summary", "essay",
    "solution", "explanation", "question", "quiz", "syllabus"
]

IMAGE_REGEX = re.compile(
    r"(^(draw|paint|sketch|illustrate)\b)|"
    r"(\b(generate|create|make|draw|paint|sketch|illustrate)\s+(an?\s+)?(image|picture|poster|logo|drawing|photo|portrait|illustration|wallpaper|artwork)\b)|"
    r"(\b(generate|create|draw|paint|render)\s+(a|an)\s+.*?\b(castle|city|car|landscape|sunset|mountain|portrait|tiger|lion|cat|dog|robot|tree|forest|space|planet|star|galaxy|room|building|scene|scenery|character|avatar|creature|dragon)\b)",
    re.IGNORECASE
)


def is_image_request(message: str) -> bool:
    """Detect whether the user wants image generation."""
    lower = message.lower().strip()
    for kw in TEXT_KEYWORDS:
        if kw in lower:
            return False
    return bool(IMAGE_REGEX.search(message))


def _is_rate_limit(err: str) -> bool:
    """Check if error string indicates a rate limit / quota exhaustion."""
    return "429" in err or "RESOURCE_EXHAUSTED" in err


def _classify_error(err: str) -> str:
    """Map a Gemini exception string to a user-facing message."""
    if _is_rate_limit(err):
        return "AI generation is temporarily rate limited. Please try again in a moment."
    if "403" in err or "PERMISSION_DENIED" in err:
        return "AI service access denied. Please check configuration."
    if "404" in err or "NOT_FOUND" in err:
        return "Selected AI model is temporarily unavailable."
    if "API_KEY" in err or "401" in err:
        return "AI service is not configured on the server."
    return "AI service is temporarily unavailable. Please try again."


def stream_text(client: genai.Client, message: str, model: str | None = None):
    """
    Generator that yields text chunks from Gemini streaming.
    Yields dicts: {"text": str} or {"error": str}.

    If the primary model is rate-limited, automatically tries fallback
    models before returning an error.
    """
    primary = model or TEXT_MODEL
    candidates = [primary]
    for fb in TEXT_FALLBACKS:
        if fb not in candidates:
            candidates.append(fb)

    config = types.GenerateContentConfig(
        system_instruction=(
            "You are NISAKSHI AI, a personal AI tutor and creator designed for "
            "students and engineers. Always introduce or refer to yourself only "
            "as NISAKSHI AI."
        )
    )

    last_error = ""

    for target_model in candidates:
        try:
            logger.info(f"Trying text model: {target_model}")
            got_data = False
            for chunk in client.models.generate_content_stream(
                model=target_model,
                contents=message,
                config=config,
            ):
                text = chunk.text
                if text:
                    got_data = True
                    yield {"text": text}
            # If we successfully streamed data, we're done
            if got_data:
                return
            # Empty stream — try next model
            logger.warning(f"{target_model} returned empty stream, trying next")
            last_error = "AI service returned an empty response."
            continue

        except Exception as e:
            err = str(e)
            logger.error(f"Gemini text error on {target_model}: {err}")

            if _is_rate_limit(err):
                # This model's quota is exhausted — try the next one
                last_error = err
                logger.info(f"{target_model} rate limited, trying next fallback")
                continue

            # Non-rate-limit errors are not retryable across models
            yield {"error": _classify_error(err)}
            return

    # All models exhausted
    logger.error(f"All text models exhausted. Last error: {last_error}")
    yield {"error": "AI generation is temporarily rate limited. Please try again in a moment."}


def generate_image(client: genai.Client, prompt: str, model: str | None = None) -> dict:
    """
    Generate an image using Gemini's native image generation capability.
    Uses generate_content with response_modalities=['IMAGE'].
    """
    primary = model or IMAGE_MODEL
    candidates_to_try = [primary]
    for fb in IMAGE_FALLBACKS:
        if fb not in candidates_to_try:
            candidates_to_try.append(fb)

    last_error = ""

    for target_model in candidates_to_try:
        try:
            response = client.models.generate_content(
                model=target_model,
                contents=f"Generate an image: {prompt}",
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"]
                ),
            )

            if not response.candidates:
                last_error = "No image was generated. Try a different prompt."
                continue

            for part in response.candidates[0].content.parts:
                if hasattr(part, "inline_data") and part.inline_data and part.inline_data.data:
                    image_bytes = part.inline_data.data
                    mime_type = part.inline_data.mime_type or "image/png"
                    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
                    return {
                        "success": True,
                        "type": "image",
                        "mime_type": mime_type,
                        "data": image_b64,
                        "model": target_model,
                    }

            last_error = "Image generation completed but no image data was returned."
            continue

        except Exception as e:
            err = str(e)
            logger.error(f"Gemini image error on {target_model}: {err}")
            if "429" in err or "RESOURCE_EXHAUSTED" in err:
                last_error = "AI generation is temporarily rate limited. Please try again in a moment."
                continue
            elif "403" in err or "PERMISSION_DENIED" in err:
                last_error = "AI image generation access denied. Please check configuration."
                continue
            elif "404" in err or "NOT_FOUND" in err:
                last_error = "Selected image model is temporarily unavailable."
                continue
            elif "API_KEY" in err or "401" in err:
                return {"success": False, "error": "AI service is not configured on the server."}
            else:
                last_error = "AI service is temporarily unavailable. Please try again."
                continue

    return {"success": False, "error": last_error or "Image generation failed. Please try again."}
