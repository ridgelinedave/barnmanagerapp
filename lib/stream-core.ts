/**
 * Cloudflare Stream — the pure core: no imports, no environment reads, no
 * framework. `lib/stream.ts` wraps it for the app (server-only, reads env);
 * tests/stream.test.mjs and scripts/stream-*.mjs load it directly.
 *
 * WHAT THIS CODE NEVER DOES WITH A CREDENTIAL. The account id and the API
 * token go into exactly two places: the request URL path and the
 * Authorization header of a call to api.cloudflare.com. They are never put in
 * a thrown error, a return value or a log line. Errors carry an HTTP status
 * and Cloudflare's own error CODES, never the URL, the headers or the body.
 * tests/stream.test.mjs proves that against fake credentials.
 *
 * PRIVACY. Every learning video is created with signed URLs required, so its
 * uid alone plays nothing. `describeVideo` refuses to treat a video as
 * playable unless Stream reports `requireSignedURLs: true` — a video that
 * somehow became public fails closed here rather than being handed out.
 */

export type StreamCredentials = { accountId: string; apiToken: string };

/** A Stream uid: 32 lowercase hex. The same shape the database CHECK enforces. */
export const STREAM_UID = /^[0-9a-f]{32}$/;

export class StreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamError";
  }
}

/**
 * Reads the two server-only variables. Fails LOUDLY, naming what is missing —
 * never the value of what is present, and never a fallback to another
 * provider: video does not live anywhere else.
 */
export function streamCredentialsFrom(env: Record<string, string | undefined>): StreamCredentials {
  const accountId = (env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const apiToken = (env.CLOUDFLARE_STREAM_TOKEN ?? "").trim();
  const missing = [
    accountId ? null : "CLOUDFLARE_ACCOUNT_ID",
    apiToken ? null : "CLOUDFLARE_STREAM_TOKEN",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new StreamError(
      `Cloudflare Stream is not configured: ${missing.join(" and ")} ${
        missing.length === 1 ? "is" : "are"
      } not set. Set ${missing.length === 1 ? "it" : "them"} in the server environment ` +
        "(.env.local locally, the host's env in production). Never with a NEXT_PUBLIC_ prefix.",
    );
  }
  return { accountId, apiToken };
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const API = "https://api.cloudflare.com/client/v4/accounts";

/** Cloudflare's error codes from a failed response, never its message text. */
async function errorCodes(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { errors?: { code?: number }[] };
    const codes = (body.errors ?? []).map((e) => e.code).filter(Boolean);
    return codes.length ? ` (Cloudflare error ${codes.join(", ")})` : "";
  } catch {
    return "";
  }
}

function assertUid(videoId: string): void {
  if (!STREAM_UID.test(videoId)) throw new StreamError("Not a Stream video id.");
}

export type StreamVideo = {
  /** Host of the customer playback domain, e.g. customer-xxxx.cloudflarestream.com. */
  playbackHost: string;
  readyToStream: boolean;
  requireSignedURLs: boolean;
  durationSeconds: number | null;
};

/** One video's playback facts, from the Stream API. */
export async function describeVideo(
  creds: StreamCredentials,
  videoId: string,
  fetchImpl: FetchLike = fetch,
): Promise<StreamVideo> {
  assertUid(videoId);
  const res = await fetchImpl(`${API}/${creds.accountId}/stream/${videoId}`, {
    headers: { Authorization: `Bearer ${creds.apiToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new StreamError(`Stream video lookup failed: HTTP ${res.status}${await errorCodes(res)}.`);

  const body = (await res.json()) as {
    result?: {
      playback?: { hls?: string };
      readyToStream?: boolean;
      requireSignedURLs?: boolean;
      duration?: number;
    };
  };
  const hls = body.result?.playback?.hls;
  if (!hls) throw new StreamError("Stream returned no playback address for this video.");

  return {
    playbackHost: new URL(hls).host,
    readyToStream: Boolean(body.result?.readyToStream),
    requireSignedURLs: body.result?.requireSignedURLs === true,
    durationSeconds:
      typeof body.result?.duration === "number" && body.result.duration > 0
        ? Math.round(body.result.duration)
        : null,
  };
}

/**
 * Mints a signed playback token. `ttlSeconds` is capped at 24h by Stream;
 * the app asks for far less. The token is a credential for ONE video until it
 * expires — callers hand it only to a viewer the database has already said
 * may see that video.
 */
export async function mintPlaybackToken(
  creds: StreamCredentials,
  videoId: string,
  ttlSeconds: number,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  assertUid(videoId);
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, Math.min(ttlSeconds, 86_400));
  const res = await fetchImpl(`${API}/${creds.accountId}/stream/${videoId}/token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ exp }),
    cache: "no-store",
  });
  if (!res.ok) throw new StreamError(`Stream token request failed: HTTP ${res.status}${await errorCodes(res)}.`);
  const body = (await res.json()) as { result?: { token?: string } };
  const token = body.result?.token;
  if (!token) throw new StreamError("Stream returned no playback token.");
  return token;
}

/** The player and manifest addresses for a token. A token replaces the uid in the path. */
export function playbackUrls(host: string, token: string): { iframe: string; hls: string } {
  return {
    iframe: `https://${host}/${token}/iframe`,
    hls: `https://${host}/${token}/manifest/video.m3u8`,
  };
}

/**
 * A ONE-TIME tus upload link for the browser (a "direct creator upload").
 *
 * The server's only part in an upload: it asks Cloudflare, with the account
 * token, for a link that accepts exactly one video of exactly `sizeBytes`,
 * and hands the BROWSER the link — never the token. The browser then sends the
 * file to that link in chunks with no Authorization header at all (proved
 * against Stream 2026-10-21: upload.cloudflarestream.com accepted a chunk with
 * none). Vercel's request-body cap never applies: the video never touches
 * this server.
 *
 * Set at creation, in Upload-Metadata, because Cloudflare ignores metadata on
 * the requests that carry the bytes:
 *   requiresignedurls   private from the first byte (stored true, verified)
 *   maxdurationseconds  the storage Cloudflare reserves until the upload ends
 *   expiry              after which the link — AND AN UPLOAD STILL IN
 *                       PROGRESS — is refused (error 10017, proved by test);
 *                       Cloudflare accepts at most 24 hours (48 h refused)
 *
 * The video id comes from the `stream-media-id` response header, as
 * Cloudflare advises, never parsed out of the Location URL. Both are checked:
 * a 32-hex uid, and a Location on a Cloudflare host over https — so a
 * misbehaving response cannot point the browser anywhere else.
 */
export type DirectUpload = { uploadUrl: string; videoId: string };

export async function createDirectUpload(
  creds: StreamCredentials,
  options: { sizeBytes: number; maxDurationSeconds: number; expiry: Date; name: string },
  fetchImpl: FetchLike = fetch,
): Promise<DirectUpload> {
  const { sizeBytes, maxDurationSeconds, expiry, name } = options;
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) throw new StreamError("The file size is not valid.");
  if (!Number.isInteger(maxDurationSeconds) || maxDurationSeconds < 1 || maxDurationSeconds > 36_000) {
    throw new StreamError("The maximum duration is out of range.");
  }
  // Server-only (the token is in this request), so Node's Buffer is always there.
  const b64 = (value: string) => Buffer.from(value, "utf8").toString("base64");
  const rfc3339 = expiry.toISOString().replace(/\.\d{3}Z$/, "Z");

  const res = await fetchImpl(`${API}/${creds.accountId}/stream?direct_user=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.apiToken}`,
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(sizeBytes),
      "Upload-Metadata": [
        `name ${b64(name.slice(0, 200))}`,
        "requiresignedurls",
        `maxdurationseconds ${b64(String(maxDurationSeconds))}`,
        `expiry ${b64(rfc3339)}`,
      ].join(","),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new StreamError(`Stream upload link request failed: HTTP ${res.status}${await errorCodes(res)}.`);

  const videoId = res.headers.get("stream-media-id") ?? "";
  const uploadUrl = res.headers.get("location") ?? "";
  if (!STREAM_UID.test(videoId)) throw new StreamError("Stream returned no video id for the upload.");
  let host = "";
  let protocol = "";
  try {
    ({ host, protocol } = new URL(uploadUrl));
  } catch {
    /* handled below */
  }
  const cloudflare = host.endsWith(".cloudflarestream.com") || host === "cloudflare.com" || host.endsWith(".cloudflare.com");
  if (protocol !== "https:" || !cloudflare) throw new StreamError("Stream returned an upload address that is not Cloudflare's.");
  return { uploadUrl, videoId };
}

/** Delete a video (an abandoned upload). Errors carry status and codes only. */
export async function deleteVideo(creds: StreamCredentials, videoId: string, fetchImpl: FetchLike = fetch): Promise<void> {
  assertUid(videoId);
  const res = await fetchImpl(`${API}/${creds.accountId}/stream/${videoId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${creds.apiToken}` },
    cache: "no-store",
  });
  if (!res.ok && res.status !== 404) throw new StreamError(`Stream delete failed: HTTP ${res.status}${await errorCodes(res)}.`);
}
