import { auth } from "@/auth";
import { createToken } from "@/app/lib/auth-token";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";

// GET /api/auth-token — return a short-lived HMAC token for FastAPI
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Upsert to ensure user exists (first login creates the record)
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

  const token = await createToken(user.id);
  return NextResponse.json({ token });
}
