import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await auth();

  // Protect /chat — unauthenticated users → landing
  if (pathname.startsWith("/chat")) {
    if (!session) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // Redirect authenticated users away from landing → chat
  if (pathname === "/") {
    if (session) {
      return NextResponse.redirect(new URL("/chat", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/chat/:path*"],
};
