# NISAKSHI AI — Deployment Guide

## Architecture

```text
Browser
  ↓
Next.js frontend (Vercel or another web host)
  ├── Auth.js session + PostgreSQL (Neon now; managed private PostgreSQL in cloud phase)
  └── authenticated server-side proxy
          ↓ private service/network boundary
      FastAPI backend (cloud compute)
          ├── self-hosted OpenAI-compatible text model server
          ├── optional self-hosted image model server
          └── private object storage (added in cloud/file phases)
```

**Object storage holds files; it does not run the model server.** The AI model runtime requires compute, and inference requests should stay within NISAKSHI-controlled services. The source code currently provides a configurable API interface for a self-hosted OpenAI-compatible model server; cloud resources and model weights are not automatically provisioned by this repository.

---

## 1. Required environment variables

### Frontend

| Variable | Description |
|---|---|
| `AUTH_GOOGLE_ID` | Google OAuth Client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth Client Secret |
| `AUTH_SECRET` | Auth.js secret and shared backend-token key; at least 32 random bytes |
| `AUTH_TRUST_HOST` | Set to `true` on supported hosted deployments |
| `DATABASE_URL` | PostgreSQL connection string |
| `BACKEND_URL` | FastAPI service URL; prefer a private/internal address where your hosting allows it |

### Backend

| Variable | Description |
|---|---|
| `AUTH_SECRET` | Same high-entropy value as the frontend |
| `FRONTEND_ORIGINS` | Comma-separated exact browser origins; no wildcard origins |
| `MODEL_SERVER_BASE_URL` | Self-hosted OpenAI-compatible inference API base URL, normally ending in `/v1` |
| `NISAKSHI_MODEL_ID` | Default model ID configured on the private model server |
| `NISAKSHI_ALLOWED_MODELS` | Optional comma-separated additional model IDs users may select |
| `MODEL_SERVER_API_KEY` | Optional credential for a private model service; never expose it to the browser |
| `IMAGE_SERVER_BASE_URL` | Optional self-hosted image API base URL |
| `IMAGE_MODEL_ID` | Optional server-configured image model ID |
| `IMAGE_ALLOWED_MODELS` | Optional image-model allowlist |
| `IMAGE_SERVER_API_KEY` | Optional credential for the private image service |
| `PORT` | HTTP port supplied by the hosting platform |

See `backend/.env.example` for local placeholders. No real secrets belong in source control.

---

## 2. Local development

### Prerequisites

- Node.js 20+ (CI uses Node.js 22)
- Python 3.11+
- A PostgreSQL database for persisted conversations
- A reachable self-hosted model server that implements OpenAI-compatible Chat Completions streaming

### Backend

```bash
cd backend
python -m venv venv
# Windows: .\\venv\\Scripts\\activate
# Linux/macOS: source venv/bin/activate
pip install -r requirements.txt

# Copy .env.example to .env and set AUTH_SECRET, MODEL_SERVER_BASE_URL,
# and NISAKSHI_MODEL_ID. Do not set any hosted AI inference provider key.
python main.py
```

The FastAPI backend listens on `http://localhost:8000` by default. `GET /health` checks process liveness; `GET /ready` checks whether the configured text model server can be reached. A 503 from `/ready` means the endpoint or model is not configured/reachable.

### Frontend

```bash
cd frontend
npm ci

# Create frontend/.env.local and set:
# AUTH_GOOGLE_ID=your_google_client_id
# AUTH_GOOGLE_SECRET=your_google_client_secret
# AUTH_SECRET=the_same_random_secret_as_the_backend
# AUTH_TRUST_HOST=true
# DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
# BACKEND_URL=http://localhost:8000

npx prisma generate
npx prisma db push
npm run dev
```

---

## 3. Database setup

The current Prisma schema uses PostgreSQL. For development, use an isolated database. For production, select a managed database only after checking region, backups, connectivity, pricing, and deletion/retention requirements.

```bash
cd frontend
npx prisma generate
npx prisma db push
npx prisma studio
```

Use reviewed schema migrations as the project matures; avoid applying schema changes blindly to a production database.

---

## 4. Web frontend deployment

For Vercel or another Next.js host:

- Root directory: `frontend`
- Build command: `npm run build`
- Required variables: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `DATABASE_URL`, `BACKEND_URL`

Configure the Google OAuth callback URLs for the exact local and production origin. Keep `AUTH_SECRET` out of client-prefixed variables. Set production cookies and HTTPS through the hosting provider.

The frontend deployment is independent from model serving: deploying the web UI does not deploy the AI weights or inference runtime.

---

## 5. Backend deployment notes

The backend can be packaged for a cloud compute platform, but its model endpoint must be separately deployed and reachable through a private/internal network route where supported.

- Set `MODEL_SERVER_BASE_URL` to the internal address of your own model runtime.
- Set `NISAKSHI_MODEL_ID` to a model ID served by that runtime.
- Put `AUTH_SECRET` and any private service credentials in the platform's secret manager.
- Use the exact HTTPS frontend origin(s) in `FRONTEND_ORIGINS`.
- Do not rely on CORS as authentication. The inference endpoints also verify the signed short-lived service token.
- Keep model-serving endpoints out of the public internet when the selected platform supports private service connectivity.
- Do not pass secrets in shell history or command-line environment flags.
- A public health endpoint can report liveness; it must not return credentials, model-server URL, user data, or upstream exception details.

Cloud compute, artifact registry, managed PostgreSQL, object-storage bucket, private networking, secret manager, quotas, and backups are not created automatically. These are Phase 3 deployment tasks and require an actual project, region, and cost decision.

---

## 6. Self-hosted inference protocol

The text backend calls `POST {MODEL_SERVER_BASE_URL}/chat/completions` with an OpenAI-compatible JSON body and reads Server-Sent Events. The model endpoint and optional bearer key are server configuration only; a chat request cannot choose its own URL. A user-supplied model ID must belong to the server-configured model allowlist.

The optional image service is expected to implement `POST {IMAGE_SERVER_BASE_URL}/images/generations` and return base64 data at `data[0].b64_json`. NISAKSHI does not fetch a remote image URL returned by the service. Image generation returns a controlled “not configured” response until the private image service is set up.

The configured service should run a compatible open-weight model whose license permits your intended use. Model weights are not included in this repository; choose the model and check its license before downloading or deploying it.

---

## 7. Verification checklist

```text
[ ] npm ci succeeds
[ ] npm run lint succeeds
[ ] npm run build succeeds
[ ] python -m compileall -q backend succeeds
[ ] pytest passes
[ ] GET /health returns 200
[ ] GET /ready returns ready when private model server is healthy
[ ] Text streaming works with hosted AI provider keys unset
[ ] Missing model configuration fails safely
[ ] Invalid/expired service tokens are rejected
[ ] Oversized request bodies are rejected before parsing
[ ] Cross-user conversation isolation is tested
[ ] Production model service is private/internal
[ ] OAuth and database settings are verified in the target environment
[ ] No secrets committed in current files or Git history
[ ] Backup, restore, and data-deletion procedures are verified
```

CI runs backend tests and frontend lint/build checks. Passing CI alone does not prove the cloud model runtime, OAuth callbacks, database access, or user isolation have been tested against a live deployment.

---

## 8. Known limitations

- Cloud resources and model weights are not provisioned by the code branch.
- The local GPU has 4 GB VRAM; treat local model experiments as small quantized-model tests, not production capacity tests.
- Self-hosted image and audio capabilities require their own runtimes and are not automatically available because text inference works.
- Rate limiting/quotas at the shared gateway, attachment storage and ingestion, per-user vector retrieval, account-wide export/deletion, and production monitoring remain later phases.
