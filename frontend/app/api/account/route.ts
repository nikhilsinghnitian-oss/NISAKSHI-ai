import { auth } from "@/auth";
import { createToken } from "@/app/lib/auth-token";
import { prisma } from "@/app/lib/db";
import {
  accountPrivacyHeaders,
  hashAccountEmail,
  ACCOUNT_TOMBSTONE_GRACE_MS,
} from "@/app/lib/account-guard";
import { NextResponse } from "next/server";

const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: accountPrivacyHeaders });
}

export async function DELETE(request: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return errorResponse(401, "Unauthorized");
  if (!sameOrigin(request)) return errorResponse(403, "Cross-origin account deletion is not allowed.");

  const normalizedEmail = email.trim().toLowerCase();
  try {
    const emailHash = hashAccountEmail(normalizedEmail);
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    // Lock the account before external cleanup. If cleanup fails, the pending
    // tombstone remains so old sessions cannot recreate new user rows.
    await prisma.deletedAccount.upsert({
      where: { emailHash },
      update: { status: "PENDING", expiresAt: null },
      create: { emailHash, status: "PENDING", expiresAt: null },
    });

    if (user) {
      const token = await createToken(user.id);
      let cleanupResponse: Response;
      try {
        cleanupResponse = await fetch(`${BACKEND_URL}/users/me/files`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        return errorResponse(503, "Private-file cleanup is not reachable. Your account is locked; retry deletion after storage service is restored.");
      }
      if (!cleanupResponse.ok) {
        return errorResponse(503, "Private-file cleanup could not be confirmed. Your account is locked; retry deletion after storage service is configured and healthy.");
      }

      const expiresAt = new Date(Date.now() + ACCOUNT_TOMBSTONE_GRACE_MS);
      await prisma.$transaction(async (tx) => {
        await tx.user.deleteMany({ where: { id: user.id } });
        await tx.deletedAccount.update({
          where: { emailHash },
          data: { status: "COMPLETE", expiresAt },
        });
      });
    } else {
      // No user row remains; complete/recover an interrupted or repeated deletion.
      await prisma.deletedAccount.upsert({
        where: { emailHash },
        update: {
          status: "COMPLETE",
          expiresAt: new Date(Date.now() + ACCOUNT_TOMBSTONE_GRACE_MS),
        },
        create: {
          emailHash,
          status: "COMPLETE",
          expiresAt: new Date(Date.now() + ACCOUNT_TOMBSTONE_GRACE_MS),
        },
      });
    }

    return NextResponse.json({ success: true }, { headers: accountPrivacyHeaders });
  } catch (error: unknown) {
    const value = error as { name?: string; code?: string };
    console.error("Account deletion failed:", { name: value?.name, code: value?.code });
    return errorResponse(500, "Unable to complete account deletion. If the account is locked, retry after the storage service is healthy.");
  }
}
