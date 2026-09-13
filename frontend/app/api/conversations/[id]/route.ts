import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { NextResponse } from "next/server";

async function getUserAndConversation(
  email: string | null | undefined,
  conversationId: string
) {
  if (!email) return { error: "Unauthorized", status: 401 };

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: email.split("@")[0] },
  });

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!conversation) return { error: "Not found", status: 404 };
  if (conversation.userId !== user.id) return { error: "Forbidden", status: 403 };

  return { user, conversation };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const result = await getUserAndConversation(session?.user?.email, id);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ conversation: result.conversation });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const result = await getUserAndConversation(session?.user?.email, id);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const body = await req.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const updated = await prisma.conversation.update({
    where: { id },
    data: { title, updatedAt: new Date() },
  });

  return NextResponse.json({ conversation: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const result = await getUserAndConversation(session?.user?.email, id);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await prisma.conversation.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
