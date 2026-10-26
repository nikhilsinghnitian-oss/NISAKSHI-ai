# Phase 0 — Baseline Audit

**Audit date:** 2026-10-26  
**Repository:** `nikhilsinghnitian-oss/NISAKSHI-ai`  
**Default branch:** `main`  
**Working branch:** `codex/phase-0-baseline-and-security`

## Scope and method

This baseline was assembled by reading selected repository files through the connected GitHub integration. No repository clone, local build, test suite, dynamic penetration test, complete commit-history secret scan, cloud deployment, or production data access was performed. Findings below are limited to files actually inspected.

## Confirmed observations

| Area | Observed state | Consequence |
|---|---|---|
| Frontend | Next.js 16.3.2, React 19, Auth.js v5 beta, Prisma 5.22 | Modern stack, but builds and runtime behavior still need CI verification. |
| Backend | FastAPI; startup requires `GEMINI_API_KEY`; calls `google-genai` | Not yet compatible with the self-hosted-inference requirement. |
| Authentication bridge | Frontend signs a custom HMAC token; backend verifies it | Needs strict shared claims/configuration and consistent token validation. |
| Token verification | Frontend verifier compared signature strings with `!==`; backend uses `hmac.compare_digest` | Frontend signature comparison and token claims should be hardened. |
| CORS | Backend uses `allow_origin_regex=r"https?://.*"`, credentials enabled, and all methods/headers | Origin policy is overbroad and should use an explicit allowlist. |
| Request bounds | Chat/image models and Next.js routes had limited/no explicit input length/type validation | Add request limits and schema checks; shared rate limiting remains a launch requirement. |
| Message persistence | Prisma PostgreSQL schema stores user, conversation, message, and media URL metadata | Useful foundation; must verify all API paths enforce ownership. |
| Messages endpoint | Conversation ownership check is present, but role/content/media input validation is not strict | Restrict roles and bound content and media fields. |
| Browser storage | `frontend/app/lib/storage.ts` stores chat JSON in localStorage | Chat content may persist in the browser unencrypted; this conflicts with a strong private-chat expectation. |
| Deployment docs | `DEPLOYMENT.md` documents Vercel + a separately hosted FastAPI backend + PostgreSQL + Gemini | Documentation must be changed as the architecture migrates to self-hosted inference and private object storage. |
| Cloud storage | No cloud-object-storage upload pipeline or attachment metadata is present in the inspected Prisma schema | File storage/ingestion remains a future phase. |
| Repository hygiene | `.gitignore` excludes environment files and common build artifacts | Helpful but not a substitute for a complete secret/history scan. |

## Positive observations

- Auth.js session checks exist in inspected Next.js chat/image/messages handlers.
- The inspected conversation-specific routes check ownership before returning/modifying a conversation.
- Backend token signature verification already uses Python's timing-safe `hmac.compare_digest`.
- The inspected `.env.example` contains placeholders rather than a real API key.
- Main-branch work is not being modified by this implementation branch.

## Risks not yet verified dynamically

- Whether every API route and deployment path enforces authentication consistently.
- Whether any credentials were committed in past history, artifacts, or uninspected files.
- Whether frontend and backend builds currently succeed from a clean checkout.
- Whether current model IDs and rate-limit fallback behavior are valid under the provider's current API.
- Whether browser localStorage chat data is active in the production UI path.
- Whether deployed CORS/auth settings are identical to repository defaults.
- Whether deletion/account lifecycle and backup retention are implemented elsewhere.

## Phase 0 result

**Baseline is partially complete, not production-certified.** A phased plan is recorded in `PHASED_IMPLEMENTATION_PLAN.md`. Phase 1 work starts with the issues that can be addressed safely in source control; full runtime verification remains a required gate.
