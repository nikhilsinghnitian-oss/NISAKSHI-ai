"use client";

import { useState, useRef, useEffect } from "react";
import type { DbMessage, DbConversation } from "../chat/page";
import MessageBubble from "./MessageBubble";
import ModelSelector from "./ModelSelector";

interface Props {
  conversation: DbConversation | null;
  messages: DbMessage[];
  loading: boolean;
  selectedModel: string | undefined;
  onSendMessage: (message: string) => void;
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
  "image": { label: "NISAKSHI Image", color: "bg-purple-500/10 text-purple-300 border-purple-500/20" },
  "chat": { label: "NISAKSHI Chat", color: "bg-blue-500/10 text-blue-300 border-blue-500/20" },
};

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const lastMsg = messages[messages.length - 1];
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, lastMsg?.content]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [conversation?.id]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    onSendMessage(text);
    setInput("");
  };

  const isImage = selectedModel === "image";

  const badge = selectedModel ? MODEL_BADGE[selectedModel] : null;

  const placeholder = isImage
    ? "Describe an image to create..."
    : "Ask anything about your B.Tech subjects...";

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-slate-800/60 bg-slate-950 px-4 py-3">
        <button
          onClick={onToggleSidebar}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex flex-1 items-center gap-2 min-w-0">
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
                isStreaming={
                  loading && idx === messages.length - 1 && msg.role === "assistant"
                }
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
              <span className="text-blue-400">
                {isImage ? "create" : "learn"}
              </span>
              ?
            </h2>

            <p className="mb-8 max-w-sm text-sm text-slate-500">
              {isImage
                ? "Describe an image and NISAKSHI will create it."
                : "Ask questions, solve PYQs, revise topics, generate notes."}
            </p>

            {!isImage && (
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => setInput(s.prompt)}
                    className="rounded-full border border-slate-800 bg-slate-900/60 px-4 py-2 text-xs text-slate-400 hover:border-slate-700 hover:text-slate-200 transition-colors"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-slate-800/60 bg-slate-950 px-4 py-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-3 rounded-2xl border border-slate-700/60 bg-slate-900 px-4 py-3 focus-within:border-blue-500/40 transition-colors">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={placeholder}
              disabled={loading}
              className="flex-1 resize-none bg-transparent text-sm text-white outline-none placeholder:text-slate-600 disabled:opacity-40"
              style={{ minHeight: "24px", maxHeight: "160px" }}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="mb-0.5 flex shrink-0 items-center justify-center rounded-xl bg-blue-600 p-2 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
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
          <p className="mt-2 text-center text-[10px] text-slate-700">
            NISAKSHI may make mistakes. Verify important information.
          </p>
        </div>
      </div>
    </div>
  );
}
