# GitHub Pages deployment

The Pages build uses the repository name from `GITHUB_REPOSITORY`, so this repository builds with `/BuscaPics/` as its asset base. Local Vite development continues to use `/`, including the existing ICGC MDT proxy.

## Manual GitHub setup

1. Push the prepared workflow to the repository's `master` branch when ready.
2. In GitHub, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
3. After the workflow finishes successfully, open the published URL shown in the workflow's `github-pages` environment. For this project repository it should be `https://xavimontesinos.github.io/BuscaPics/`.

The workflow runs `npm ci`, `npm test`, and `npm run build` for pushes, pull requests, and manual dispatch. It only deploys for pushes and manual dispatch; pull requests are build/test checks.

## MDT proxy for production

GitHub Pages serves static files and cannot run the Vite development proxy. The official ICGC COG responds with `206 Partial Content` but does not allow the Pages origin through CORS. Production therefore uses the fixed-resource Cloudflare Worker in `workers/icgc-mdt-proxy/`; local Vite still uses `/__icgc_mdt__`.

The Worker accepts only `GET` and `OPTIONS` at `/mdt.tif`, permits CORS only for `https://xavimontesinos.github.io`, and always requests the one official ICGC TIFF URL embedded in its source. It requires one explicit byte range up to 16 MiB, forwards it upstream, and streams the upstream response without buffering or caching the TIFF. A request for the entire 4.37 GB file is not accepted as a single range.

### Deploy the Worker

No Cloudflare account secret or Worker runtime variable is needed. The upstream and allowed Pages origin are fixed constants in `index.mjs`.

1. Create a Cloudflare account and enable Workers. From the repository root, authenticate Wrangler and deploy the included configuration (this does not deploy GitHub Pages):

   ```sh
   npx wrangler login
   npx wrangler deploy --config workers/icgc-mdt-proxy/wrangler.toml
   ```

   Alternatively, create a Worker in the Cloudflare dashboard and publish the contents of `workers/icgc-mdt-proxy/index.mjs`. Set the route to `/mdt.tif` on the Worker URL; do not add a user-controlled upstream URL.

2. Record the resulting HTTPS URL ending in `/mdt.tif`, for example `https://buscapics-icgc-mdt.<account>.workers.dev/mdt.tif`.

3. Verify CORS preflight and a small partial response, replacing the example host with the deployed Worker URL:

   ```sh
   curl -i -X OPTIONS 'https://buscapics-icgc-mdt.<account>.workers.dev/mdt.tif' \
     -H 'Origin: https://xavimontesinos.github.io' \
     -H 'Access-Control-Request-Method: GET' \
     -H 'Access-Control-Request-Headers: range'

   curl -i -o /dev/null 'https://buscapics-icgc-mdt.<account>.workers.dev/mdt.tif' \
     -H 'Origin: https://xavimontesinos.github.io' \
     -H 'Range: bytes=0-1023'
   ```

   Expect `204` and `Access-Control-Allow-Origin` for OPTIONS, then `206`, `Content-Range: bytes 0-1023/...`, `Accept-Ranges`, `Content-Length: 1024`, and the same allowed origin for GET.

4. In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables**, create the repository variable `ICGC_MDT_WORKER_URL`, and set it to the full Worker URL ending in `/mdt.tif`. This is a public URL, so it belongs in Variables, not Secrets. The Pages workflow injects it into the production build. Pushes and manual workflow runs fail before deployment if it is missing; pull requests can still build without the production variable.

5. Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. After reviewing the prepared changes, pushing them and running the workflow are manual actions; this task does not publish anything.

Cloudflare's current Workers Free plan includes 100,000 requests per day, 10 ms CPU time per invocation, 128 MB memory, and 50 subrequests per invocation. This proxy performs one upstream fetch per range request and streams the body, so it does not hold the multi-gigabyte file in Worker memory. Each separate Range request counts toward the request quota; check current limits and usage in Cloudflare before field use because plan terms can change.
