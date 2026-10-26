import { NextResponse } from "next/server";

export type ParsedJsonObject =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: NextResponse };

/**
 * Read a bounded JSON object without trusting Content-Length alone.
 * Call after authentication and before any database writes or inference calls.
 */
export async function readJsonObject(
  request: Request,
  maxBytes: number
): Promise<ParsedJsonObject> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Content-Type must be application/json" },
        { status: 415 }
      ),
    };
  }

  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader !== null) {
    const declaredLength = Number(lengthHeader);
    if (!Number.isFinite(declaredLength) || declaredLength < 0) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Invalid Content-Length" }, { status: 400 }),
      };
    }
    if (declaredLength > maxBytes) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Request body too large" }, { status: 413 }),
      };
    }
  }

  if (!request.body) {
    return {
      ok: false,
      response: NextResponse.json({ error: "JSON body required" }, { status: 400 }),
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;

      if (total > maxBytes) {
        await reader.cancel();
        return {
          ok: false,
          response: NextResponse.json({ error: "Request body too large" }, { status: 413 }),
        };
      }
      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unable to read request body" }, { status: 400 }),
    };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        response: NextResponse.json({ error: "JSON body must be an object" }, { status: 400 }),
      };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }
}

export function isOptionalBoundedString(
  value: unknown,
  maxLength: number
): value is string | null | undefined {
  return value === undefined || value === null ||
    (typeof value === "string" && value.length <= maxLength);
}
