import crypto from "crypto";

const TOKEN_TTL_SECONDS = 60;
const TOKEN_ISSUER = "nisakshi-web";
const TOKEN_AUDIENCE = "nisakshi-api";
const MAX_CLOCK_SKEW_SECONDS = 30;

function getSecret(): string {
  const secret = process.env.AUTH_SECRET || "";
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("AUTH_SECRET must contain at least 32 UTF-8 bytes");
  }
  return secret;
}

function sign(payload: Buffer): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
}

export async function createToken(userId: string): Promise<string> {
  if (typeof userId !== "string" || userId.trim().length === 0 || userId.length > 255) {
    throw new Error("A valid user ID is required to create a service token");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
      iss: TOKEN_ISSUER,
      aud: TOKEN_AUDIENCE,
    }),
    "utf8"
  );

  return `${payload.toString("base64url")}.${sign(payload)}`;
}

export async function verifyToken(
  token: string
): Promise<{ userId: string } | null> {
  try {
    if (typeof token !== "string" || token.length > 4096) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [payloadB64, signature] = parts;
    if (!payloadB64 || !signature || !/^[A-Za-z0-9_-]+$/.test(payloadB64)) {
      return null;
    }

    const payload = Buffer.from(payloadB64, "base64url");
    const expected = Buffer.from(sign(payload), "base64url");
    const received = Buffer.from(signature, "base64url");
    if (
      received.length !== expected.length ||
      !crypto.timingSafeEqual(received, expected)
    ) {
      return null;
    }

    const claims: unknown = JSON.parse(payload.toString("utf8"));
    if (!claims || typeof claims !== "object") return null;

    const value = claims as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof value.userId !== "string" ||
      value.userId.length === 0 ||
      value.userId.length > 255 ||
      !Number.isInteger(value.iat) ||
      !Number.isInteger(value.exp) ||
      typeof value.iat !== "number" ||
      typeof value.exp !== "number" ||
      value.iss !== TOKEN_ISSUER ||
      value.aud !== TOKEN_AUDIENCE ||
      value.iat > now + MAX_CLOCK_SKEW_SECONDS ||
      value.exp <= now ||
      value.exp <= value.iat ||
      value.exp - value.iat > TOKEN_TTL_SECONDS
    ) {
      return null;
    }

    return { userId: value.userId };
  } catch {
    return null;
  }
}
