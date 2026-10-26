"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function AccountPrivacyPage() {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function deleteAccount() {
    if (confirmText !== "DELETE") {
      setError('Type DELETE exactly to confirm account removal.');
      return;
    }
    const confirmed = window.confirm(
      "Permanently delete your NISAKSHI account, chats, messages, and file metadata? Private uploaded objects will be removed first. This cannot be undone."
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error || "Account deletion failed. You may retry after resolving the issue.");
        return;
      }
      await signOut({ redirect: false });
      router.replace("/?accountDeleted=1");
      router.refresh();
    } catch {
      setError("Unable to contact the server. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <Link href="/chat" className="text-sm text-blue-300 hover:text-blue-200">
          ← Back to NISAKSHI
        </Link>
        <header className="mb-8 mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-400">Account controls</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Account &amp; privacy</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Export your profile, chat history, messages, and file metadata. You remain in control of your data.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-lg font-semibold">Export your data</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Downloads a JSON copy of your profile, conversations, messages, and file metadata. Uploaded file bytes are not included, so download original files individually from the Private File Library before deleting your account.
          </p>
          <a
            href="/api/account/export"
            className="mt-5 inline-flex items-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            Download account export
          </a>
        </section>

        <section className="mt-6 rounded-2xl border border-red-900/70 bg-red-950/20 p-6">
          <h2 className="text-lg font-semibold text-red-200">Delete account</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            This permanently removes your account record, conversations, messages, and file metadata. The backend must confirm removal of all private objects before the database records are deleted. If storage cleanup is unavailable, the account will be locked and deletion can be retried; the app will not pretend cleanup succeeded.
          </p>
          <label htmlFor="delete-confirm" className="mt-5 block text-sm font-medium text-slate-300">
            Type <span className="font-mono text-red-300">DELETE</span> to confirm
          </label>
          <input
            id="delete-confirm"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            autoComplete="off"
            disabled={busy}
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-red-500"
            placeholder="DELETE"
          />
          {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
          <button
            onClick={deleteAccount}
            disabled={busy || confirmText !== "DELETE"}
            className="mt-4 rounded-xl border border-red-700 bg-red-700/20 px-4 py-2.5 text-sm font-semibold text-red-200 transition-colors hover:bg-red-700/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Processing deletion…" : "Permanently delete account"}
          </button>
        </section>

        <p className="mt-6 text-xs leading-5 text-slate-500">
          Deletion records keep only a keyed digest of the account email for a 30-day stale-session safety window. Backups and third-party infrastructure retention follow the configured provider retention windows; this page does not claim instant deletion from backups.
        </p>
      </div>
    </main>
  );
}
