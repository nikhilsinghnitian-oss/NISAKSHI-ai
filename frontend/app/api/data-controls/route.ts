import { auth } from "@/auth";
import { createToken } from "@/app/lib/auth-token";
import { readJsonObject } from "@/app/lib/request-validation";
import { prisma } from "@/app/lib/db";
import { NextResponse } from "next/server";

const CONFIRMATION = "DELETE ALL MY NISAKSHI DATA";
const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const privateHeaders = { "Cache-Control": "no-store, private" };

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

// Delete private object content first. If a request fails part-way through, the
// metadata remains so the user can retry; deleting a missing object is idempotent.
async function removeStoredFile(fileId: string, token: string): Promise<boolean> {
  try {
    const response = await fetch(BACKEND_URL + "/files/" + encodeURIComponent(fileId), {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: privateHeaders });
    }
    if (!sameOrigin(request)) {
      return NextResponse.json({ error: "Cross-origin data deletion is not allowed." }, { status: 403, headers: privateHeaders });
    }

    const parsed = await readJsonObject(request, 4 * 1024);
    if (!parsed.ok) return parsed.response;
    if (parsed.value.confirmation !== CONFIRMATION || parsed.value.action !== "delete_all") {
      return NextResponse.json({ error: "Confirmation text did not match." }, { status: 400, headers: privateHeaders });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Account data was not found." }, { status: 404, headers: privateHeaders });
    }

    const files = await prisma.fileAsset.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    const token = await createToken(user.id);

    // Use small concurrent batches so account deletion cannot fan out unbounded requests.
    const batchSize = 8;
    for (let offset = 0; offset < files.length; offset += batchSize) {
      const batch = files.slice(offset, offset + batchSize);
      const results = await Promise.all(batch.map((file) => removeStoredFile(file.id, token)));
      if (results.some((success) => !success)) {
        return NextResponse.json(
          {
            error: "Some private files could not be deleted. Your database records were kept; retry this action to finish.",
            pendingFileCount: files.length,
          },
          { status: 503, headers: privateHeaders }
        );
      }
    }

    await prisma.$transaction([
      prisma.conversation.deleteMany({ where: { userId: user.id } }),
      prisma.fileAsset.deleteMany({ where: { userId: user.id } }),
    ]);

    return NextResponse.json(
      {
        success: true,
        deletedConversationCount: (await prisma.conversation.count({ where: { userId: user.id } })) === 0,
        deletedFileCount: files.length,
        accountKept: true,
      },
      { headers: privateHeaders }
    );
  } catch (error: unknown) {
    const value = error as { name?: string; code?: string };
    console.error("POST /api/data-controls failed:", {
      name: value?.name,
      code: value?.code,
    });
    return NextResponse.json(
      { error: "Unable to delete account data. Please retry." },
      { status: 500, headers: privateHeaders }
    );
  }
}
