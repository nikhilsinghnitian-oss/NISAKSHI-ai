import { auth } from "@/auth";
import { createToken } from "@/app/lib/auth-token";
import { prisma } from "@/app/lib/db";
import { NextResponse } from "next/server";

const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ fileId: string }> };

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function attachmentDisposition(filename: string): string {
  const safe = filename
    .replaceAll(String.fromCharCode(92), "/")
    .split("/")
    .pop()!
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .slice(0, 255);
  return "attachment; filename*=UTF-8''" + encodeURIComponent(safe || "download.bin");
}

// GET /api/files/:fileId — authenticated proxy; never return bucket URLs.
export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileId } = await context.params;
  if (!UUID_PATTERN.test(fileId)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  try {
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
    const asset = await prisma.fileAsset.findFirst({
      where: { id: fileId, userId: user.id, status: "READY" },
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
    });
    if (!asset) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const token = await createToken(user.id);
    let upstream: Response;
    try {
      upstream = await fetch(BACKEND_URL + "/files/" + asset.id + "/download", {
        headers: { Authorization: "Bearer " + token },
        signal: AbortSignal.timeout(60_000),
        cache: "no-store",
      });
    } catch {
      return NextResponse.json({ error: "Private file storage is temporarily unavailable." }, { status: 503 });
    }
    if (upstream.status === 404) {
      return NextResponse.json({ error: "File content was not found." }, { status: 404 });
    }
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "Private file storage is temporarily unavailable." }, { status: 503 });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(asset.sizeBytes),
        "Content-Disposition": attachmentDisposition(asset.originalName),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    const value = error as { name?: string; code?: string };
    console.error("GET /api/files/:fileId failed:", { name: value?.name, code: value?.code });
    return NextResponse.json({ error: "Unable to download the file." }, { status: 500 });
  }
}

// DELETE /api/files/:fileId — remove the private object before removing metadata.
export async function DELETE(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin deletion is not allowed." }, { status: 403 });
  }

  const { fileId } = await context.params;
  if (!UUID_PATTERN.test(fileId)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  try {
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
    const asset = await prisma.fileAsset.findFirst({
      where: { id: fileId, userId: user.id },
      select: { id: true, status: true },
    });
    if (!asset) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const token = await createToken(user.id);
    let upstream: Response;
    try {
      upstream = await fetch(BACKEND_URL + "/files/" + asset.id, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token },
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });
    } catch {
      return NextResponse.json({ error: "Private file storage is temporarily unavailable." }, { status: 503 });
    }
    if (!upstream.ok && upstream.status !== 404) {
      return NextResponse.json({ error: "Unable to delete private file content." }, { status: 503 });
    }

    await prisma.fileAsset.delete({ where: { id: asset.id } });
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch (error: unknown) {
    const value = error as { name?: string; code?: string };
    console.error("DELETE /api/files/:fileId failed:", { name: value?.name, code: value?.code });
    return NextResponse.json({ error: "Unable to delete the file." }, { status: 500 });
  }
}
