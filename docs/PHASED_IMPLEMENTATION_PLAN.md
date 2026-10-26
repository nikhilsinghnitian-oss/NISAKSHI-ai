# NISAKSHI AI — Phased Implementation Plan

**Status date:** 2026-10-26
**Working branch:** `codex/phase-4-secure-file-workspace`
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
**Status: source review and baseline documentation recorded; not a complete security audit**
- Confirm the target repository and default branch.
- Inspect frontend/backend, authentication, persistence, deployment instructions, and secret-handling conventions.
- Keep confirmed gaps separate from items requiring runtime testing.
- Work on a branch; leave `main` untouched.
- **Exit criteria:** audit note and ordered implementation plan committed; no claim of a successful build until CI/local execution confirms it.

### Phase 1 — Security and API hardening
**Status: code implemented; CI checks passed on earlier branch head**
- Restrict backend CORS to configured frontend origins.
- Make short-lived frontend-to-backend HMAC tokens fail closed, validate issuer/audience/time claims, and use timing-safe signature comparison.
- Bound chat/image payloads and validate request models.
- Add repeatable auth/input tests and CI.
- **Still required:** full route-by-route review, integration tests, rate limits at a shared gateway, and production auth verification.

### Phase 2 — Self-hosted model runtime
**Status: provider-neutral client implemented; automated checks passed, real model not exercised**
- Call a self-hosted OpenAI-compatible inference endpoint without hosted inference credentials.
- Keep model IDs and endpoint configuration server-side and allowlisted.
- **Still required:** live self-hosted model download, license review, and runtime/latency tests.

### Phase 3 — Cloud foundation
**Status: Terraform and container configuration validated in CI; no cloud resources created**
- Terraform describes a private GCS bucket, least-privilege backend service account, VPC/subnet/firewall, Artifact Registry, Secret Manager resources, and optional Cloud Run backend.
- **Still required:** GCP project/billing approval, a careful plan review, secret versions, database/model runtime provisioning, and live deployment verification.

### Phase 4 — Secure file workspace
**Status: file APIs and private file-library page implemented; CI passed on earlier revision; live bucket verification pending**
- Authenticated upload/list/download/delete endpoints.
- PostgreSQL `FileAsset` metadata and lifecycle status.
- Private GCS objects are scoped to the verified user ID and UUID; no public or signed bucket URL is returned to the browser.
- Validate supported extension, MIME declaration, signatures/container layout, UTF-8 text, file size, and safe display filename.
- **Still required:** re-run CI after the latest changes, a real private bucket integration test, production schema rollout, and cross-user API tests against the HTTP endpoints.

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

See [PHASE_0_BASELINE.md](./PHASE_0_BASELINE.md). The status written here distinguishes code/config checks from live tests. Cloud resource creation/deployment requires the target project, region, billing decisions, and credentials to be available and verified.
