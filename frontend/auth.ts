import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const googleClientId =
  process.env.AUTH_GOOGLE_ID?.trim() ||
  process.env.GOOGLE_CLIENT_ID?.trim() ||
  "";

const googleClientSecret =
  process.env.AUTH_GOOGLE_SECRET?.trim() ||
  process.env.GOOGLE_CLIENT_SECRET?.trim() ||
  "";

const authSecret =
  process.env.AUTH_SECRET?.trim() ||
  process.env.NEXTAUTH_SECRET?.trim() ||
  "";

if (typeof window === "undefined") {
  if (!authSecret) {
    console.error("[Auth.js Diagnostic] CRITICAL: AUTH_SECRET (or NEXTAUTH_SECRET) is missing in runtime environment!");
  }
  if (!googleClientId) {
    console.error("[Auth.js Diagnostic] CRITICAL: Google Client ID (AUTH_GOOGLE_ID or GOOGLE_CLIENT_ID) is missing in runtime environment!");
  }
  if (!googleClientSecret) {
    console.error("[Auth.js Diagnostic] CRITICAL: Google Client Secret (AUTH_GOOGLE_SECRET or GOOGLE_CLIENT_SECRET) is missing in runtime environment!");
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  secret: authSecret || undefined,
  providers: [
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }),
  ],
});


