"use client";

import { useState, useRef, useEffect } from "react";

export const MODEL_OPTIONS = [
  { key: "chat",  label: "NISAKSHI Chat",  icon: "✦",  desc: "Conversations & tutoring", type: "text"  },
  { key: "image", label: "NISAKSHI Image", icon: "🖼", desc: "AI image creation",        type: "image" },
] as const;

export type ModelKey = typeof MODEL_OPTIONS[number]["key"];

interface Props {
  selectedModel?: string;
  onSelectModel: (model: string | undefined) => void;
}

export default function ModelSelector({ selectedModel, onSelectModel }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const current = MODEL_OPTIONS.find((m) => m.key === selectedModel);
  const label = current?.label ?? "Auto";
  const icon = current?.icon ?? "✦";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-600 hover:bg-slate-700/80 transition-all"
      >
        <span>{icon}</span>
        <span className="font-medium">{label}</span>
        <svg
          className={`h-3 w-3 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-60 overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900 shadow-2xl z-50">
          {/* Auto */}
          <button
            onClick={() => { onSelectModel(undefined); setOpen(false); }}
            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-800 ${
              !selectedModel ? "text-blue-400 bg-slate-800/50" : "text-slate-300"
            }`}
          >
            <span className="text-base">✦</span>
            <div>
              <p className="text-xs font-semibold">Auto</p>
              <p className="text-[10px] text-slate-500">Automatic intent routing</p>
            </div>
            {!selectedModel && (
              <span className="ml-auto text-blue-400">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </span>
            )}
          </button>

          <div className="border-t border-slate-800/80" />

          {MODEL_OPTIONS.map((m) => (
            <button
              key={m.key}
              onClick={() => { onSelectModel(m.key); setOpen(false); }}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-slate-800 ${
                selectedModel === m.key ? "bg-slate-800/50 text-blue-400" : "text-slate-300"
              }`}
            >
              <span className="text-base">{m.icon}</span>
              <div>
                <p className="text-xs font-medium">{m.label}</p>
                <p className="text-[10px] text-slate-500">{m.desc}</p>
              </div>
              {selectedModel === m.key && (
                <span className="ml-auto text-blue-400">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
