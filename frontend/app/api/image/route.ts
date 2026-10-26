import { auth } from "@/auth";
import { createToken } from "@/app/lib/auth-token";
import { readJsonObject } from "@/app/lib/request-validation";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { getOrCreateActiveUser, accountDeletedResponse } from "@/app/lib/account-guard";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const MAX_IMAGE_BODY_BYTES = 16 * 1024;
const MAX_PROMPT_CHARS = 4_000;

// POST /api/image — authenticated image-generation proxy
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await readJsonObject(req, MAX_IMAGE_BODY_BYTES);
  if (!parsed.ok) return parsed.response;

  const { prompt } = parsed.value;
  if (
    typeof prompt !== "string" ||
    !prompt.trim() ||
    prompt.length > MAX_PROMPT_CHARS
  ) {
    return NextResponse.json(
      { error: "Prompt must be a non-empty string of at most 4,000 characters" },
      { status: 400 }
    );
  }

  try {
    const user = await getOrCreateActiveUser(session.user.email, { name: session.user.name, image: session.user.image });
    if (!user) return accountDeletedResponse();

    const token = await createToken(user.id);
    const backendRes = await fetch(`${BACKEND_URL}/image/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt }),
    });

    const data = await backendRes.json().catch(() => ({
      error: "Invalid response from AI backend",
    }));
    return NextResponse.json(data, {
      status: backendRes.status,
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch {
    return NextResponse.json(
      { error: "AI service is temporarily unavailable. Please try again." },
      { status: 502, headers: { "Cache-Control": "no-store, private" } }
    );
  }
}
