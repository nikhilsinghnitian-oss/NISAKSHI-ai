import { auth } from "@/auth";
import { createToken } from "@/app/lib/auth-token";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";

// GET /api/auth-token — short-lived service token for authenticated integration clients.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store, private" } }
      );
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

    const token = await createToken(user.id);
    return NextResponse.json(
      { token },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (err: unknown) {
    const error = err as { name?: string; code?: string };
    console.error("Error in /api/auth-token:", {
      name: error?.name,
      code: error?.code,
    });
    return NextResponse.json(
      { error: "Unable to create service token" },
      { status: 500, headers: { "Cache-Control": "no-store, private" } }
    );
  }
}
