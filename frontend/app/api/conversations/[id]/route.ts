import { auth } from "@/auth";
import { readJsonObject } from "@/app/lib/request-validation";
import { prisma } from "@/app/lib/db";
import { getOrCreateActiveUser } from "@/app/lib/account-guard";
import { NextResponse } from "next/server";

const privateHeaders = { "Cache-Control": "no-store, private" };

async function getUserAndConversation(
  email: string | null | undefined,
  conversationId: string
) {
  if (!email) return { error: "Unauthorized", status: 401 };

  const user = await getOrCreateActiveUser(email);
  if (!user) return { error: "Account deletion is pending or completed. Sign out to continue.", status: 410 };

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!conversation) return { error: "Not found", status: 404 };
  if (conversation.userId !== user.id) return { error: "Forbidden", status: 403 };

  return { user, conversation };
}

function logSafeError(route: string, err: unknown) {
  const error = err as { name?: string; code?: string };
  console.error(route, { name: error?.name, code: error?.code });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    const result = await getUserAndConversation(session?.user?.email, id);
    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: privateHeaders }
      );
    }
    return NextResponse.json(
      { conversation: result.conversation },
      { headers: privateHeaders }
    );
  } catch (err: unknown) {
    logSafeError("Error in GET /api/conversations/[id]", err);
    return NextResponse.json(
      { error: "Unable to load conversation" },
      { status: 500, headers: privateHeaders }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    const result = await getUserAndConversation(session?.user?.email, id);
    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: privateHeaders }
      );
    }

    const parsed = await readJsonObject(req, 8 * 1024);
    if (!parsed.ok) return parsed.response;

    const rawTitle = parsed.value.title;
    if (typeof rawTitle !== "string") {
      return NextResponse.json({ error: "Title must be text" }, { status: 400 });
    }
    const title = rawTitle.trim();
    if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });
    if (title.length > 120) {
      return NextResponse.json({ error: "Title must be at most 120 characters" }, { status: 400 });
    }

    const updated = await prisma.conversation.update({
      where: { id },
      data: { title, updatedAt: new Date() },
    });
    return NextResponse.json(
      { conversation: updated },
      { headers: privateHeaders }
    );
  } catch (err: unknown) {
    logSafeError("Error in PATCH /api/conversations/[id]", err);
    return NextResponse.json(
      { error: "Unable to update conversation" },
      { status: 500, headers: privateHeaders }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    const result = await getUserAndConversation(session?.user?.email, id);
    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: privateHeaders }
      );
    }

    await prisma.conversation.delete({ where: { id } });
    return NextResponse.json({ success: true }, { headers: privateHeaders });
  } catch (err: unknown) {
    logSafeError("Error in DELETE /api/conversations/[id]", err);
    return NextResponse.json(
      { error: "Unable to delete conversation" },
      { status: 500, headers: privateHeaders }
    );
  }
}
