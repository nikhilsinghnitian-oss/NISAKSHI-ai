"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type FileRecord = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  status: "UPLOADING" | "READY" | "FAILED";
  createdAt: string;
  updatedAt?: string;
};

const ACCEPTED_FILES = ".pdf,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx,.txt,.md,.csv,.mp3,.wav,.m4a";
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function FilesPage() {
  const { status } = useSession();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadFiles = useCallback(async () => {
    try {
      const response = await fetch("/api/files", { cache: "no-store" });
      if (!response.ok) {
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        throw new Error("Unable to load your private files.");
      }
      const data = await response.json() as { files?: FileRecord[] };
      setFiles(Array.isArray(data.files) ? data.files : []);
      setError("");
    } catch {
      setError("Unable to load your private files. Check your connection and try again.");
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
      router.replace("/");
    }
  }, [status, loadFiles, router]);

  const uploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setNotice("");
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Files must be 4 MiB or smaller in this workspace.");
      return;
    }

    const body = new FormData();
    body.set("file", file);
    setUploading(true);
    try {
      const response = await fetch("/api/files", {
        method: "POST",
        body,
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({})) as {
        file?: FileRecord;
        error?: string;
      };
      if (!response.ok || !data.file) {
        throw new Error(data.error || "Upload failed. Please try again.");
      }
      setFiles((current) => [data.file!, ...current.filter((item) => item.id !== data.file!.id)]);
      setNotice("Uploaded " + data.file.originalName + " to your private file library.");
    } catch (value: unknown) {
      setError(value instanceof Error ? value.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const deleteFile = async (file: FileRecord) => {
    if (!window.confirm('Delete "' + file.originalName + '" permanently from your file library?')) return;
    setDeletingId(file.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/files/" + file.id, {
        method: "DELETE",
        cache: "no-store",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Unable to delete this file.");
      }
      setFiles((current) => current.filter((item) => item.id !== file.id));
      setNotice("Deleted " + file.originalName + ".");
    } catch (value: unknown) {
      setError(value instanceof Error ? value.message : "Unable to delete this file.");
    } finally {
      setDeletingId(null);
    }
  };

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-sm text-slate-400">Loading your private file library…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-950/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-400">NISAKSHI AI</p>
            <h1 className="mt-1 text-xl font-semibold">Private file library</h1>
          </div>
          <Link href="/chat" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:border-blue-400/50 hover:text-white">
            Back to chat
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-8 sm:py-12">
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-7">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold">Your documents and media</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Upload study PDFs, Office files, text/CSV files, images, or audio. Files are stored privately
                under your account; this page does not publish bucket links or process documents with an AI model.
              </p>
            </div>
            <div className="shrink-0">
              <input ref={inputRef} type="file" accept={ACCEPTED_FILES} onChange={(event) => void uploadFile(event)} disabled={uploading} className="hidden" id="private-file-upload" />
              <label
                htmlFor="private-file-upload"
                className={"inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition " + (uploading ? "cursor-not-allowed bg-blue-500/30 text-blue-100/60" : "cursor-pointer bg-blue-600 text-white hover:bg-blue-500")}
              >
                {uploading ? "Uploading…" : "＋ Upload a file"}
              </label>
              <p className="mt-2 text-right text-xs text-slate-500">4 MiB maximum per upload</p>
            </div>
          </div>
        </div>

        {error && <div role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-200">{error}</div>}
        {notice && <div role="status" className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-200">{notice}</div>}

        <div className="mt-7 overflow-hidden rounded-2xl border border-white/10">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 className="font-medium">Saved files</h2>
            <span className="text-xs text-slate-500">{files.length} shown · newest first</span>
          </div>

          {loading ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">Loading files…</div>
          ) : files.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xl">▤</div>
              <p className="mt-4 font-medium text-slate-200">Your file library is empty</p>
              <p className="mt-2 text-sm text-slate-500">Upload your first document to store it privately.</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {files.map((file) => (
                <li key={file.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-400/15 bg-blue-400/5 text-xs font-semibold uppercase text-blue-300">
                      {file.originalName.includes(".") ? file.originalName.split(".").pop()!.slice(0, 4) : "FILE"}
                    </div>
                    <div className="min-w-0">
                      <p className="break-all text-sm font-medium text-slate-100">{file.originalName}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatBytes(file.sizeBytes)} · {file.mimeType} · {formatDate(file.createdAt)}</p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        Status: {file.status.toLowerCase()}{file.sha256 ? " · SHA-256 " + file.sha256.slice(0, 12) + "…" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {file.status === "READY" && <a href={"/api/files/" + file.id} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-blue-400/50 hover:text-white">Download</a>}
                    <button type="button" onClick={() => void deleteFile(file)} disabled={deletingId === file.id} className="rounded-lg border border-red-400/20 px-3 py-2 text-xs font-medium text-red-200 transition hover:bg-red-400/10 disabled:opacity-50">
                      {deletingId === file.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-5 text-xs leading-5 text-slate-600">
          Supported formats: PDF, PNG/JPEG/WebP, DOCX/PPTX/XLSX, UTF-8 TXT/Markdown/CSV, MP3, WAV, and M4A.
          The current workspace stores files only; document indexing, RAG, and malware scanning are not enabled yet.
        </p>
      </section>
    </main>
  );
}
