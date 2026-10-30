export const WORKER_PATH = "/mdt.tif";
export const ALLOWED_ORIGIN = "https://xavimontesinos.github.io";
export const UPSTREAM_TIFF_URL =
  "https://datacloud.icgc.cat/datacloud/model-elevacions-terreny/tif_unzip/model-elevacions-terreny-lidar-catalunya-5m-2021-2023.tif";

const MAX_RANGE_BYTES = 16 * 1024 * 1024;
const EXPOSED_HEADERS = "Accept-Ranges, Content-Range, Content-Length, Content-Type, ETag, Last-Modified";
const FORWARDED_HEADERS = [
  "Accept-Ranges",
  "Content-Range",
  "Content-Length",
  "Content-Type",
  "ETag",
  "Last-Modified",
];

export default {
  fetch(request) {
    return handleIgcMdtRequest(request);
  },
};

/** Fixed-resource, single-range proxy. The upstream address is never taken from the request. */
export async function handleIgcMdtRequest(request, fetchUpstream = fetch) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("Origin");

  if (requestUrl.pathname !== WORKER_PATH || requestUrl.search) {
    return errorResponse("Not found", 404, origin);
  }
  if (origin !== ALLOWED_ORIGIN) {
    return new Response("Origin not allowed", { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  if (request.method === "OPTIONS") return handlePreflight(request, origin);
  if (request.method !== "GET") {
    return errorResponse("Method not allowed", 405, origin, { Allow: "GET, OPTIONS" });
  }

  const range = parseSingleByteRange(request.headers.get("Range"));
  if (range === null) return errorResponse("A single explicit byte Range is required", 400, origin);
  if (range.end - range.start + 1 > MAX_RANGE_BYTES) {
    return errorResponse("Requested range exceeds the 16 MiB limit", 413, origin);
  }

  let upstream;
  try {
    upstream = await fetchUpstream(UPSTREAM_TIFF_URL, {
      method: "GET",
      headers: { Range: request.headers.get("Range") },
      redirect: "error",
      cf: { cacheTtl: 0, cacheEverything: false },
    });
  } catch {
    return errorResponse("ICGC MDT upstream request failed", 502, origin);
  }

  if (upstream.status === 416) {
    return forwardPartialResponse(upstream, origin);
  }
  if (upstream.status !== 206 || !isMatchingPartialResponse(upstream, range)) {
    await upstream.body?.cancel().catch(() => {});
    return errorResponse("ICGC MDT did not honor the requested byte Range", 502, origin);
  }

  return forwardPartialResponse(upstream, origin);
}

function handlePreflight(request, origin) {
  if (request.headers.get("Access-Control-Request-Method") !== "GET") {
    return errorResponse("Only GET is allowed by CORS", 405, origin, { Allow: "GET, OPTIONS" });
  }
  const requestedHeaders = (request.headers.get("Access-Control-Request-Headers") ?? "")
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  if (requestedHeaders.some((header) => header !== "range")) {
    return errorResponse("Only the Range request header is allowed", 400, origin);
  }
  const headers = corsHeaders(origin);
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Range");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Content-Length", "0");
  return new Response(null, { status: 204, headers });
}

function parseSingleByteRange(value) {
  const match = /^bytes=(\d+)-(\d+)$/i.exec(value?.trim() ?? "");
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) return null;
  return { start, end };
}

function isMatchingPartialResponse(response, requested) {
  const contentRange = /^bytes (\d+)-(\d+)\/(\d+|\*)$/i.exec(response.headers.get("Content-Range") ?? "");
  if (!contentRange) return false;
  const start = Number(contentRange[1]);
  const end = Number(contentRange[2]);
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) &&
    start === requested.start && end >= start && end <= requested.end;
}

function forwardPartialResponse(upstream, origin) {
  const headers = corsHeaders(origin);
  for (const name of FORWARDED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

function errorResponse(message, status, origin, extraHeaders = {}) {
  const headers = new Headers({ "Content-Type": "text/plain; charset=utf-8", ...extraHeaders });
  headers.set("Cache-Control", "no-store");
  if (origin === ALLOWED_ORIGIN) {
    const cors = corsHeaders(origin);
    cors.forEach((value, name) => headers.set(name, value));
  }
  return new Response(message, { status, headers });
}

function corsHeaders(origin) {
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": EXPOSED_HEADERS,
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });
}
