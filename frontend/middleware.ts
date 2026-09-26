import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  // Protect /chat — unauthenticated users → landing
  if (pathname.startsWith("/chat")) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // Redirect authenticated users away from landing → chat
  if (pathname === "/") {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/chat", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/", "/chat/:path*"],
};

