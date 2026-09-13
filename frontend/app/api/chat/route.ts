import { auth } from "@/auth";
import { createToken } from "@/app/lib/auth-token";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// POST /api/chat — authenticated text chat proxy to backend
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const token = await createToken(user.id);

  try {
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

    // Forward the SSE stream directly to the client
    return new Response(backendRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "AI service is temporarily unavailable. Please try again." },
      { status: 502 }
    );
  }
}
