import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Safe operational smoke test: never exposes environment values or backend response bodies.
export async function GET() {
  const configuredBackendUrl = process.env.BACKEND_URL?.trim();

  if (!configuredBackendUrl) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        code: "BACKEND_URL_MISSING",
        message: "Set BACKEND_URL in Vercel to the deployed FastAPI service root, then redeploy.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  let backendUrl: URL;
  try {
    backendUrl = new URL(configuredBackendUrl);
    if (
      process.env.NODE_ENV === "production" &&
      backendUrl.protocol !== "https:"
    ) {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          code: "BACKEND_URL_MUST_USE_HTTPS",
          message: "Production BACKEND_URL must use HTTPS.",
        },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
  } catch {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        code: "BACKEND_URL_INVALID",
        message: "BACKEND_URL must be a valid absolute URL.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const baseUrl = configuredBackendUrl.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/health`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          code: "BACKEND_HEALTH_CHECK_FAILED",
          status: response.status,
          backendHost: backendUrl.host,
        },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { ok: true, configured: true, status: response.status, backendHost: backendUrl.host },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        code: "BACKEND_UNREACHABLE",
        message: error instanceof Error && error.name === "TimeoutError"
          ? "The backend health check timed out."
          : "The backend could not be reached from Vercel.",
        backendHost: backendUrl.host,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
