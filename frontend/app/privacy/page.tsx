"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const CONFIRMATION = "DELETE ALL MY NISAKSHI DATA";

export default function PrivacyPage() {
  const { status } = useSession();
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Session status redirects unauthenticated visitors away from private data controls.
      router.replace("/api/auth/signin?callbackUrl=%2Fprivacy");
    }
  }, [status, router]);

  async function deleteAllData(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation !== CONFIRMATION || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/data-controls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_all",
          confirmation,
        }),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: unknown; deletedFileCount?: unknown }
        | null;
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Unable to delete your data. Please retry."
        );
      }
      setConfirmation("");
      setNotice(
        "Your conversations, messages, file metadata, and private file objects were deleted. Your sign-in account remains active."
      );
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to delete your data. Please retry."
      );
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-sm text-slate-400">Loading privacy controls…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 border-b border-white/10 pb-6">
          <Link href="/chat" className="text-sm text-slate-400 transition hover:text-white">
            ← Back to chat
          </Link>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">NISAKSHI AI</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Privacy & data controls</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Export your saved account records or permanently remove your conversations and uploaded files.
          </p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-lg text-blue-300">
              ⇩
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">Export your account data</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Download your profile details, conversations, messages, and file metadata as JSON.
                Uploaded file contents are not embedded in the JSON; download those separately from your file library.
              </p>
              <a
                href="/api/data-export"
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-400"
              >
                Download JSON export
              </a>
              <Link href="/files" className="ml-3 inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/5">
                Open file library
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/[0.035] p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">Irreversible action</p>
          <h2 className="mt-2 text-lg font-semibold">Delete all saved data</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            This permanently deletes all your saved conversations and messages, plus uploaded file objects and their metadata.
            It does not close your Google sign-in identity. If private storage cannot be reached, deletion stops and keeps database
            records so you can retry safely. Backup copies may remain until the configured backup-retention period expires.
          </p>

          <form onSubmit={deleteAllData} className="mt-5">
            <label htmlFor="delete-confirmation" className="mb-2 block text-sm font-medium text-slate-200">
              Type exactly: <span className="font-mono text-red-200">{CONFIRMATION}</span>
            </label>
            <input
              id="delete-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-red-400/50"
              placeholder="Type the confirmation phrase"
            />
            <button
              type="submit"
              disabled={busy || confirmation !== CONFIRMATION}
              className="mt-4 inline-flex items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Deleting private data…" : "Delete all saved data"}
            </button>
          </form>
        </section>

        {error && (
          <div role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-200">
            {notice}
          </div>
        )}

        <p className="mt-6 text-xs leading-5 text-slate-600">
          These controls require sign-in. Export files are generated on request and are not stored by this route.
          This code does not erase cloud-provider backups; retention must follow the configured backup policy.
        </p>
      </div>
    </main>
  );
}
