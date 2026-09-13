"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function UserProfile() {
  const { data: session, status } = useSession();
  const router = useRouter();

  if (status === "loading") {
    return (
      <div className="border-t border-slate-800/60 p-3">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <div className="h-8 w-8 animate-pulse rounded-full bg-slate-800" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-20 animate-pulse rounded bg-slate-800" />
            <div className="h-2 w-28 animate-pulse rounded bg-slate-800" />
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="border-t border-slate-800/60 p-3">
        <button
          onClick={() => signIn("google")}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-700/60 bg-slate-900/60 px-4 py-2.5 text-xs font-medium text-slate-300 hover:border-blue-500/30 hover:bg-blue-500/5 hover:text-blue-300 transition-all"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continue with Google
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-800/60 p-3">
      <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-800/40 transition-colors">
        {session.user?.image ? (
          <img
            src={session.user.image}
            alt={session.user.name || "User"}
            className="h-8 w-8 rounded-full ring-1 ring-white/10"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            {session.user?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-200">
            {session.user?.name}
          </p>
          <p className="truncate text-[10px] text-slate-500">
            {session.user?.email}
          </p>
        </div>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-800/60 hover:text-slate-400 transition-colors"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Sign out
      </button>
    </div>
  );
}
