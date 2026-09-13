import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { NextResponse } from "next/server";

// GET /api/conversations — list current user's conversations
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Upsert user on every load to keep data fresh
  const user = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {
      name: session.user.name ?? undefined,
      image: session.user.image ?? undefined,
    },
    create: {
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    },
  });

  const conversations = await prisma.conversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ conversations, userId: user.id });
}

// POST /api/conversations — create new conversation
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
  });

  const body = await req.json().catch(() => ({}));
  const title = body.title || "New Chat";

  const conversation = await prisma.conversation.create({
    data: { userId: user.id, title },
  });

  return NextResponse.json({ conversation });
}
