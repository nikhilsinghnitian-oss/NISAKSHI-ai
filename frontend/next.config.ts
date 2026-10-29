import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const configuredBackendUrl = process.env.BACKEND_URL?.trim();
    const backendUrl =
      configuredBackendUrl ||
      (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:8000");

    // Never point a production rewrite at the Vercel function's own localhost.
    if (!backendUrl) return [];

    return [
      {
        source: "/backend/:path*",
        destination: `${backendUrl.replace(/\/+$/, "")}/:path*`,
      },
    ];
  },
};

export default nextConfig;
