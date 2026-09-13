"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DbMessage } from "../chat/page";

interface Props {
  message: DbMessage;
  isStreaming?: boolean;
}

export default function MessageBubble({ message, isStreaming }: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex justify-end mb-5">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-blue-600 px-4 py-3 text-sm text-white shadow-sm">
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        </div>
      </div>
    );
  }

  const isImageLoading = message.type === "image" && isStreaming && !message.imageUrl;
  const isTextThinking = message.type !== "image" && isStreaming && !message.content;

  return (
    <div className="flex justify-start mb-5">
      {/* Avatar */}
      <div className="mr-3 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-xs font-bold text-blue-400">
        ✦
      </div>

      <div className="max-w-[85%] min-w-0">
        {/* Image response */}
        {message.imageUrl ? (
          <>
            <div className="overflow-hidden rounded-2xl bg-slate-900 border border-slate-700/60 shadow-lg">
              <div
                className="cursor-pointer overflow-hidden group relative"
                onClick={() => setModalOpen(true)}
              >
                <img
                  src={message.imageUrl}
                  alt="Generated image"
                  className="w-full max-w-lg object-contain transition-transform duration-300 group-hover:scale-[1.01]"
                />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="bg-slate-900/80 text-white text-xs px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-1.5 backdrop-blur-sm">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                    Click to enlarge
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-slate-800 bg-slate-900/80">
                <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                  <span className="text-purple-400">🖼</span> NISAKSHI Image
                </span>
                <a
                  href={message.imageUrl}
                  download="nisakshi-image.png"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </a>
              </div>
            </div>

            {/* Modal preview */}
            {modalOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
                onClick={() => setModalOpen(false)}
              >
                <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-2 shadow-2xl">
                  <button
                    onClick={() => setModalOpen(false)}
                    className="absolute top-4 right-4 rounded-full bg-black/60 p-2 text-white hover:bg-black/90 transition-colors z-10"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <img
                    src={message.imageUrl}
                    alt="Generated full view"
                    className="max-h-[85vh] max-w-full object-contain rounded-xl"
                  />
                </div>
              </div>
            )}
          </>
        ) : isImageLoading ? (
          /* Image generating loading state */
          <div className="flex flex-col gap-3 rounded-2xl border border-purple-500/30 bg-purple-950/20 p-5 max-w-md">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-purple-200">Creating your image...</p>
                <p className="text-[11px] text-purple-400/70">NISAKSHI AI</p>
              </div>
            </div>
            <div className="h-44 w-full rounded-xl bg-purple-900/20 animate-pulse border border-purple-500/10 flex items-center justify-center">
              <span className="text-2xl text-purple-400/40">🎨</span>
            </div>
          </div>
        ) : isTextThinking ? (
          /* Text thinking indicator */
          <div className="flex items-center gap-3 rounded-2xl border border-slate-700/40 bg-slate-800/50 px-4 py-3">
            <div className="flex gap-1">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
            <span className="text-xs text-slate-500">Thinking...</span>
          </div>
        ) : (
          /* Markdown text response */
          <div className="rounded-2xl rounded-bl-md border border-slate-700/40 bg-slate-800/50 px-5 py-4">
            <div className="prose prose-invert prose-sm max-w-none text-slate-200 prose-headings:text-slate-100 prose-code:text-blue-300 prose-code:bg-slate-900 prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
