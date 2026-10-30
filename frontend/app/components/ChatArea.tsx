"use client";

import { useState, useRef, useEffect } from "react";
import type { DragEvent } from "react";
import type { DbMessage, DbConversation } from "../chat/page";
import MessageBubble from "./MessageBubble";
import ModelSelector from "./ModelSelector";

interface Props {
  conversation: DbConversation | null;
  messages: DbMessage[];
  loading: boolean;
  selectedModel: string | undefined;
  onSendMessage: (message: string, files: File[]) => void;
  onUpdateModel: (model: string | undefined) => void;
  onToggleSidebar: () => void;
}

const SUGGESTIONS = [
  { label: "Explain a concept", prompt: "Explain " },
  { label: "Find PYQs", prompt: "Find previous year questions for " },
  { label: "Solve a problem", prompt: "Solve step by step: " },
  { label: "Make revision notes", prompt: "Make concise revision notes for " },
];

const MODEL_BADGE: Record<string, { label: string; color: string }> = {
  image: { label: "NISAKSHI Image", color: "bg-purple-500/10 text-purple-300 border-purple-500/20" },
  chat: { label: "NISAKSHI Chat", color: "bg-blue-500/10 text-blue-300 border-blue-500/20" },
};

const MAX_FILES = 5;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const ACCEPTED_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatArea({
  conversation,
  messages,
  loading,
  selectedModel,
  onSendMessage,
  onUpdateModel,
  onToggleSidebar,
}: Props) {
  const [input, setInput] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousConversationIdRef = useRef<string | null>(null);

  const lastMsg = messages[messages.length - 1];
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, lastMsg?.content]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [conversation?.id]);

  useEffect(() => {
    const currentId = conversation?.id ?? null;
    if (previousConversationIdRef.current && previousConversationIdRef.current !== currentId) {
      setSelectedFiles([]);
      setAttachmentError("");
    }
    previousConversationIdRef.current = currentId;
  }, [conversation?.id]);

  const addFiles = (incoming: File[]) => {
    if (!incoming.length) return;
    const next = [...selectedFiles];
    let error = "";

    for (const file of incoming) {
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      const expectedType = ACCEPTED_TYPES[extension];
      if (!expectedType || (file.type && file.type !== expectedType)) {
        error = `${file.name}: only PDF, JPG, PNG and WEBP files are supported.`;
        continue;
      }
      if (next.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) {
        continue;
      }
      if (next.length >= MAX_FILES) {
        error = `You can attach up to ${MAX_FILES} files at a time.`;
        break;
      }
      const totalBytes = next.reduce((total, item) => total + item.size, 0) + file.size;
      if (file.size === 0) {
        error = `${file.name} is empty.`;
        continue;
      }
      if (totalBytes > MAX_TOTAL_BYTES) {
        error = "The combined attachment size must be 4 MB or less.";
        break;
      }
      next.push(file);
    }

    setSelectedFiles(next);
    setAttachmentError(error);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((current) => current.filter((_, i) => i !== index));
    setAttachmentError("");
  };

  const handleSend = () => {
    const text = input.trim();
    if ((!text && selectedFiles.length === 0) || loading) return;
    const prompt = text || "Please analyze the attached file(s) and explain the relevant content.";
    onSendMessage(prompt, selectedFiles);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "24px";
    setAttachmentError("");
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (!loading) addFiles(Array.from(event.dataTransfer.files));
  };

  const isImage = selectedModel === "image";
  const badge = selectedModel ? MODEL_BADGE[selectedModel] : null;
  const placeholder = isImage && selectedFiles.length === 0
    ? "Describe an image to create..."
    : "Ask a question or attach a PDF/image...";

  return (
    <div
      className="relative flex min-w-0 flex-1 flex-col"
      onDragOver={(event) => {
        event.preventDefault();
        if (!loading) setIsDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-blue-400 bg-slate-950/90 text-sm font-medium text-blue-200 backdrop-blur-sm">
          Drop PDFs or images to attach
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          addFiles(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />

      {/* Header */}
      <header className="flex items-center gap-3 border-b border-slate-800/60 bg-slate-950 px-4 py-3">
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 className="truncate text-sm font-medium text-slate-200">
            {conversation?.title || "New Chat"}
          </h2>
          {badge && (
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.color}`}>
              {badge.label}
            </span>
          )}
        </div>
        <ModelSelector selectedModel={selectedModel} onSelectModel={onUpdateModel} />
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length > 0 ? (
          <div className="mx-auto max-w-3xl px-4 py-6">
            {messages.map((msg, idx) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isStreaming={loading && idx === messages.length - 1 && msg.role === "assistant"}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-4 py-8 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/5">
              <span className="text-2xl">✦</span>
            </div>
            <h2 className="mb-2 text-2xl font-bold tracking-tight text-white">
              What would you like to{" "}
              <span className="text-blue-400">{isImage ? "create" : "learn"}</span>?
            </h2>
            <p className="mb-8 max-w-sm text-sm text-slate-500">
              {isImage
                ? "Describe an image, or attach a file to ask questions about it."
                : "Ask questions, solve PYQs, revise topics, or upload an assignment PDF or image."}
            </p>
            {!isImage && (
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    onClick={() => setInput(suggestion.prompt)}
                    className="rounded-full border border-slate-800 bg-slate-900/60 px-4 py-2 text-xs text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200"
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-800/60 bg-slate-950 px-4 py-4">
        <div className="mx-auto max-w-3xl">
          {selectedFiles.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {selectedFiles.map((file, index) => (
                <div
                  key={`${file.name}-${file.lastModified}-${index}`}
                  className="flex max-w-full items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-900 px-3 py-2"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-sm">
                    {file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf") ? "📄" : "🖼️"}
                  </span>
                  <span className="min-w-0">
                    <span className="block max-w-[210px] truncate text-xs text-slate-200">{file.name}</span>
                    <span className="block text-[10px] text-slate-500">{formatBytes(file.size)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    aria-label={`Remove ${file.name}`}
                    className="ml-1 rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-white"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {attachmentError && (
            <p role="alert" className="mb-2 text-xs text-rose-400">{attachmentError}</p>
          )}

          <div className="flex items-end gap-2 rounded-2xl border border-slate-700/60 bg-slate-900 px-3 py-3 transition-colors focus-within:border-blue-500/40">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || selectedFiles.length >= MAX_FILES}
              aria-label="Attach PDF or image"
              title="Attach PDF or image"
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-800 hover:text-blue-300 disabled:opacity-40"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M15.5 6.5l-6.8 6.8a2.25 2.25 0 103.18 3.18l7.07-7.07a4 4 0 00-5.66-5.66L5.87 11.2a5.75 5.75 0 108.13 8.13l5.3-5.3" />
              </svg>
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              placeholder={placeholder}
              disabled={loading}
              className="min-h-6 max-h-40 flex-1 resize-none bg-transparent py-2 text-sm text-white outline-none placeholder:text-slate-600 disabled:opacity-40"
              style={{ minHeight: "24px", maxHeight: "160px" }}
            />
            <button
              onClick={handleSend}
              disabled={loading || (!input.trim() && selectedFiles.length === 0)}
              aria-label="Send message"
              className="mb-0.5 flex shrink-0 items-center justify-center rounded-xl bg-blue-600 p-2.5 text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
            >
              {loading ? (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-[10px] text-slate-600">
              PDF, JPG, PNG, WEBP · Up to 5 files · 4 MB total
            </p>
            <p className="text-[10px] text-slate-700">
              Files stay in this chat session; reattach after refresh.
            </p>
          </div>
          <p className="mt-1 text-center text-[10px] text-slate-700">
            NISAKSHI may make mistakes. Verify important information.
          </p>
        </div>
      </div>
    </div>
  );
}
