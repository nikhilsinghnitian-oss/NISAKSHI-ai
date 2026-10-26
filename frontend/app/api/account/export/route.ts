import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import {
  accountPrivacyHeaders,
  findExistingActiveUser,
  isAccountDeletionBlocked,
} from "@/app/lib/account-guard";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: accountPrivacyHeaders },
    );
  }

  try {
    const activeUser = await findExistingActiveUser(email);
    if (!activeUser) {
      const deleted = await isAccountDeletionBlocked(email);
      return NextResponse.json(
        { error: deleted ? "Account deletion is in progress or completed." : "No account data was found." },
        { status: deleted ? 410 : 404, headers: accountPrivacyHeaders },
      );
    }

    const [account, conversations, files] = await Promise.all([
      prisma.user.findUnique({
        where: { id: activeUser.id },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.conversation.findMany({
        where: { userId: activeUser.id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          messages: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              role: true,
              content: true,
              model: true,
              imageUrl: true,
              videoUrl: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.fileAsset.findMany({
        where: { userId: activeUser.id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          sha256: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    if (!account) {
      return NextResponse.json(
        { error: "No account data was found." },
        { status: 404, headers: accountPrivacyHeaders },
      );
    }

    const payload = {
      exportVersion: 1,
      generatedAt: new Date().toISOString(),
      account,
      conversations,
      files,
      included: {
        profile: true,
        conversationsAndMessages: true,
        fileMetadata: true,
        uploadedFileBytes: false,
      },
      fileContentNote:
        "Uploaded file bytes are not embedded in this JSON export. Download the original files individually from Private File Library before deleting your account.",
    };
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        ...accountPrivacyHeaders,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="nisakshi-account-export-${date}.json"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    const value = error as { name?: string; code?: string };
    console.error("Account export failed:", { name: value?.name, code: value?.code });
    return NextResponse.json(
      { error: "Unable to export account data right now." },
      { status: 500, headers: accountPrivacyHeaders },
    );
  }
}
