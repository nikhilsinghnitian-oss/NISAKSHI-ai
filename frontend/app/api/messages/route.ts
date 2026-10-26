import { auth } from "@/auth";
import { readJsonObject } from "@/app/lib/request-validation";
import { prisma } from "@/app/lib/db";
import { NextResponse } from "next/server";

const MAX_MESSAGE_BODY_BYTES = 1_500_000;
const MAX_CONTENT_CHARS = 100_000;
const MAX_MEDIA_REFERENCE_CHARS = 1_200_000;

function validImageReference(value: unknown): value is string | null | undefined {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string" || value.length > MAX_MEDIA_REFERENCE_CHARS) return false;
  return value.startsWith("https://") ||
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

function validVideoReference(value: unknown): value is string | null | undefined {
  if (value === undefined || value === null) return true;
  return typeof value === "string" &&
    value.length <= 2_048 &&
    (value.startsWith("https://") || value.startsWith("http://localhost:"));
}

// POST /api/messages — save a message to a conversation
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = await readJsonObject(req, MAX_MESSAGE_BODY_BYTES);
    if (!parsed.ok) return parsed.response;

    const { conversationId, role, content, model, imageUrl, videoUrl } = parsed.value;
    if (
      typeof conversationId !== "string" ||
      !conversationId ||
      conversationId.length > 128 ||
      (role !== "user" && role !== "assistant") ||
      typeof content !== "string" ||
      content.length > MAX_CONTENT_CHARS ||
      (model !== undefined && model !== null &&
        (typeof model !== "string" || model.length > 120)) ||
      !validImageReference(imageUrl) ||
      !validVideoReference(videoUrl)
    ) {
      return NextResponse.json({ error: "Invalid message fields" }, { status: 400 });
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

    // Verify conversation ownership before saving message.
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, userId: true },
    });
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    if (conversation.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        model: model ?? null,
        imageUrl: imageUrl ?? null,
        videoUrl: videoUrl ?? null,
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json(
      { message },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (err: unknown) {
    const error = err as { name?: string; code?: string };
    console.error("Error in POST /api/messages:", {
      name: error?.name,
      code: error?.code,
    });
    return NextResponse.json(
      { error: "Unable to save message" },
      { status: 500, headers: { "Cache-Control": "no-store, private" } }
    );
  }
}
