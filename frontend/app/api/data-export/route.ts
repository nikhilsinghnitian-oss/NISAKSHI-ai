import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store, private" } }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        email: true,
        name: true,
        image: true,
        createdAt: true,
        conversations: {
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
        },
        files: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            sha256: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Account data was not found." },
        { status: 404, headers: { "Cache-Control": "no-store, private" } }
      );
    }

    const payload = {
      format: "nisakshi-account-export",
      version: 1,
      generatedAt: new Date().toISOString(),
      scope: "Profile, conversations, messages, and file metadata. Uploaded file bytes are not embedded; download those separately from /files.",
      account: {
        email: user.email,
        name: user.name,
        image: user.image,
        createdAt: user.createdAt,
      },
      conversations: user.conversations,
      files: user.files.map((file) => ({
        ...file,
        downloadPath: "/api/files/" + file.id,
      })),
    };

    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": "attachment; filename=nisakshi-data-export-" + date + ".json",
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    const value = error as { name?: string; code?: string };
    console.error("GET /api/data-export failed:", {
      name: value?.name,
      code: value?.code,
    });
    return NextResponse.json(
      { error: "Unable to export account data." },
      { status: 500, headers: { "Cache-Control": "no-store, private" } }
    );
  }
}
