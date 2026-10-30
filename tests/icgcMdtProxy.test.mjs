import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { test } from 'node:test';
import ts from 'typescript';
import { createServer as createViteServer } from 'vite';

function compile(source, replacements = {}) {
  let javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [specifier, replacement] of Object.entries(replacements)) {
    javascript = javascript.replaceAll(`from "${specifier}"`, `from ${JSON.stringify(replacement)}`);
  }
  return `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`;
}

const appConfigSource = await readFile(new URL('../src/domain/visibility/icgcMdtConfig.ts', import.meta.url), 'utf8');
const appConfigUrl = compile(appConfigSource);
const proxySource = await readFile(new URL('../scripts/icgcMdtProxy.ts', import.meta.url), 'utf8');
const proxyUrl = compile(proxySource, { '../src/domain/visibility/icgcMdtConfig': appConfigUrl });
const { ICGC_MDT_DEV_PROXY_PATH, ICGC_MDT_SOURCE_URL, getIgcMdtUrl } = await import(appConfigUrl);
const { createIgcMdtProxy } = await import(proxyUrl);

test('development MDT URL uses Vite proxy and production can use the configured Worker', () => {
  assert.equal(getIgcMdtUrl(true), ICGC_MDT_DEV_PROXY_PATH);
  assert.equal(getIgcMdtUrl(false), ICGC_MDT_SOURCE_URL);
  assert.equal(getIgcMdtUrl(false, 'https://buscapics.example.workers.dev/mdt.tif'), 'https://buscapics.example.workers.dev/mdt.tif');
  assert.equal(getIgcMdtUrl(true, 'https://buscapics.example.workers.dev/mdt.tif'), ICGC_MDT_DEV_PROXY_PATH);
});

test('Vite proxy forwards Range and preserves a partial TIFF response', async (t) => {
  let upstreamRequest;
  const body = Buffer.from([0x49, 0x49, 0x2a, 0x00]);
  const upstream = createHttpServer((request, response) => {
    upstreamRequest = { url: request.url, range: request.headers.range };
    response.writeHead(206, {
      'Accept-Ranges': 'bytes',
      'Content-Range': 'bytes 0-3/4369565862',
      'Content-Length': String(body.length),
      'Content-Type': 'image/tiff',
    });
    response.end(body);
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const upstreamAddress = upstream.address();
  const vite = await createViteServer({
    configFile: false,
    logLevel: 'silent',
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: true,
      proxy: createIgcMdtProxy(`http://127.0.0.1:${upstreamAddress.port}`),
    },
  });
  t.after(async () => {
    await vite.close();
    await new Promise((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
  });
  await vite.listen();
  const viteAddress = vite.httpServer.address();
  const response = await fetch(`http://127.0.0.1:${viteAddress.port}${ICGC_MDT_DEV_PROXY_PATH}`, {
    headers: { Range: 'bytes=0-3' },
  });

  assert.equal(upstreamRequest.url, new URL(ICGC_MDT_SOURCE_URL).pathname);
  assert.equal(upstreamRequest.range, 'bytes=0-3');
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 0-3/4369565862');
  assert.equal(response.headers.get('content-length'), '4');
  assert.equal(response.headers.get('content-type'), 'image/tiff');
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), body);
});
