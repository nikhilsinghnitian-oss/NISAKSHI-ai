import { auth } from "@/auth";
import { readJsonObject } from "@/app/lib/request-validation";
import { prisma } from "@/app/lib/db";
import { getOrCreateActiveUser, accountDeletedResponse } from "@/app/lib/account-guard";
import { NextResponse } from "next/server";

// GET /api/conversations — list current user's conversations
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrCreateActiveUser(session.user.email, { name: session.user.name, image: session.user.image });
    if (!user) return accountDeletedResponse();

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

    return NextResponse.json(
      { conversations, userId: user.id },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (err: unknown) {
    const error = err as { name?: string; code?: string };
    console.error("Error in GET /api/conversations:", {
      name: error?.name,
      code: error?.code,
    });
    return NextResponse.json(
      { error: "Unable to load conversations" },
      { status: 500, headers: { "Cache-Control": "no-store, private" } }
    );
  }
}

// POST /api/conversations — create a conversation owned by the current user
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = await readJsonObject(req, 8 * 1024);
    if (!parsed.ok) return parsed.response;

    const rawTitle = parsed.value.title;
    if (rawTitle !== undefined && rawTitle !== null && typeof rawTitle !== "string") {
      return NextResponse.json({ error: "Title must be text" }, { status: 400 });
    }
    const title = typeof rawTitle === "string" ? rawTitle.trim() : "New Chat";
    if (title.length > 120) {
      return NextResponse.json({ error: "Title must be at most 120 characters" }, { status: 400 });
    }

    const user = await getOrCreateActiveUser(session.user.email, { name: session.user.name, image: session.user.image });
    if (!user) return accountDeletedResponse();

    const conversation = await prisma.conversation.create({
      data: { userId: user.id, title: title || "New Chat" },
    });

    return NextResponse.json(
      { conversation },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (err: unknown) {
    const error = err as { name?: string; code?: string };
    console.error("Error in POST /api/conversations:", {
      name: error?.name,
      code: error?.code,
    });
    return NextResponse.json(
      { error: "Unable to create conversation" },
      { status: 500, headers: { "Cache-Control": "no-store, private" } }
    );
  }
}
