import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";

const TOMBSTONE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
const privateHeaders = { "Cache-Control": "no-store, private" };

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Store a keyed digest rather than the raw email. Keep AUTH_SECRET stable for the 30-day grace window. */
export function hashAccountEmail(email: string): string {
  const key = process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim() || "";
  if (key.length < 32) {
    throw new Error("A high-entropy AUTH_SECRET is required for account privacy controls");
  }
  return createHmac("sha256", key).update(normalizedEmail(email)).digest("hex");
}

export async function isAccountDeletionBlocked(email: string): Promise<boolean> {
  const emailHash = hashAccountEmail(email);
  const tombstone = await prisma.deletedAccount.findUnique({
    where: { emailHash },
    select: { status: true, expiresAt: true },
  });
  if (!tombstone) return false;
  if (tombstone.status === "PENDING") return true;
  return !tombstone.expiresAt || tombstone.expiresAt.getTime() > Date.now();
}

export async function getOrCreateActiveUser(
  email: string,
  profile: { name?: string | null; image?: string | null } = {},
): Promise<{ id: string } | null> {
  const normalized = normalizedEmail(email);
  const emailHash = hashAccountEmail(normalized);
  let tombstone = await prisma.deletedAccount.findUnique({
    where: { emailHash },
    select: { status: true, expiresAt: true },
  });
  const now = new Date();
  if (tombstone && (
    tombstone.status === "PENDING" ||
    !tombstone.expiresAt ||
    tombstone.expiresAt.getTime() > now.getTime()
  )) return null;

  if (tombstone?.status === "COMPLETE" && tombstone.expiresAt && tombstone.expiresAt <= now) {
    await prisma.deletedAccount.deleteMany({
      where: { emailHash, status: "COMPLETE", expiresAt: { lte: now } },
    });
  }

  const update: { name?: string; image?: string } = {};
  if (typeof profile.name === "string" && profile.name.trim()) update.name = profile.name;
  if (typeof profile.image === "string" && profile.image.trim()) update.image = profile.image;

  const user = await prisma.user.upsert({
    where: { email: normalized },
    update,
    create: {
      email: normalized,
      name: profile.name ?? null,
      image: profile.image ?? null,
    },
    select: { id: true },
  });

  // Recheck so an overlapping deletion cannot silently restore active access.
  tombstone = await prisma.deletedAccount.findUnique({
    where: { emailHash },
    select: { status: true, expiresAt: true },
  });
  if (tombstone && (
    tombstone.status === "PENDING" ||
    !tombstone.expiresAt ||
    tombstone.expiresAt.getTime() > Date.now()
  )) return null;
  return user;
}

export async function findExistingActiveUser(email: string): Promise<{ id: string } | null> {
  if (await isAccountDeletionBlocked(email)) return null;
  return prisma.user.findUnique({
    where: { email: normalizedEmail(email) },
    select: { id: true },
  });
}

export function accountDeletedResponse() {
  return NextResponse.json(
    { error: "This account was deleted or is being deleted. Sign out to continue." },
    { status: 410, headers: privateHeaders },
  );
}

export const accountPrivacyHeaders = privateHeaders;
export const ACCOUNT_TOMBSTONE_GRACE_MS = TOMBSTONE_GRACE_MS;
