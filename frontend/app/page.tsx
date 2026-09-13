import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const session = await auth();
  if (session) redirect("/chat");

  return (
    <div className="min-h-screen bg-[#080c14] text-white selection:bg-blue-500/30">
      {/* ── Navigation ── */}
      <nav className="fixed top-0 z-50 w-full border-b border-white/5 bg-[#080c14]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold shadow-lg shadow-blue-600/30">
              ✦
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white">NISAKSHI AI</span>
              <span className="ml-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-blue-400">
                Workspace
              </span>
            </div>
          </div>
          <Link
            href="/api/auth/signin?callbackUrl=/chat"
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2 text-xs font-semibold text-white hover:bg-white/10 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-24 text-center">
        {/* Subtle grid background */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        {/* Radial gradient center */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(59,130,246,0.1),transparent)]" />

        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/5 px-4 py-1.5 text-xs text-blue-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400" />
          </span>
          Next-Generation Academic AI Workspace
        </div>

        {/* Headline */}
        <h1 className="mb-6 max-w-4xl text-5xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl md:text-7xl">
          Your personal AI
          <br />
          <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-blue-600 bg-clip-text text-transparent">
            tutor & creator.
          </span>
        </h1>

        {/* Subheading */}
        <p className="mb-10 max-w-xl text-base leading-relaxed text-slate-400">
          Intelligent chat, native visual creation, and persistent conversation history designed for ambitious engineers and students.
        </p>

        {/* CTA */}
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/api/auth/signin?callbackUrl=/chat"
            className="flex items-center gap-3 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-slate-900 shadow-xl shadow-white/10 hover:bg-slate-100 transition-all hover:scale-[1.02]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </Link>
        </div>

        {/* Product preview card */}
        <div className="mt-16 w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
              <span className="ml-2 text-xs font-medium text-slate-500">NISAKSHI AI Workspace</span>
            </div>
            <span className="text-[11px] text-blue-400 font-medium">✦ NISAKSHI Chat</span>
          </div>
          <div className="p-6 text-left">
            <div className="flex justify-end mb-4">
              <div className="rounded-2xl rounded-br-md bg-blue-600 px-4 py-2.5 text-sm text-white">
                Explain DBMS normalization in simple terms
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-xs text-blue-400">✦</div>
              <div className="rounded-2xl border border-slate-700/40 bg-slate-800/50 px-4 py-3 text-sm leading-relaxed text-slate-300">
                <strong className="text-white">Database Normalization</strong> is the process of organizing data in a relational database to minimize redundancy and eliminate anomalies.
                <br /><br />
                <span className="font-mono text-blue-300">1NF</span> — Atomic values with no repeating groups
                <br />
                <span className="font-mono text-blue-300">2NF</span> — No partial dependencies on composite keys
                <br />
                <span className="font-mono text-blue-300">3NF</span> — No transitive dependencies between non-key attributes
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight">
            Designed for <span className="text-blue-400">engineering excellence</span>
          </h2>
          <p className="text-slate-400">
            One unified workspace. Multi-modal intelligence.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: "✦",
              color: "blue",
              title: "NISAKSHI Chat",
              desc: "Solve PYQs, grasp complex engineering concepts, and debug code with intelligent streaming responses.",
            },
            {
              icon: "🖼",
              color: "purple",
              title: "NISAKSHI Image",
              desc: "Generate technical diagrams, concept illustrations, and project visuals directly in conversation.",
            },
            {
              icon: "💾",
              color: "emerald",
              title: "Account Memory",
              desc: "All your chats and assets are securely linked to your account. Access your knowledge base anytime.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-white/5 bg-white/[0.02] p-6 hover:border-white/10 hover:bg-white/[0.04] transition-all"
            >
              <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-${f.color}-500/20 bg-${f.color}-500/10 text-xl`}>
                {f.icon}
              </div>
              <h3 className="mb-2 font-semibold text-white">{f.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Capabilities Showcase ── */}
      <section className="border-y border-white/5 bg-white/[0.015] px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <p className="mb-10 text-center text-xs font-semibold uppercase tracking-widest text-slate-500">
            Core Capabilities
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
            {[
              { name: "NISAKSHI Chat", icon: "✦" },
              { name: "NISAKSHI Image", icon: "🖼" },
              { name: "Code Assistant", icon: "⚡" },
              { name: "Exam Revision", icon: "📚" },
            ].map((m) => (
              <div key={m.name} className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors">
                <span>{m.icon}</span>
                <span className="text-sm font-medium">{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="px-6 py-24 text-center">
        <h2 className="mb-6 text-3xl font-bold tracking-tight">
          Ready to elevate your studies?
        </h2>
        <Link
          href="/api/auth/signin?callbackUrl=/chat"
          className="inline-flex items-center gap-3 rounded-full bg-blue-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:bg-blue-500 transition-all hover:scale-[1.02]"
        >
          Enter NISAKSHI AI
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 px-6 py-8 text-center">
        <p className="text-xs text-slate-600">
          © 2026 NISAKSHI AI. Built for B.Tech students & engineers.
        </p>
      </footer>
    </div>
  );
}