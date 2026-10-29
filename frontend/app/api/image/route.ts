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

// POST /api/image — proxy image generation to FastAPI → Gemini
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!BACKEND_URL) {
    return NextResponse.json(
      {
        success: false,
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
  const { prompt } = body;
  if (typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ success: false, error: "Prompt required" }, { status: 400 });
  }
  if (prompt.length > 12000) {
    return NextResponse.json(
      { success: false, error: "Prompt is too long. Please keep it under 12,000 characters." },
      { status: 413 }
    );
  }

  const token = await createToken(user.id);

  try {
    const backendRes = await fetch(`${BACKEND_URL.replace(/\/+$/, "")}/image/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt: prompt.trim() }),
      cache: "no-store",
    });

    if (!backendRes.ok) {
      console.error("[api/image] Backend returned non-success status:", backendRes.status);
      return NextResponse.json(
        { success: false, error: backendErrorMessage(backendRes.status), code: "BACKEND_REQUEST_FAILED" },
        { status: backendRes.status >= 400 && backendRes.status <= 599 ? backendRes.status : 502 }
      );
    }

    const data = await backendRes.json().catch(() => null);
    if (!data || typeof data !== "object") {
      return NextResponse.json(
        { success: false, error: "The AI backend returned an invalid response.", code: "INVALID_BACKEND_RESPONSE" },
        { status: 502 }
      );
    }
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    const errorType = error instanceof Error ? error.name : "UnknownError";
    console.error("[api/image] Backend request could not be completed:", errorType);
    return NextResponse.json(
      {
        success: false,
        error: "Cannot reach the AI backend. Check BACKEND_URL and confirm the backend service is running.",
        code: "BACKEND_UNREACHABLE",
      },
      { status: 502 }
    );
  }
}
