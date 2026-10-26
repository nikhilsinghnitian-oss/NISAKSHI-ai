"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type FileStatus = "UPLOADING" | "READY" | "FAILED";

type FileAsset = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  status: FileStatus;
  createdAt: string;
  updatedAt?: string;
};

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ACCEPTED_FILES =
  ".pdf,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx,.txt,.md,.csv,.mp3,.wav,.m4a";

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function fileKind(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase() || "file";
  return extension.toUpperCase().slice(0, 4);
}

async function readApiMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: unknown }
    | null;
  return typeof payload?.error === "string"
    ? payload.error
    : "The request could not be completed. Please try again.";
}

export default function FilesPage() {
  const { status } = useSession();
  const router = useRouter();
  const pickerRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    try {
      const response = await fetch("/api/files", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (response.status === 401) {
        router.replace("/api/auth/signin?callbackUrl=%2Ffiles");
        return;
      }
      if (!response.ok) throw new Error(await readApiMessage(response));
      const payload = (await response.json()) as { files?: FileAsset[] };
      setFiles(Array.isArray(payload.files) ? payload.files : []);
      setError(null);
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load your private files."
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (status === "authenticated") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetch starts after the session is resolved.
      void loadFiles();
    } else if (status === "unauthenticated") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Redirect unauthenticated users away from private assets.
      router.replace("/api/auth/signin?callbackUrl=%2Ffiles");
    }
  }, [status, loadFiles, router]);

  const uploadFile = useCallback(
    async (file: File) => {
      setError(null);
      setNotice(null);
      if (file.size < 1) {
        setError("Empty files cannot be uploaded.");
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError("This upload route supports files up to 4 MiB.");
        return;
      }

      const form = new FormData();
      form.set("file", file);
      setUploading(true);
      try {
        const response = await fetch("/api/files", {
          method: "POST",
          body: form,
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | { file?: FileAsset; error?: string }
          | null;
        if (!response.ok || !payload?.file) {
          throw new Error(
            payload?.error || "Upload failed. Please try again."
          );
        }
        setNotice(`“${payload.file.originalName}” was saved to your private library.`);
        await loadFiles();
      } catch (caught: unknown) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Upload failed. Please try again."
        );
      } finally {
        setUploading(false);
        if (pickerRef.current) pickerRef.current.value = "";
      }
    },
    [loadFiles]
  );

  const deleteFile = useCallback(
    async (file: FileAsset) => {
      if (!window.confirm(`Delete “${file.originalName}” permanently?`)) return;
      setError(null);
      setNotice(null);
      setBusyFileId(file.id);
      try {
        const response = await fetch(
          `/api/files/${encodeURIComponent(file.id)}`,
          { method: "DELETE", cache: "no-store" }
        );
        if (!response.ok) throw new Error(await readApiMessage(response));
        setFiles((current) => current.filter((item) => item.id !== file.id));
        setNotice(`“${file.originalName}” was deleted.`);
      } catch (caught: unknown) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Delete failed. Please try again."
        );
      } finally {
        setBusyFileId(null);
      }
    },
    []
  );

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-3" role="status">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-sm text-slate-400">Loading your private files…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <Link
              href="/chat"
              className="mb-3 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
            >
              <span aria-hidden="true">←</span> Back to chat
            </Link>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10 text-xl text-blue-300">
                ▤
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Private File Library
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  Your documents and media, scoped to your signed-in account.
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadFiles()}
            disabled={loading}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Refresh library
          </button>
        </header>

        <section className="mb-8 rounded-2xl border border-blue-400/20 bg-gradient-to-br from-blue-500/[0.09] to-indigo-500/[0.03] p-5 sm:p-7">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
                Secure upload
              </p>
              <h2 className="text-lg font-semibold sm:text-xl">Add a file to your workspace</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                PDF, Word, PowerPoint, Excel, text, Markdown, CSV, image, and audio files.
                Each upload is validated before it is saved to private cloud storage.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Maximum 4 MiB per upload through this web route. Document analysis and RAG are not
                enabled yet.
              </p>
            </div>
            <div className="shrink-0">
              <input
                ref={pickerRef}
                type="file"
                accept={ACCEPTED_FILES}
                className="sr-only"
                aria-label="Choose a file to upload"
                disabled={uploading}
                onChange={(event) => {
                  const selected = event.currentTarget.files?.[0];
                  if (selected) void uploadFile(selected);
                  event.currentTarget.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => pickerRef.current?.click()}
                disabled={uploading}
                className="inline-flex min-w-44 items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition-all hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <span aria-hidden="true" className="text-lg">＋</span>
                    Choose file
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div role="alert" className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {notice}
          </div>
        )}

        <section aria-labelledby="files-heading">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 id="files-heading" className="text-lg font-semibold">Your files</h2>
              <p className="mt-1 text-sm text-slate-500">
                {files.length} {files.length === 1 ? "item" : "items"} shown, newest first.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-slate-400">
              Refreshing library…
            </div>
          ) : files.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-white/[0.02] px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl text-slate-400">▤</div>
              <h3 className="font-medium text-white">Your library is empty</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
                Upload a study note, lecture PDF, presentation, spreadsheet, or supported media file
                to keep it in your private workspace.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
              <ul className="divide-y divide-white/[0.07]">
                {files.map((file) => (
                  <li key={file.id} className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-[10px] font-bold tracking-wide text-blue-300">
                        {fileKind(file.originalName)}
                      </div>
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium text-slate-100">{file.originalName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatBytes(file.sizeBytes)} · {formatDate(file.createdAt)}
                        </p>
                        <span
                          className={
                            file.status === "READY"
                              ? "mt-2 inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300"
                              : file.status === "FAILED"
                                ? "mt-2 inline-flex rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-300"
                                : "mt-2 inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300"
                          }
                        >
                          {file.status === "READY"
                            ? "Stored privately"
                            : file.status === "FAILED"
                              ? "Upload failed"
                              : "Upload in progress"}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:pl-4">
                      {file.status === "READY" && (
                        <a
                          href={`/api/files/${encodeURIComponent(file.id)}`}
                          className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10"
                        >
                          Download
                        </a>
                      )}
                      <button
                        type="button"
                        disabled={busyFileId === file.id}
                        onClick={() => void deleteFile(file)}
                        className="inline-flex items-center justify-center rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busyFileId === file.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <footer className="mt-8 border-t border-white/[0.07] pt-5 text-xs leading-5 text-slate-500">
          Files are fetched through authenticated application routes. The browser never receives a
          public Cloud Storage URL. Format validation does not replace malware scanning; avoid
          uploading files you do not trust.
        </footer>
      </div>
    </main>
  );
}
