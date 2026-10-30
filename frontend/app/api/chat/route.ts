import { auth } from "@/auth";
import { createToken } from "@/app/lib/auth-token";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";

export const runtime = "nodejs";

const configuredBackendUrl = process.env.BACKEND_URL?.trim();
const BACKEND_URL =
  configuredBackendUrl ||
  (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:8000");

const MAX_MESSAGE_LENGTH = 20000;
const MAX_FILES = 5;
const MAX_TOTAL_FILE_BYTES = 4 * 1024 * 1024;
const ACCEPTED_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function backendErrorMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "The AI backend rejected its service token. Check that AUTH_SECRET matches in Vercel and the backend environment.";
  }
  if (status === 413) {
    return "The attachment is too large. Keep all attached files together under 4 MB.";
  }
  if (status === 415) {
    return "Unsupported or invalid file. Upload a valid PDF, JPG, PNG, or WEBP file.";
  }
  if (status === 429) {
    return "The AI service rate limit has been reached. Check the model-provider quota and retry shortly.";
  }
  if (status >= 500) {
    return "The AI backend failed. Check its service logs and Gemini API configuration or quota.";
  }
  return "The AI backend returned an unexpected response.";
}

// POST /api/chat — authenticated text and multimodal chat proxy.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!BACKEND_URL) {
    return NextResponse.json(
      {
        error:
          "AI backend is not configured. Add BACKEND_URL in Vercel → Settings → Environment Variables, then redeploy.",
        code: "BACKEND_URL_MISSING",
      },
      { status: 503 }
    );
  }

  let message = "";
  let conversationId = "";
  let model = "";
  let files: File[] = [];

  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.toLowerCase().includes("multipart/form-data")) {
      const incoming = await req.formData();
      const messageValue = incoming.get("message");
      const conversationValue = incoming.get("conversationId");
      const modelValue = incoming.get("model");
      message = typeof messageValue === "string" ? messageValue : "";
      conversationId = typeof conversationValue === "string" ? conversationValue : "";
      model = typeof modelValue === "string" ? modelValue : "";
      files = incoming.getAll("files").filter((entry): entry is File => entry instanceof File);
    } else {
      // Keep compatibility with older JSON-only chat callers.
      const body = await req.json().catch(() => ({}));
      message = typeof body.message === "string" ? body.message : "";
      conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
      model = typeof body.model === "string" ? body.model : "";
    }
  } catch {
    return NextResponse.json({ error: "Could not read the chat request." }, { status: 400 });
  }

  if (!message.trim() && files.length === 0) {
    return NextResponse.json({ error: "Enter a message or attach a file." }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: "Message is too long. Please keep it under 20,000 characters." },
      { status: 413 }
    );
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Attach up to ${MAX_FILES} files per message.` }, { status: 413 });
  }

  let totalBytes = 0;
  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const expectedType = ACCEPTED_TYPES[extension];
    if (!expectedType || (file.type && file.type !== expectedType && file.type !== "application/octet-stream")) {
      return NextResponse.json(
        { error: "Only valid PDF, JPG, JPEG, and PNG/WEBP image files are supported." },
        { status: 415 }
      );
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: `${file.name} is empty.` }, { status: 400 });
    }
    totalBytes += file.size;
  }
  if (totalBytes > MAX_TOTAL_FILE_BYTES) {
    return NextResponse.json(
      { error: "The combined attachment size must be 4 MB or less." },
      { status: 413 }
    );
  }

  const user = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {},
    create: {
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    },
    select: { id: true },
  });

  const token = await createToken(user.id);
  const backendForm = new FormData();
  backendForm.append("message", message.trim());
  if (model) backendForm.append("model", model);
  if (conversationId) backendForm.append("conversation_id", conversationId);
  files.forEach((file) => backendForm.append("files", file, file.name));

  try {
    const backendRes = await fetch(`${BACKEND_URL.replace(/\/+$/, "")}/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: backendForm,
      cache: "no-store",
    });

    if (!backendRes.ok || !backendRes.body) {
      console.error("[api/chat] Backend returned non-success status:", backendRes.status);
      return NextResponse.json(
        {
          error: backendErrorMessage(backendRes.status),
          code: "BACKEND_REQUEST_FAILED",
        },
        { status: backendRes.status >= 400 && backendRes.status <= 599 ? backendRes.status : 502 }
      );
    }

    return new Response(backendRes.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    // Do not log prompts, file contents, tokens, provider responses, or environment values.
    const errorType = error instanceof Error ? error.name : "UnknownError";
    console.error("[api/chat] Backend request could not be completed:", errorType);
    return NextResponse.json(
      {
        error:
          "Cannot reach the AI backend. Check BACKEND_URL and confirm the backend service is running.",
        code: "BACKEND_UNREACHABLE",
      },
      { status: 502 }
    );
  }
}
