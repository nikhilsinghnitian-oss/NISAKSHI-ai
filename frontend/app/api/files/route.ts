import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { createToken } from "@/app/lib/auth-token";
import { prisma } from "@/app/lib/db";
import { NextResponse } from "next/server";

const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
// Keep this below common serverless request-size limits. The backend itself
// supports larger private uploads when reached through a suitably sized gateway.
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 128 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".docx", ".pptx", ".xlsx",
  ".txt", ".md", ".csv", ".mp3", ".wav", ".m4a",
]);

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function safeFilename(value: string): string {
  return value
    .replaceAll(String.fromCharCode(92), "/")
    .split("/")
    .pop()!
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 255);
}

function fileError(status: number): { status: number; error: string } {
  if (status === 400 || status === 415 || status === 422) {
    return { status: 400, error: "The file type or content was not accepted." };
  }
  if (status === 413) return { status: 413, error: "The file exceeds the upload limit." };
  if (status === 409) return { status: 409, error: "This file upload already exists. Refresh and try again." };
  return { status: 503, error: "Private file storage is temporarily unavailable." };
}

// GET /api/files — list the signed-in user's own file metadata only.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      select: { id: true },
    });

    const files = await prisma.fileAsset.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
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
    });

    return NextResponse.json(
      { files },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error: unknown) {
    const value = error as { name?: string; code?: string };
    console.error("GET /api/files failed:", { name: value?.name, code: value?.code });
    return NextResponse.json(
      { error: "Unable to load your files." },
      { status: 500, headers: { "Cache-Control": "no-store, private" } }
    );
  }
}

// POST /api/files — validate metadata, create a private object, then mark it READY.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin upload is not allowed." }, { status: 403 });
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isFinite(length) || length < 0) {
      return NextResponse.json({ error: "Invalid Content-Length." }, { status: 400 });
    }
    if (length > MAX_MULTIPART_BYTES) {
      return NextResponse.json({ error: "The file exceeds the upload limit." }, { status: 413 });
    }
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "A valid multipart file upload is required." }, { status: 400 });
  }

  const candidate = form.get("file");
  if (typeof File === "undefined" || !(candidate instanceof File)) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }
  const filename = safeFilename(candidate.name);
  const extension = filename.includes(".") ? "." + filename.split(".").pop()!.toLowerCase() : "";
  if (!filename || !ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json({ error: "This file format is not supported." }, { status: 415 });
  }
  if (candidate.size < 1) {
    return NextResponse.json({ error: "Empty files are not supported." }, { status: 400 });
  }
  if (candidate.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Files must be 4 MiB or smaller through this upload route." }, { status: 413 });
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

    const fileId = randomUUID();
    const storageKey = "users/" + user.id + "/files/" + fileId;
    await prisma.fileAsset.create({
      data: {
        id: fileId,
        userId: user.id,
        originalName: filename,
        mimeType: candidate.type || "application/octet-stream",
        sizeBytes: candidate.size,
        storageKey,
        status: "UPLOADING",
      },
    });

    const token = await createToken(user.id);
    const upstreamForm = new FormData();
    upstreamForm.set("file_id", fileId);
    upstreamForm.set("file", candidate, filename);

    let upstream: Response;
    try {
      upstream = await fetch(BACKEND_URL + "/files/upload", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: upstreamForm,
        signal: AbortSignal.timeout(60_000),
        cache: "no-store",
      });
    } catch {
      await prisma.fileAsset.update({
        where: { id: fileId },
        data: { status: "FAILED" },
      }).catch(() => undefined);
      return NextResponse.json(
        { error: "Private file storage is temporarily unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store, private" } }
      );
    }

    if (!upstream.ok) {
      await prisma.fileAsset.update({
        where: { id: fileId },
        data: { status: "FAILED" },
      }).catch(() => undefined);
      const message = fileError(upstream.status);
      return NextResponse.json(
        { error: message.error },
        { status: message.status, headers: { "Cache-Control": "no-store, private" } }
      );
    }

    const stored = await upstream.json().catch(() => null) as
      | { filename?: unknown; mime_type?: unknown; size_bytes?: unknown; sha256?: unknown }
      | null;
    if (
      !stored ||
      stored.size_bytes !== candidate.size ||
      typeof stored.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(stored.sha256) ||
      typeof stored.mime_type !== "string"
    ) {
      await fetch(BACKEND_URL + "/files/" + fileId, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token },
        signal: AbortSignal.timeout(10_000),
      }).catch(() => undefined);
      await prisma.fileAsset.update({
        where: { id: fileId },
        data: { status: "FAILED" },
      }).catch(() => undefined);
      return NextResponse.json({ error: "Storage returned an invalid receipt." }, { status: 502 });
    }

    const asset = await prisma.fileAsset.update({
      where: { id: fileId },
      data: {
        originalName: typeof stored.filename === "string" ? stored.filename : filename,
        mimeType: stored.mime_type,
        sizeBytes: stored.size_bytes,
        sha256: stored.sha256,
        status: "READY",
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        sha256: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      { file: asset },
      { status: 201, headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error: unknown) {
    const value = error as { name?: string; code?: string };
    console.error("POST /api/files failed:", { name: value?.name, code: value?.code });
    return NextResponse.json(
      { error: "Unable to finish the file upload." },
      { status: 500, headers: { "Cache-Control": "no-store, private" } }
    );
  }
}
