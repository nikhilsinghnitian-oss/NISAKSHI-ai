"use client";

import { useState } from "react";
import UserProfile from "./UserProfile";
import type { DbConversation } from "../chat/page";

interface Props {
  conversations: DbConversation[];
  activeId: string | null;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

function groupByDate(convs: DbConversation[]) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 7 * 86400000;

  const sorted = [...convs].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const today: DbConversation[] = [];
  const yesterday: DbConversation[] = [];
  const week: DbConversation[] = [];
  const older: DbConversation[] = [];

  for (const c of sorted) {
    const t = new Date(c.updatedAt).getTime();
    if (t >= todayStart) today.push(c);
    else if (t >= yesterdayStart) yesterday.push(c);
    else if (t >= weekStart) week.push(c);
    else older.push(c);
  }

  const groups: { label: string; items: DbConversation[] }[] = [];
  if (today.length) groups.push({ label: "Today", items: today });
  if (yesterday.length) groups.push({ label: "Yesterday", items: yesterday });
  if (week.length) groups.push({ label: "Previous 7 days", items: week });
  if (older.length) groups.push({ label: "Older", items: older });
  return groups;
}

function ConvItem({
  conv,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: {
  conv: DbConversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (t: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(conv.title);
  const [showMenu, setShowMenu] = useState(false);

  const commitRename = () => {
    const t = editVal.trim();
    if (t && t !== conv.title) onRename(t);
    setEditing(false);
  };

  return (
    <div
      className={`group relative flex cursor-pointer items-center gap-1 rounded-lg px-3 py-2 text-sm transition-colors ${
        isActive
          ? "bg-slate-700/80 text-white"
          : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
      }`}
      onClick={() => {
        if (!editing) onSelect();
      }}
    >
      {editing ? (
        <input
          autoFocus
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-slate-900 rounded px-2 py-0.5 text-white outline-none text-xs"
        />
      ) : (
        <span className="flex-1 truncate">{conv.title}</span>
      )}

      {!editing && (
        <div
          className="hidden shrink-0 items-center gap-1 group-hover:flex"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { setEditing(true); setEditVal(conv.title); }}
            className="rounded p-1 text-slate-500 hover:text-blue-400 transition-colors"
            title="Rename"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="rounded p-1 text-slate-500 hover:text-red-400 transition-colors"
            title="Delete"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  conversations,
  activeId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onRenameChat,
  isOpen,
  onClose,
}: Props) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  const groups = groupByDate(filtered);

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex w-72 flex-col
          border-r border-slate-800/60 bg-slate-950
          transform transition-transform duration-200 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:z-0 md:translate-x-0 md:transition-none
          ${!isOpen ? "md:hidden" : ""}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/60 p-4">
          <div>
            <h1 className="text-base font-bold tracking-tight text-white">NISAKSHI AI</h1>
            <p className="text-[10px] font-medium uppercase tracking-widest text-blue-400/70">
              AI Workspace
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white transition-colors md:hidden"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* New Chat */}
        <div className="px-3 pt-3 pb-2">
          <button
            onClick={onNewChat}
            className="flex w-full items-center gap-2.5 rounded-xl border border-slate-700/60 bg-slate-900/50 px-4 py-2.5 text-sm text-slate-300 hover:border-blue-500/40 hover:bg-blue-500/10 hover:text-blue-300 transition-all duration-150"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Chat
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
            <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search chats..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-xs text-slate-300 outline-none placeholder:text-slate-600"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {groups.length === 0 && (
            <p className="px-3 py-8 text-center text-xs text-slate-600">
              {search ? "No chats match your search" : "No conversations yet.\nStart a new chat!"}
            </p>
          )}
          {groups.map((group) => (
            <div key={group.label} className="mb-2">
              <p className="mb-1 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                {group.label}
              </p>
              {group.items.map((conv) => (
                <ConvItem
                  key={conv.id}
                  conv={conv}
                  isActive={conv.id === activeId}
                  onSelect={() => onSelectChat(conv.id)}
                  onDelete={() => onDeleteChat(conv.id)}
                  onRename={(t) => onRenameChat(conv.id, t)}
                />
              ))}
            </div>
          ))}
        </div>

        {/* User Profile */}
        <UserProfile />
      </aside>
    </>
  );
}
