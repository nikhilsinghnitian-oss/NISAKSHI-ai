# NISAKSHI AI — Deployment Guide

## Architecture

```text
Browser
  ↓
Next.js frontend (Vercel or another web host)
  ├── Auth.js session + PostgreSQL
  └── authenticated server-side proxy
          ↓ private service/network boundary
      FastAPI backend (cloud compute)
          ├── self-hosted OpenAI-compatible model server
          └── private Google Cloud Storage bucket
```

**Object storage holds files; it does not run the model server.** The model runtime requires compute, and inference requests should stay within NISAKSHI-controlled services. The repo provides configurable interfaces; cloud resources and model weights are not automatically provisioned.

## Environment variables

### Frontend

| Variable | Description |
|---|---|
| `AUTH_GOOGLE_ID` | Google OAuth Client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth Client Secret |
| `AUTH_SECRET` | Auth.js secret and shared backend-token key; at least 32 random bytes |
| `AUTH_TRUST_HOST` | Set to `true` on supported hosted deployments |
| `DATABASE_URL` | PostgreSQL connection string |
| `BACKEND_URL` | FastAPI service URL; prefer private/internal address where hosting allows |

### Backend

| Variable | Description |
|---|---|
| `AUTH_SECRET` | Same high-entropy value as the frontend |
| `FRONTEND_ORIGINS` | Exact browser origins, comma-separated |
| `MODEL_SERVER_BASE_URL` | Self-hosted OpenAI-compatible model endpoint |
| `NISAKSHI_MODEL_ID` | Default model ID |
| `NISAKSHI_ALLOWED_MODELS` | Optional server-approved model IDs |
| `GCS_BUCKET_NAME` | Private GCS bucket for file objects |
| `PORT` | HTTP port supplied by the hosting platform |

See `backend/.env.example` for local placeholders. No real secrets belong in source control.

## Local development

### Backend

```bash
cd backend
python -m venv venv
# Windows: .\\venv\\Scripts\\activate
# Linux/macOS: source venv/bin/activate
pip install -r requirements.txt
# Optional local file storage: authenticate with Google Application Default Credentials
# and set GCS_BUCKET_NAME to a private test bucket. Never test deletion against production.
python main.py
```

The backend listens on `http://localhost:8000` by default. `GET /health` checks liveness; `GET /ready` checks whether the text model server is reachable. File endpoints fail closed if `GCS_BUCKET_NAME` is not configured. On Cloud Run, the attached backend service account is used through Application Default Credentials.

### Frontend

```bash
cd frontend
npm ci
# Set frontend/.env.local with Auth.js, DATABASE_URL, and BACKEND_URL.
npx prisma generate
npx prisma db push
npm run dev
```

After adding `FileAsset` to the Prisma schema, apply the schema to an isolated development database with `npx prisma db push`. For an existing database created from the prior schema, `frontend/prisma/phase4_file_asset.sql` is the additive SQL for a one-time, reviewed rollout. Back up the database first, test the SQL in staging, and apply it only if neither `FileAssetStatus` nor `FileAsset` already exists (for example: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/phase4_file_asset.sql` from `frontend/`). This repository had no prior Prisma migration history, so do not blindly run `prisma migrate deploy`; baseline the existing schema as a separate, reviewed operation before adopting a migration history.

## File workspace (Phase 4)

The authenticated server-side endpoints are:

- `GET /api/files` — list up to 100 records owned by the current user.
- `POST /api/files` — upload a file, create a metadata record, and mark it `READY` only after the backend confirms the stored checksum.
- `GET /api/files/:fileId` — download through the authenticated application proxy.
- `DELETE /api/files/:fileId` — delete the private object before deleting its metadata row.

Supported formats currently include PDF, PNG/JPEG/WebP, DOCX, PPTX, XLSX, UTF-8 TXT/Markdown/CSV, MP3, WAV, and M4A. Legacy Office formats such as DOC/XLS/PPT are not accepted. The backend enforces a 20 MiB file limit, signature/content checks, bounded Office ZIP metadata, safe filenames, and owner-derived object keys. The Next.js proxy has a conservative 4 MiB file limit to stay below common serverless request-body limits; raising this requires a larger gateway or a designed, short-lived signed-upload flow. The backend does not publish public objects or return bucket URLs.

The user-facing page is available at `/files` and is linked from the chat sidebar. The frontend database needs the `FileAsset` schema change before the APIs can work. The bucket must exist, and the backend service account must have object permissions. Upload, download, and delete have not yet been verified against a live bucket; document parsing/RAG and malware scanning remain future work.

## Cloud deployment notes

- Terraform in `cloud/terraform` describes a private bucket with public-access prevention and uniform bucket-level access.
- It binds `GCS_BUCKET_NAME` to the bucket and grants the backend runtime identity access to objects.
- `deploy_backend` defaults to `false`; `allow_public_invocation` defaults to `false`. Do not flip public invocation on without reviewing authentication, rate limiting, and Vercel-to-private-service connectivity.
- Put `AUTH_SECRET` and private service credentials in Secret Manager. The configured secret must have a version before deploying a service that references it.
- No GCP project, bucket, model server, database, or live deployment has been created by these source changes.
- A passing CI build does not validate OAuth callbacks, database access, bucket IAM, model availability, backup/restore, or production user isolation.

## Security boundaries and remaining work

- Do not rely on CORS as authentication; inference and file endpoints verify the short-lived signed service token.
- Do not pass credentials in shell history or source control.
- Uploaded files are stored only; this phase does not parse or execute them. Document parsing, malware scanning, async ingestion jobs, per-user retrieval, retention/export, and shared-gateway rate limits remain future phases.
- Check model and dataset licenses before download or deployment. Model weights are not included in this repository.


## Phase 5 — account export and deletion

- `GET /api/account/export` downloads a JSON export containing the signed-in user's profile, conversations, messages, and private-file metadata. File bytes are deliberately excluded; download originals individually before account deletion.
- `DELETE /api/account` requires a signed-in session and an explicit same-origin request. It writes a pending account-deletion tombstone, calls the authenticated backend `DELETE /users/me/files` endpoint to remove every object under that user's private GCS prefix (including orphaned objects), then deletes the database user and cascading chat/file metadata in a database transaction.
- If private storage is not configured or cleanup cannot be confirmed, deletion fails closed: the account remains locked by a pending tombstone and the user can retry after backend storage is restored. Do not remove a pending tombstone manually until cleanup has been completed or the remaining objects have been accounted for.
- Apply `frontend/prisma/phase5_account_controls.sql` only once to an existing database after a backup and staging test, or run `npx prisma db push` against a development/staging database after reviewing the schema. Do not run the SQL if `AccountDeletionStatus` or `DeletedAccount` already exists.
- Tombstones contain a keyed HMAC digest of normalized email, not the email itself. Keep `AUTH_SECRET` stable for at least 30 days after deletion so the stale-session guard remains effective. This does not instantly purge backups; set and disclose database/object backup retention separately.
- Account deletion is not considered verified until the backend has `GCS_BUCKET_NAME` configured, HTTP cleanup succeeds, and database/storage behavior has been tested together. Never test destructive deletion against production data.
