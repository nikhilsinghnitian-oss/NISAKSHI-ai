"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Sidebar from "../components/Sidebar";
import ChatArea from "../components/ChatArea";

export interface DbMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "image" | "video";
  model?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  videoStatus?: string;
  createdAt: string;
}

export interface DbConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages?: DbMessage[];
}

function genTitle(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const TEXT_NEGATIVE_KEYWORDS = [
  "code", "program", "script", "function", "algorithm",
  "study plan", "plan", "notes", "summary", "essay",
  "solution", "explanation", "question", "quiz", "syllabus"
];

const IMAGE_INTENT_REGEX =
  /(^(draw|paint|sketch|illustrate)\b)|(\b(generate|create|make|draw|paint|sketch|illustrate)\s+(an?\s+)?(\w+\s+)*(image|picture|poster|logo|drawing|photo|portrait|illustration|wallpaper|artwork|diagram)\b)|(\b(generate|create|draw|paint|render)\s+(a|an)\s+.*?\b(castle|city|car|landscape|sunset|mountain|portrait|tiger|lion|cat|dog|robot|tree|forest|space|planet|star|galaxy|room|building|scene|scenery|character|avatar|creature|dragon)\b)/i;

function detectImageIntent(text: string): boolean {
  const lower = text.toLowerCase();
  for (const kw of TEXT_NEGATIVE_KEYWORDS) {
    if (lower.includes(kw)) return false;
  }
  return IMAGE_INTENT_REGEX.test(text.trim());
}

export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [conversations, setConversations] = useState<DbConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<DbMessage[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      loadConversations();
    } else if (status === "unauthenticated") {
      setReady(true);
      router.push("/");
    }
  }, [status, loadConversations, router]);

  const loadMessages = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setActiveMessages(data.conversation?.messages || []);
  }, []);

  useEffect(() => {
    if (activeId) {
      loadMessages(activeId);
    } else {
      setActiveMessages([]);
    }
  }, [activeId, loadMessages]);

  const createConversation = async (title: string = "New Chat") => {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.conversation as DbConversation;
  };

  const handleNewChat = async () => {
    const conv = await createConversation("New Chat");
    if (!conv) return;
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setActiveMessages([]);
    setSelectedModel(undefined);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const handleSelectChat = (id: string) => {
    setActiveId(id);
    setSelectedModel(undefined);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const handleDeleteChat = async (id: string) => {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === activeId) {
      setActiveId(null);
      setActiveMessages([]);
    }
  };

  const handleRenameChat = async (id: string, newTitle: string) => {
    const res = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });
    if (!res.ok) return;
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
    );
  };

  const saveMessage = async (
    conversationId: string,
    role: string,
    content: string,
    model?: string,
    extras?: { imageUrl?: string; type?: "text" | "image" }
  ) => {
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        role,
        content,
        model,
        imageUrl: extras?.imageUrl,
      }),
    });
  };

  const sendMessage = async (text: string) => {
    if (loading) return;

    let convId = activeId;
    if (!convId) {
      const title = genTitle(text);
      const conv = await createConversation(title);
      if (!conv) return;
      convId = conv.id;
      setConversations((prev) => [conv, ...prev]);
      setActiveId(convId);
    } else {
      const activeConv = conversations.find((c) => c.id === convId);
      if (activeConv && activeConv.title === "New Chat" && activeMessages.length === 0) {
        const title = genTitle(text);
        handleRenameChat(convId, title);
      }
    }

    const finalConvId = convId;
    const model = selectedModel;

    // Explicit intent routing per Section 9 & 15:
    // - If user selected "image": always image
    // - If user selected "chat": always text
    // - If Auto (undefined): detect image intent; default to text!
    const isImage = model === "image" || (!model && detectImageIntent(text));

    const tempUserMsg: DbMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      type: "text",
      createdAt: new Date().toISOString(),
    };
    const tempAsstMsg: DbMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      type: isImage ? "image" : "text",
      createdAt: new Date().toISOString(),
    };
    const asstId = tempAsstMsg.id;

    setActiveMessages((prev) => [...prev, tempUserMsg, tempAsstMsg]);
    setLoading(true);

    await saveMessage(finalConvId, "user", text, model, { type: "text" });

    // ── IMAGE GENERATION (POST /api/image) ──
    if (isImage) {
      try {
        const res = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text, conversationId: finalConvId }),
        });
        const data = await res.json();

        if (data.success && data.image_url) {
          setActiveMessages((prev) =>
            prev.map((m) =>
              m.id === asstId ? { ...m, imageUrl: data.image_url, type: "image" } : m
            )
          );
          await saveMessage(finalConvId, "assistant", "", model, {
            imageUrl: data.image_url,
            type: "image",
          });
        } else {
          const errMsg = data.error || "AI image creation is temporarily unavailable. Please try again.";
          setActiveMessages((prev) =>
            prev.map((m) => (m.id === asstId ? { ...m, content: errMsg, type: "text" } : m))
          );
          await saveMessage(finalConvId, "assistant", errMsg, model, { type: "text" });
        }
      } catch {
        const errMsg = "AI service is temporarily unavailable. Please try again.";
        setActiveMessages((prev) =>
          prev.map((m) => (m.id === asstId ? { ...m, content: errMsg, type: "text" } : m))
        );
      } finally {
        setLoading(false);
        loadConversations();
      }
      return;
    }

    // ── NORMAL TEXT CHAT (POST /api/chat) ──
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId: finalConvId }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "AI service is temporarily unavailable.");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") break;

          try {
            const data = JSON.parse(payload);
            const chunk = data.text || "";
            const errorChunk = data.error ? `\n${data.error}` : "";
            const addition = chunk || errorChunk;
            if (addition) {
              fullContent += addition;
              setActiveMessages((prev) =>
                prev.map((m) =>
                  m.id === asstId
                    ? { ...m, content: m.content + addition, type: "text" }
                    : m
                )
              );
            }
          } catch {
            continue;
          }
        }
      }

      if (fullContent) {
        await saveMessage(finalConvId, "assistant", fullContent, model, { type: "text" });
      }
    } catch (err: any) {
      console.error(err);
      const errMsg = err.message || "AI service is temporarily unavailable. Please try again.";
      setActiveMessages((prev) =>
        prev.map((m) => (m.id === asstId ? { ...m, content: errMsg, type: "text" } : m))
      );
    } finally {
      setLoading(false);
      loadConversations();
    }
  };

  if (status === "loading" || !ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-sm text-slate-400">Loading NISAKSHI AI...</p>
        </div>
      </div>
    );
  }

  const activeConversation = conversations.find((c) => c.id === activeId) || null;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-white">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        onRenameChat={handleRenameChat}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <ChatArea
        conversation={activeConversation}
        messages={activeMessages}
        loading={loading}
        selectedModel={selectedModel}
        onSendMessage={sendMessage}
        onUpdateModel={setSelectedModel}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
      />
    </div>
  );
}
