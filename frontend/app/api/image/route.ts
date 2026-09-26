import { auth } from "@/auth";
import { createToken } from "@/app/lib/auth-token";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

// POST /api/image — proxy image generation to FastAPI → Gemini
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
  const { prompt } = body;
  if (!prompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

  const token = await createToken(user.id);

  try {
    const backendRes = await fetch(`${BACKEND_URL}/image/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt }),
    });

    const data = await backendRes.json().catch(() => ({ error: "Invalid response from AI backend" }));
    return NextResponse.json(data, { status: backendRes.status });
  } catch {
    return NextResponse.json(
      { error: "AI service is temporarily unavailable. Please try again." },
      { status: 502 }
    );
  }
}
