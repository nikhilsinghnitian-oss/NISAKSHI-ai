# NISAKSHI AI — Deployment Guide

## Architecture

```
Frontend (Next.js)         Backend (FastAPI)
    ↓                          ↓
Vercel                    Cloud Run / Railway / Render
    ↓                          ↓
PostgreSQL (Neon)         Google Gemini API
```

---

## 1. Required Environment Variables

### Frontend (Vercel)

| Variable | Description |
|---|---|
| `AUTH_GOOGLE_ID` | Google OAuth Client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth Client Secret |
| `AUTH_SECRET` | NextAuth HMAC secret (shared with backend) |
| `AUTH_TRUST_HOST` | Set to `true` |
| `DATABASE_URL` | PostgreSQL connection string |
| `BACKEND_URL` | Deployed backend URL (e.g. `https://nisakshi-api.up.railway.app`) |

### Backend (Cloud Run / Railway / Render)

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key |
| `AUTH_SECRET` | Same HMAC secret as frontend |
| `PORT` | Set automatically by most cloud providers |
| `FRONTEND_ORIGINS` | Comma-separated exact browser origins; no wildcard origins |

---

## 2. Local Development Setup

### Prerequisites
- Node.js 20+
- Python 3.11+
- Git

### Backend
```bash
cd backend
python -m venv venv
# Windows: .\venv\Scripts\activate
# Linux/Mac: source venv/bin/activate
pip install -r requirements.txt

# Create backend/.env
# GEMINI_API_KEY=your_key
# AUTH_SECRET=<random secret with at least 32 bytes>
# FRONTEND_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

python main.py
# Backend runs on http://localhost:8000
```

### Frontend
```bash
cd frontend
npm install

# Create frontend/.env.local with:
# AUTH_GOOGLE_ID=your_google_client_id
# AUTH_GOOGLE_SECRET=your_google_client_secret
# AUTH_SECRET=same_shared_secret_as_backend
# AUTH_TRUST_HOST=true
# DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
# BACKEND_URL=http://localhost:8000

npx prisma db push   # Creates tables in your PostgreSQL database
npm run dev           # Frontend runs on http://localhost:3000
```

---

## 3. Database Setup

### Production: Neon (free PostgreSQL)
1. Go to https://neon.tech
2. Create a free account and project
3. Copy the connection string (starts with `postgresql://`)
4. Set as `DATABASE_URL` in Vercel and in local `.env.local`

### Push Schema to Database
Run once after setting `DATABASE_URL`:
```bash
cd frontend
npx prisma db push
```

This creates the User, Conversation, and Message tables.

---

## 4. Prisma Commands

```bash
cd frontend
npx prisma generate    # Generate Prisma client (runs automatically during build)
npx prisma db push     # Push schema to database (run once per new database)
npx prisma studio      # Visual database browser (local only)
```

---

## 5. Vercel Deployment

### Settings
- **Root Directory**: `frontend`
- **Build Command**: `prisma generate && next build` (already in package.json)
- **Install Command**: `npm install` (runs `postinstall` which runs `prisma generate`)

### Environment Variables
Set all 6 frontend variables listed in Section 1 in Vercel dashboard → Settings → Environment Variables.

### Deploy
```bash
# From project root
git add -A
git commit -m "deploy: production-ready"
git push origin main
```

Vercel auto-deploys from the main branch.

---

## 6. Backend Deployment

### Option A: Railway
1. Connect your GitHub repo
2. Set root directory to `backend`
3. Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables: `GEMINI_API_KEY`, `AUTH_SECRET`
5. Railway provides a public URL → set as `BACKEND_URL` in Vercel

### Option B: Google Cloud Run

Do not put real secrets directly in shell command arguments or commit them to source control. Store `AUTH_SECRET` and the current provider key in Secret Manager; the shared `AUTH_SECRET` must contain at least 32 random bytes. Set `FRONTEND_ORIGINS` to the exact deployed frontend origin(s).

The current backend enforces HMAC authentication on inference routes, while `/` and `/health` remain public liveness endpoints. Before production, Phase 3 must decide and verify private service invocation rather than relying only on application-level tokens.

Deploy the source only after configuring the service variables and secrets in Cloud Run or Secret Manager-backed deployment settings:

```bash
cd backend
gcloud run deploy nisakshi-api --source . --region YOUR_REGION
```

### Option C: Render
1. Connect repo, set root to `backend`
2. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Add env vars

---

## 7. Google OAuth Configuration

### Google Cloud Console
1. Go to https://console.cloud.google.com/apis/credentials
2. Edit your OAuth 2.0 Client
3. Add **Authorized redirect URIs**:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://your-app.vercel.app/api/auth/callback/google`

---

## 8. Gemini Configuration

- Get API key from https://aistudio.google.com/
- Set `GEMINI_API_KEY` in backend environment
- Text model: `gemini-3.5-flash` (with 5 fallback models)
- Image models: `gemini-3.1-flash-image`, `gemini-3-pro-image`, `gemini-2.5-flash-image`
- Free tier: ~20 text requests/day/model, 0 image requests/day (requires paid plan)

---

## 9. Frontend ↔ Backend URL

- Frontend API routes (`/api/chat`, `/api/image`) proxy requests to the backend
- `BACKEND_URL` is server-side only (never exposed to browser)
- Locally defaults to `http://127.0.0.1:8000` if not set
- In production, set `BACKEND_URL` in Vercel to your deployed backend URL

---

## 10. Security and deployment notes

- The backend CORS allowlist is configured through `FRONTEND_ORIGINS`; production values must use exact HTTPS origins.
- Frontend and backend `AUTH_SECRET` values must match and be at least 32 bytes. Rotate both together if exposed.
- Inference request bodies and chat/image prompt lengths are bounded in the current code.
- The CI workflow runs backend security tests and frontend lint/build checks. A green result is required before merging.
- Current inference is still Gemini-backed. Phase 2 in `docs/PHASED_IMPLEMENTATION_PLAN.md` replaces it with self-hosted inference.

## 11. Verification Checklist

```
[ ] npm install succeeds
[ ] npx prisma generate succeeds
[ ] npm run build succeeds
[ ] Backend starts (python main.py)
[ ] GET /health returns 200
[ ] Text chat works
[ ] Image generation works (requires paid Gemini plan)
[ ] Google login works
[ ] Chat history persists across page refresh
[ ] No OpenRouter/OmniRoute references
[ ] No Gemini branding in UI
[ ] No secrets in git
```

---

## 12. Known Limitations

1. **Image generation on free tier**: Google Gemini free tier has 0 quota for image models. Image generation requires a paid API plan.
2. **Middleware deprecation**: Next.js 16.3.x shows a warning about `middleware.ts` being deprecated in favor of `proxy`. This is non-blocking.
