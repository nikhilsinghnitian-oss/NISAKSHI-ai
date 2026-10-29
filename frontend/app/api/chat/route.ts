import { auth } from "@/auth";
import { createToken } from "@/app/lib/auth-token";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";

const configuredBackendUrl = process.env.BACKEND_URL?.trim();
const BACKEND_URL =
  configuredBackendUrl ||
  (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:8000");

function backendErrorMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "The AI backend rejected its service token. Check that AUTH_SECRET matches in Vercel and the backend environment.";
  }
  if (status === 429) {
    return "The AI service rate limit has been reached. Check the model-provider quota and retry shortly.";
  }
  if (status >= 500) {
    return "The AI backend failed. Check its service logs and Gemini API configuration or quota.";
  }
  return "The AI backend returned an unexpected response.";
}

// POST /api/chat — authenticated text chat proxy to backend
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

  const body = await req.json().catch(() => ({}));
  const { message, conversationId } = body;
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }
  if (message.length > 20000) {
    return NextResponse.json(
      { error: "Message is too long. Please keep it under 20,000 characters." },
      { status: 413 }
    );
  }

  const token = await createToken(user.id);

  try {
    const backendRes = await fetch(`${BACKEND_URL.replace(/\/+$/, "")}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message: message.trim(), conversation_id: conversationId }),
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
    // Do not log prompts, tokens, provider responses, or environment values.
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
