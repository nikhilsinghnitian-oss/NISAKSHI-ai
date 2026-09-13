import crypto from "crypto";

const SECRET = process.env.AUTH_SECRET || "";
const TOKEN_TTL_SECONDS = 60; // 60 second short-lived tokens

export async function createToken(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    userId,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  });

  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(Buffer.from(payload))
    .digest("base64url");

  return `${payloadB64}.${sig}`;
}

export async function verifyToken(
  token: string
): Promise<{ userId: string } | null> {
  try {
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return null;

    const payloadBuf = Buffer.from(payloadB64, "base64url");
    const expectedSig = crypto
      .createHmac("sha256", SECRET)
      .update(payloadBuf)
      .digest("base64url");

    if (sig !== expectedSig) return null;

    const payload = JSON.parse(payloadBuf.toString("utf-8"));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;

    return { userId: payload.userId };
  } catch {
    return null;
  }
}
