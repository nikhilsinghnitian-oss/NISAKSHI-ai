"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type EntrancePhase = "awakening" | "logo" | "brand" | "pulse" | "transition" | "complete";
type PreviewMode = "general" | "study";

const WORDMARK = "NISAKSHI AI".split("");

function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" role="img" aria-label="NISAKSHI mark">
      <defs>
        <linearGradient id="ns-mark-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8faff" />
          <stop offset="48%" stopColor="#6f8dff" />
          <stop offset="100%" stopColor="#70d8e9" />
        </linearGradient>
      </defs>
      <path d="M60 12 94 26 108 60 94 94 60 108 26 94 12 60 26 26Z" fill="none" stroke="url(#ns-mark-gradient)" strokeWidth="2" />
      <path d="M60 8C63 39 81 57 112 60 81 63 63 81 60 112 57 81 39 63 8 60 39 57 57 39 60 8Z" fill="#8b7cff" fillOpacity=".27" stroke="url(#ns-mark-gradient)" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="60" cy="60" r="4" fill="#f8faff" />
    </svg>
  );
}

export default function CinematicLanding() {
  const [phase, setPhase] = useState<EntrancePhase>("awakening");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("general");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<EntrancePhase>("awakening");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const alreadySeen = window.sessionStorage.getItem("nisakshi:entrance-seen") === "1";

    if (reducedMotion || alreadySeen) {
      setPhase("complete");
      return;
    }

    const schedule: Array<[EntrancePhase, number]> = [
      ["logo", 420],
      ["brand", 1150],
      ["pulse", 1750],
      ["transition", 2450],
      ["complete", 3150],
    ];
    const timers = schedule.map(([nextPhase, delay]) =>
      window.setTimeout(() => {
        phaseRef.current = nextPhase;
        setPhase(nextPhase);
        if (nextPhase === "complete") {
          window.sessionStorage.setItem("nisakshi:entrance-seen", "1");
        }
      }, delay)
    );

    return () => timers.forEach(window.clearTimeout);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    const palette = ["#4f7cff", "#8b7cff", "#58c7e8", "#f8faff"];
    let width = 0;
    let height = 0;
    let frame = 0;
    const particles = Array.from({ length: window.innerWidth < 700 ? 20 : 38 }, (_, index) => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2 - 0.035,
      radius: Math.random() * 1.25 + 0.45,
      alpha: Math.random() * 0.28 + 0.1,
      targetAlpha: Math.random() * 0.34 + 0.12,
      color: palette[index % palette.length],
    }));

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      const centerX = width / 2;
      const centerY = height / 2;

      particles.forEach((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (phaseRef.current === "logo" || phaseRef.current === "pulse") {
          const dx = centerX - particle.x;
          const dy = centerY - particle.y;
          const distance = Math.hypot(dx, dy) || 1;
          if (distance < 300) {
            particle.x += (dx / distance) * 0.12;
            particle.y += (dy / distance) * 0.12;
          }
        }

        if (particle.x < -4) particle.x = width + 4;
        if (particle.x > width + 4) particle.x = -4;
        if (particle.y < -4) particle.y = height + 4;
        if (particle.y > height + 4) particle.y = -4;

        particle.alpha += (particle.targetAlpha - particle.alpha) * 0.025;
        context.globalAlpha = particle.alpha;
        context.fillStyle = particle.color;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      });

      context.globalAlpha = 1;
      frame = window.requestAnimationFrame(draw);
    };

    resize();
    frame = window.requestAnimationFrame(draw);
    window.addEventListener("resize", resize, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const finishIntro = () => {
    phaseRef.current = "complete";
    setPhase("complete");
    window.sessionStorage.setItem("nisakshi:entrance-seen", "1");
  };

  const signInHref = "/api/auth/signin?callbackUrl=/chat";

  return (
    <div className="ns-landing" data-phase={phase}>
      <div className="ns-ambient" aria-hidden="true">
        <div className="ns-glow ns-glow-primary" />
        <div className="ns-glow ns-glow-secondary" />
        <div className="ns-grid" />
        <canvas ref={canvasRef} className="ns-particles" />
      </div>

      <div className="ns-landing-content">
        <header className="ns-landing-header">
          <Link href="/" className="ns-brand" aria-label="NISAKSHI AI home">
            <BrandMark className="ns-brand-mark" />
            <span className="ns-brand-copy">
              <strong>NISAKSHI AI</strong>
              <small>Your AI. Your Space.</small>
            </span>
          </Link>

          <nav className="ns-nav" aria-label="Main navigation">
            <a href="#experiences">Experiences</a>
            <a href="#workspace">Workspace</a>
            <a href="#principles">How it works</a>
          </nav>

          <Link href={signInHref} className="ns-nav-cta">
            Sign in <span aria-hidden="true">↗</span>
          </Link>
        </header>

        <main className="ns-hero" id="workspace">
          <section className="ns-hero-copy">
            <div className="ns-eyebrow">
              <span className="ns-status-dot" />
              ONE WORKSPACE · TWO INTELLIGENT EXPERIENCES
            </div>

            <h1>
              Think beyond.
              <br />
              <span>Learn with context.</span>
            </h1>

            <p className="ns-hero-lede">
              An AI workspace for open-ended thinking, research and creation—with a separate academic experience built around your college and verified study material.
            </p>

            <div className="ns-hero-actions">
              <Link href={signInHref} className="ns-primary-cta">
                Enter NISAKSHI <span aria-hidden="true">→</span>
              </Link>
              <a href="#experiences" className="ns-secondary-cta">
                Explore the experiences
              </a>
            </div>

            <div className="ns-proof-row">
              <span><i className="ns-proof-icon">✦</i> Open-ended AI</span>
              <span><i className="ns-proof-icon">⌁</i> Source-aware study</span>
              <span><i className="ns-proof-icon">◈</i> One saved workspace</span>
            </div>
          </section>

          <section className="ns-preview-shell" aria-label="Interactive product preview">
            <div className="ns-preview-topbar">
              <div className="ns-window-dots" aria-hidden="true"><i /><i /><i /></div>
              <span className="ns-preview-label">NISAKSHI WORKSPACE</span>
              <span className="ns-preview-status"><i /> LIVE CONCEPT</span>
            </div>

            <div className="ns-preview-body">
              <div className="ns-preview-brandline">
                <div className="ns-mini-mark"><BrandMark /></div>
                <div>
                  <strong>NISAKSHI AI</strong>
                  <small>Your AI. Your Space.</small>
                </div>
                <span className="ns-preview-online">● Ready</span>
              </div>

              <div className="ns-preview-tabs" role="tablist" aria-label="Preview experience">
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewMode === "general"}
                  className={previewMode === "general" ? "active" : ""}
                  onClick={() => setPreviewMode("general")}
                >
                  <span>✦</span> General Chat
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewMode === "study"}
                  className={previewMode === "study" ? "active" : ""}
                  onClick={() => setPreviewMode("study")}
                >
                  <span>⌂</span> Study Mode
                </button>
              </div>

              {previewMode === "general" ? (
                <div className="ns-preview-conversation" role="tabpanel">
                  <div className="ns-preview-context">
                    <span className="ns-context-pill">OPEN AI EXPERIENCE</span>
                    <span>Ask anything, explore freely</span>
                  </div>
                  <div className="ns-preview-user">
                    Help me plan a small app that solves a real student problem.
                  </div>
                  <div className="ns-preview-answer">
                    <div className="ns-answer-heading"><span className="ns-answer-orb">✦</span><strong>NISAKSHI</strong><small>GENERAL CHAT</small></div>
                    <p>Let’s start with the problem, not the feature list. We can map the user journey, identify friction points, and shape a practical first version.</p>
                    <div className="ns-answer-tags"><span>Research</span><span>Brainstorm</span><span>Build</span></div>
                  </div>
                </div>
              ) : (
                <div className="ns-preview-conversation" role="tabpanel">
                  <div className="ns-preview-context">
                    <span className="ns-context-pill study">ACADEMIC CONTEXT</span>
                    <span>College · Branch · Semester</span>
                  </div>
                  <div className="ns-preview-user">
                    Explain AVL Trees according to my selected syllabus.
                  </div>
                  <div className="ns-preview-answer">
                    <div className="ns-answer-heading"><span className="ns-answer-orb study">⌂</span><strong>NISAKSHI</strong><small>STUDY MODE</small></div>
                    <p>Study Mode checks your selected curriculum and available verified material first. Unsupported topics are identified instead of being filled with generic answers.</p>
                    <div className="ns-source-placeholder"><span>▤</span> Source references appear with verified documents</div>
                  </div>
                </div>
              )}

              <div className="ns-preview-composer">
                <span>Message NISAKSHI...</span>
                <span className="ns-composer-plus">＋</span>
                <span className="ns-composer-send">↑</span>
              </div>
              <p className="ns-preview-footnote">Illustrative interface preview · Not a live conversation</p>
            </div>
            <div className="ns-preview-orbit ns-orbit-one" />
            <div className="ns-preview-orbit ns-orbit-two" />
          </section>
        </main>

        <section className="ns-experiences" id="experiences">
          <div className="ns-section-heading">
            <span className="ns-section-kicker">TWO PURPOSE-BUILT MODES</span>
            <h2>One assistant. <span>Two clear boundaries.</span></h2>
            <p>Choose the experience that matches what you are trying to do. The rules of one mode never silently spill into the other.</p>
          </div>

          <div className="ns-experience-grid">
            <article className="ns-experience-card general">
              <div className="ns-experience-icon">✦</div>
              <div className="ns-card-kicker">01 / OPEN ENDED</div>
              <h3>General Chat</h3>
              <p>Explore any topic with an open AI assistant. No college-document restriction and no academic-only boundary.</p>
              <div className="ns-capability-list">
                <span>Technology & coding</span><span>Research & current affairs</span><span>Career, business & creativity</span><span>Everyday questions & productivity</span>
              </div>
              <Link href={signInHref} className="ns-card-link">Start a conversation <span aria-hidden="true">↗</span></Link>
              <div className="ns-card-aura" aria-hidden="true" />
            </article>

            <article className="ns-experience-card study">
              <div className="ns-experience-icon">⌂</div>
              <div className="ns-card-kicker">02 / ACADEMICALLY GROUNDED</div>
              <h3>Study Mode</h3>
              <p>Learn from your selected institution, curriculum, semester and verified academic documents—not unsupported guesses.</p>
              <div className="ns-capability-list">
                <span>Official syllabus & regulations</span><span>College notes & faculty material</span><span>Approved assignments & PYQs</span><span>Page-level source references</span>
              </div>
              <Link href={signInHref} className="ns-card-link">Explore Study Mode <span aria-hidden="true">↗</span></Link>
              <div className="ns-card-aura" aria-hidden="true" />
            </article>
          </div>
        </section>

        <section className="ns-principles" id="principles">
          <div className="ns-principle-copy">
            <span className="ns-section-kicker">BUILT AROUND YOUR INTENT</span>
            <h2>Freedom when you explore. <span>Evidence when you study.</span></h2>
            <p>General Chat can discuss the wider world. Study Mode is designed to retrieve from the academic sources linked to your profile and clearly say when those sources do not support an answer.</p>
          </div>
          <div className="ns-principle-points">
            <div><span>01</span><p><strong>Separate conversations</strong><small>Every conversation keeps its own selected mode.</small></p></div>
            <div><span>02</span><p><strong>No silent fallback</strong><small>Study Mode must not switch to generic AI when sources are missing.</small></p></div>
            <div><span>03</span><p><strong>Flexible teaching</strong><small>Simple language, Hinglish, examples and step-by-step explanations remain welcome.</small></p></div>
          </div>
        </section>

        <footer className="ns-footer">
          <Link href="/" className="ns-footer-brand"><BrandMark /> NISAKSHI AI</Link>
          <span>Your AI. Your Space.</span>
          <span>© 2026 NISAKSHI AI</span>
        </footer>
      </div>

      <div className="ns-intro" data-phase={phase} aria-hidden={phase === "complete"}>
        <div className="ns-intro-logo">
          <div className="ns-intro-halo" />
          <div className="ns-intro-orbit" aria-hidden="true">
            <svg viewBox="0 0 200 200">
              <defs>
                <linearGradient id="ns-orbit-gradient"><stop stopColor="#4f7cff" stopOpacity=".55" /><stop offset=".5" stopColor="#8b7cff" stopOpacity=".18" /><stop offset="1" stopColor="#58c7e8" stopOpacity=".5" /></linearGradient>
              </defs>
              <circle cx="100" cy="100" r="86" fill="none" stroke="url(#ns-orbit-gradient)" strokeDasharray="6 8" />
              <ellipse cx="100" cy="100" rx="94" ry="52" transform="rotate(-28 100 100)" fill="none" stroke="url(#ns-orbit-gradient)" />
              <circle cx="100" cy="14" r="2.5" fill="#58c7e8" />
            </svg>
          </div>
          <BrandMark className="ns-intro-mark" />
        </div>
        <div className="ns-intro-wordmark" aria-label="NISAKSHI AI">
          {WORDMARK.map((letter, index) => (
            <span key={index} style={{ transitionDelay: (index * 38) + "ms", minWidth: letter === " " ? ".4em" : "auto" }}>
              {letter === " " ? "\u00a0" : letter}
            </span>
          ))}
        </div>
        <p className="ns-intro-tagline">YOUR AI. YOUR SPACE.</p>
        <button type="button" className="ns-skip-intro" onClick={finishIntro} disabled={phase === "complete"}>
          Skip intro <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
