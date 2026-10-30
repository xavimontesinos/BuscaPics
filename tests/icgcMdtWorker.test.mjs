import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALLOWED_ORIGIN,
  UPSTREAM_TIFF_URL,
  WORKER_PATH,
  handleIgcMdtRequest,
} from '../workers/icgc-mdt-proxy/index.mjs';

const originHeaders = { Origin: ALLOWED_ORIGIN };
const request = (path = WORKER_PATH, init = {}) => new Request(`https://worker.example${path}`, init);

test('preflight allows only GET with Range from the published Pages origin', async () => {
  let fetchCalls = 0;
  const response = await handleIgcMdtRequest(request(WORKER_PATH, {
    method: 'OPTIONS',
    headers: { ...originHeaders, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'range' },
  }), async () => { fetchCalls += 1; });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ALLOWED_ORIGIN);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
  assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Range');
  assert.equal(fetchCalls, 0);
});

test('rejects other origins, paths, query strings, methods, and invalid ranges without upstream access', async () => {
  let fetchCalls = 0;
  const fakeFetch = async () => { fetchCalls += 1; throw new Error('must not fetch'); };
  const cases = [
    [request(WORKER_PATH, { headers: { Origin: 'https://evil.example', Range: 'bytes=0-9' } }), 403],
    [request('/other.tif', { headers: { ...originHeaders, Range: 'bytes=0-9' } }), 404],
    [request(`${WORKER_PATH}?url=https://example.test`, { headers: { ...originHeaders, Range: 'bytes=0-9' } }), 404],
    [request(WORKER_PATH, { method: 'POST', headers: originHeaders }), 405],
    [request(WORKER_PATH, { headers: originHeaders }), 400],
    [request(WORKER_PATH, { headers: { ...originHeaders, Range: 'bytes=0-' } }), 400],
    [request(WORKER_PATH, { headers: { ...originHeaders, Range: 'bytes=0-9,20-29' } }), 400],
    [request(WORKER_PATH, { headers: { ...originHeaders, Range: 'bytes=0-16777216' } }), 413],
  ];

  for (const [req, status] of cases) assert.equal((await handleIgcMdtRequest(req, fakeFetch)).status, status);
  assert.equal(fetchCalls, 0);
});

test('forwards a bounded Range to the fixed ICGC URL and streams the 206 headers and body', async () => {
  let upstreamUrl;
  let upstreamRange;
  const payload = new Uint8Array([1, 2, 3, 4]);
  const response = await handleIgcMdtRequest(request(WORKER_PATH, {
    headers: { ...originHeaders, Range: 'bytes=100-103' },
  }), async (url, init) => {
    upstreamUrl = url;
    upstreamRange = new Headers(init.headers).get('Range');
    return new Response(payload, { status: 206, headers: {
      'Accept-Ranges': 'bytes', 'Content-Range': 'bytes 100-103/4369565862',
      'Content-Length': '4', 'Content-Type': 'image/tiff',
    } });
  });

  assert.equal(upstreamUrl, UPSTREAM_TIFF_URL);
  assert.equal(upstreamRange, 'bytes=100-103');
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), 'bytes 100-103/4369565862');
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(response.headers.get('Content-Length'), '4');
  assert.equal(response.headers.get('Content-Type'), 'image/tiff');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ALLOWED_ORIGIN);
  assert.equal(response.headers.get('Access-Control-Expose-Headers'), 'Accept-Ranges, Content-Range, Content-Length, Content-Type, ETag, Last-Modified');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [...payload]);
});

test('upstream failures and ignored Range responses become CORS-readable 502 errors', async () => {
  const req = request(WORKER_PATH, { headers: { ...originHeaders, Range: 'bytes=0-3' } });
  const rejected = await handleIgcMdtRequest(req, async () => { throw new Error('offline'); });
  assert.equal(rejected.status, 502);
  assert.equal(rejected.headers.get('Access-Control-Allow-Origin'), ALLOWED_ORIGIN);

  let cancelled = false;
  const ignoredRange = await handleIgcMdtRequest(req, async () => new Response(new ReadableStream({
    cancel() { cancelled = true; },
  }), { status: 200 }));
  assert.equal(ignoredRange.status, 502);
  assert.equal(ignoredRange.headers.get('Access-Control-Allow-Origin'), ALLOWED_ORIGIN);
  assert.equal(cancelled, true);
});

test('passes through a valid upstream 416 range response', async () => {
  const response = await handleIgcMdtRequest(request(WORKER_PATH, {
    headers: { ...originHeaders, Range: 'bytes=9999999999-10000000000' },
  }), async () => new Response(null, { status: 416, headers: {
    'Content-Range': 'bytes */4369565862', 'Accept-Ranges': 'bytes',
  } }));
  assert.equal(response.status, 416);
  assert.equal(response.headers.get('Content-Range'), 'bytes */4369565862');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ALLOWED_ORIGIN);
});
