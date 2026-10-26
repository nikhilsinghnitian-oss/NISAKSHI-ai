import { auth } from "@/auth";
import { createToken } from "@/app/lib/auth-token";
import { readJsonObject } from "@/app/lib/request-validation";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { getOrCreateActiveUser, accountDeletedResponse } from "@/app/lib/account-guard";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const MAX_CHAT_BODY_BYTES = 64 * 1024;
const MAX_MESSAGE_CHARS = 20_000;

// POST /api/chat — authenticated text chat proxy to backend
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await readJsonObject(req, MAX_CHAT_BODY_BYTES);
  if (!parsed.ok) return parsed.response;

  const { message, conversationId } = parsed.value;
  if (
    typeof message !== "string" ||
    !message.trim() ||
    message.length > MAX_MESSAGE_CHARS
  ) {
    return NextResponse.json(
      { error: "Message must be a non-empty string of at most 20,000 characters" },
      { status: 400 }
    );
  }
  if (
    conversationId !== undefined &&
    conversationId !== null &&
    (typeof conversationId !== "string" || conversationId.length > 128)
  ) {
    return NextResponse.json({ error: "Invalid conversation ID" }, { status: 400 });
  }

  try {
    const user = await getOrCreateActiveUser(session.user.email, { name: session.user.name, image: session.user.image });
    if (!user) return accountDeletedResponse();

    const token = await createToken(user.id);
    const backendRes = await fetch(`${BACKEND_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message, conversation_id: conversationId }),
    });

    if (!backendRes.ok || !backendRes.body) {
      return NextResponse.json(
        { error: "AI service is temporarily unavailable. Please try again." },
        { status: backendRes.status || 502 }
      );
    }

    return new Response(backendRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "AI service is temporarily unavailable. Please try again." },
      { status: 502 }
    );
  }
}
