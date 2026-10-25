# GitHub Pages deployment

The Pages build uses the repository name from `GITHUB_REPOSITORY`, so this repository builds with `/BuscaPics/` as its asset base. Local Vite development continues to use `/`, including the existing ICGC MDT proxy.

## Manual GitHub setup

1. Push the prepared workflow to the repository's `master` branch when ready.
2. In GitHub, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
3. After the workflow finishes successfully, open the published URL shown in the workflow's `github-pages` environment. For this project repository it should be `https://xavimontesinos.github.io/BuscaPics/`.

The workflow runs `npm ci`, `npm test`, and `npm run build` for pushes, pull requests, and manual dispatch. It only deploys for pushes and manual dispatch; pull requests are build/test checks.

## MDT limitation on the static site

GitHub Pages serves static files and cannot run the Vite development proxy. In production, the app still requests the official ICGC COG directly. A test request for `Range: bytes=0-1023` with origin `https://xavimontesinos.github.io` received `206 Partial Content`, `Content-Range`, and `Content-Type: image/tiff`, but no `Access-Control-Allow-Origin`. Browsers therefore block the MDT response under CORS, so observer terrain elevations and MDT-backed visibility will not work from Pages as currently configured. The request read only 1 KiB; the full COG is about 4.37 GB.

The simplest solution is for the ICGC service to allow CORS for the Pages origin (or `*` if their policy permits it). If the ICGC cannot enable CORS, the next simplest option is a small serverless HTTP proxy that streams Range requests and preserves `206` and `Content-Range`; GitHub Pages itself cannot provide that backend. The local Vite proxy remains available for development and is not part of the Pages build.
