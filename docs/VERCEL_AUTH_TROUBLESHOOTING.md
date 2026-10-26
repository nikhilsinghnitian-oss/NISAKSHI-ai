# Troubleshooting: Auth.js "Server error" on Vercel

## Confirmed cause for the October 26, 2026 preview

The Vercel runtime logs for the preview reported:

- `MissingSecret: Please define a secret`
- `AUTH_SECRET` (or `NEXTAUTH_SECRET`) missing
- `AUTH_GOOGLE_ID` (or `GOOGLE_CLIENT_ID`) missing
- `AUTH_GOOGLE_SECRET` (or `GOOGLE_CLIENT_SECRET`) missing

The preview project also returned an empty environment-variable list. This is a deployment configuration issue, not a React/page-layout issue. The app must not bypass Auth.js or accept empty credentials to hide it.

## Configure the correct Vercel project and environment

In Vercel, open the project that owns the **exact deployment URL** shown in the browser, then open **Settings → Environment Variables**. Preview variables on a different project, or variables scoped to Production only, are not inherited by a Preview deployment.

Add these variables to **Preview** for the intended branch (and separately configure Production where appropriate):

| Variable | Requirement |
| --- | --- |
| `AUTH_SECRET` | A newly generated cryptographically random secret, 32+ characters. Do not share the production value with previews. |
| `AUTH_GOOGLE_ID` | Google OAuth client ID for a development/preview OAuth client. |
| `AUTH_GOOGLE_SECRET` | Secret paired with that OAuth client ID. |
| `DATABASE_URL` | A dedicated preview/staging PostgreSQL database, not the production database. |
| `BACKEND_URL` | Optional for loading the sign-in screen; required for chat/file API calls. It must point to a preview backend when used. |
| `AUTH_TRUST_HOST` | Set to `true` if you choose to configure the variable explicitly; this repository also sets `trustHost: true`. |

Generate an Auth.js secret locally with `npx auth secret` in `frontend/`, or use `openssl rand -base64 33`. Do not place the secret in GitHub, paste it in a chat, or prefix it with `NEXT_PUBLIC_`.

The backend validates short-lived HMAC service tokens with `AUTH_SECRET`. If Preview calls a Preview backend, configure the **same preview-only secret** in both services. Do not re-use the production signing key just to make a preview work.

## Google OAuth callback

For the exact preview hostname being used, add this authorized redirect URI to the matching Google OAuth Web application:

`https://YOUR-PREVIEW-HOST/api/auth/callback/google`

Use the real hostname—without placeholders—and keep it in sync with the URL used to start sign-in. Prefer a dedicated development/preview OAuth client so preview testing is isolated from production sign-ins. If the preview hostname changes on redeploy, update the Google OAuth allowlist or use an intentional stable preview domain.

## After changing variables

Vercel environment changes apply to new deployments. Redeploy the intended branch after the variables are configured. Check the new deployment's runtime logs for the absence of `MissingSecret` and the missing Google credential diagnostics, then test:

1. `GET /api/auth/signin` returns the Auth.js sign-in page rather than the generic server error.
2. The Google redirect/callback completes successfully.
3. `GET /api/auth/session` responds without a 500.
4. Chat and file APIs use the expected preview database/backend.

A successful frontend build alone does not test authentication: these variables are read at runtime. Do not copy production database credentials into Preview and do not consider authentication fixed until the callback is tested.
