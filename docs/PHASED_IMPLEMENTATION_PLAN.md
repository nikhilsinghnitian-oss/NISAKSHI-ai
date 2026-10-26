# NISAKSHI AI — Phased Implementation Plan

**Status date:** 2026-10-26  
**Working branch:** `codex/phase-0-baseline-and-security`  
**Production branch:** `main` (kept unchanged during this work)

## Product goal

Build NISAKSHI as a private, multi-user AI workspace with a self-hosted inference service. Use cloud compute for the server/model runtime, private object storage for uploaded and generated files, and a database for identity, chats, document metadata, and retrieval indexes. Object storage is not a substitute for compute.

## Architecture guardrails

- AI inference must run on a model service controlled by NISAKSHI; do not require Gemini, OpenAI, or another external AI inference API.
- Keep model serving behind a private network/service boundary where practical. The browser must never receive model-server credentials.
- Store user content in private storage by default. Do not make uploaded or generated objects public.
- Enforce authentication, ownership checks, input bounds, and abuse limits at every user-facing route.
- Build on a dedicated branch and use pull requests; do not push unreviewed implementation changes directly to `main`.
- Keep provider credentials out of the repository. Use a secrets manager in production.
- Treat web search as a separate, opt-in data flow: external websites/search providers may receive the submitted search terms. This must be disclosed in the UI/privacy notice before enabling it.

## Phases and acceptance criteria

### Phase 0 — Baseline, scope, and rollback point
**Status: in progress / documentation underway**
- Confirm the target repository and default branch.
- Inspect the current frontend/backend, authentication, persistence, deployment instructions, and secret-handling conventions.
- Record confirmed gaps separately from items that still require runtime testing.
- Work on a branch; leave `main` untouched.
- **Exit criteria:** audit note and ordered implementation plan committed; no claim of a successful build until CI/local execution confirms it.

### Phase 1 — Security and API hardening
- Restrict backend CORS to configured frontend origins.
- Make short-lived frontend-to-backend HMAC tokens fail closed, validate issuer/audience/time claims, and use timing-safe signature comparison.
- Bound chat/image payloads and validate message roles and content types.
- Add repeatable auth/input tests and a CI workflow.
- Audit all API routes for session checks and per-user ownership; add rate limits at the appropriate shared gateway before public launch.
- **Exit criteria:** security tests pass; route-by-route ownership audit completed; no public launch until rate limits and production auth configuration are verified.

### Phase 2 — Self-hosted model runtime
- Replace the current Gemini-specific inference dependency with a provider-neutral client for a privately hosted OpenAI-compatible inference endpoint (for example, a self-hosted llama.cpp/vLLM-compatible server).
- Keep model ID, endpoint, timeout, context limits, and concurrency configuration server-side.
- Add an explicit model health check and clear unavailable/timeout handling.
- Keep inference endpoint private; prohibit arbitrary user-supplied upstream URLs.
- **Exit criteria:** text streaming works against a locally/self-hosted model with external inference credentials unset; automated tests use a mock HTTP endpoint.

### Phase 3 — Cloud foundation
- Confirm billing, region, data residency, and acceptable monthly spend before creating resources.
- Containerize the API; build and deploy using a controlled pipeline and Artifact Registry.
- Use private Cloud Storage buckets for user files, a managed PostgreSQL database for structured data, and Secret Manager for secrets.
- Give each runtime a least-privilege service account. Use private connectivity for database/model traffic where supported.
- Evaluate CPU-only quantized inference versus GPU-backed model compute. A 4 GB local GPU is a development constraint; it does not define the cloud model server.
- **Exit criteria:** health checks pass in the selected cloud; public access is deliberate and protected; backup/restore and deletion procedures are documented.

### Phase 4 — Secure file workspace
- Support PDF, scanned PDF/image, PPTX, DOCX, TXT/Markdown, CSV/spreadsheets, and audio ingestion in bounded jobs.
- Validate size, MIME type, file signature where possible, ownership, and processing status.
- Upload/download with short-lived signed URLs or authenticated proxy routes; never publish bucket objects.
- Store file metadata and lifecycle status in PostgreSQL; objects belong to a user.
- **Exit criteria:** supported formats tested with normal, corrupt, oversized, and unauthorized files.

### Phase 5 — Private chat, history, and data controls
- Make PostgreSQL-backed conversation history the source of truth; remove full-message localStorage persistence where feasible.
- Verify conversation ownership for every read/write/update/delete path.
- Add account data export and delete-all/account deletion flows, with object and index cleanup.
- Define retention, backup deletion windows, encryption at rest/in transit, and application-level encryption only where key management is designed and recoverable.
- **Exit criteria:** cross-user isolation and deletion tests pass; privacy policy accurately reflects actual data flows.

### Phase 6 — Retrieval-augmented generation (RAG)
- Build parsing, chunking, metadata filtering, and per-user vector retrieval.
- Prefer a self-hosted embedding model; keep embeddings and source chunks tied to an owner and document ID.
- Require retrieved source excerpts/citations for document-grounded answers and defend against prompt injection in files.
- **Exit criteria:** retrieval evaluation set, tenant-isolation tests, and grounded-answer checks are in place.

### Phase 7 — AI workspace capabilities
- Improve chat UX and model selection.
- Generate flashcards, quizzes, notes, summaries, and document analyses.
- Add self-hosted image generation only after the image runtime and storage lifecycle are ready.
- Add audio transcription/speech only with an identified self-hosted component and disclosed processing path.
- Add web search with explicit external-data disclosure and code/tool execution in an isolated sandbox (never run arbitrary user code in the API process).
- **Exit criteria:** each capability has limits, safe failure behavior, and tests.

### Phase 8 — Production quality and launch
- Add rate limiting, per-user quotas, request IDs, safe structured logs, monitoring, backups, dependency/security scanning, and deployment rollback.
- Run frontend build, backend tests, integration tests, tenant-isolation tests, and deployment smoke tests.
- Verify OAuth redirect URLs, cookie settings, TLS, secret rotation, incident response, and restore drills.
- **Exit criteria:** no known critical/high issues remain unresolved; all required checks pass; deploy/rollback steps are repeatable.

### Phase 9 — Model ownership research
- Benchmark small open-weight models and verify license/redistribution terms for the chosen model.
- Compare a model-matched pretrained tokenizer against training a separate tokenizer for a separate model; never swap a tokenizer into pretrained weights without compatibility testing.
- Fine-tune using a small, lawful, curated dataset only after the serving, evaluation, and data-governance work is stable.
- **Exit criteria:** reproducible evaluation shows a measurable improvement; model and dataset licenses are recorded.

## Current confirmed baseline

See [PHASE_0_BASELINE.md](./PHASE_0_BASELINE.md). Phases 2–9 are not complete merely because they are described here. Cloud resource creation/deployment requires the target project, region, billing decisions, and credentials to be available and verified.
