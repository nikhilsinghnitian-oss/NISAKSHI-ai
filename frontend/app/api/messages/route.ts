import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { NextResponse } from "next/server";

// POST /api/messages — save a message to a conversation
export async function POST(req: Request) {
  try {
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
    const { conversationId, role, content, model, imageUrl, videoUrl } = body;

    if (!conversationId || !role || content === undefined) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Verify conversation ownership before saving message
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    if (conversation.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        role,
        content: content || "",
        model: model ?? null,
        imageUrl: imageUrl ?? null,
        videoUrl: videoUrl ?? null,
      },
    });

    // Update conversation's updatedAt
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ message });
  } catch (err: any) {
    console.error("Error in POST /api/messages:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

