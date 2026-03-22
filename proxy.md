# IFDB proxy plan

## Why this is needed

Direct browser requests from fweep to IFDB do not work in production because IFDB does not allow cross-origin browser access to its API responses.

What we observed:

- fweep can be configured to allow outbound requests to `https://ifdb.org`
- the browser still blocks the response because IFDB does not send CORS headers permitting access from the app origin

This means the browser cannot call IFDB directly with `fetch()` from frontend code.

## Development approach

Use a thin proxy owned by fweep.

The browser should call a fweep-controlled endpoint such as:

- `/api/ifdb/search?query=...`
- `/api/ifdb/viewgame?tuid=...`

That endpoint should:

1. receive the request from the frontend
2. validate and normalize the input
3. call IFDB server-side
4. return only the data shape fweep needs

This avoids browser CORS restrictions because the browser is no longer calling IFDB directly.

## Recommended architecture

### Frontend

- The React app should call only local app endpoints under `/api/ifdb/...`
- The frontend should never call `https://ifdb.org/...` directly
- The frontend should treat the proxy as the canonical IFDB service boundary

### Proxy

- The proxy should be intentionally small and stateless
- It should expose only the IFDB operations fweep actually needs:
  - search
  - viewgame
- It should not attempt to mirror the entire IFDB API

### IFDB requests

- The proxy should call the IFDB endpoints server-side
- It should pass through only the required query parameters
- It should apply conservative timeouts and clear error handling
- It should avoid unnecessary repeated requests for the same game where practical

## Deployment options

GitHub Pages by itself cannot host the proxy because it is static-only.

Reasonable production choices:

1. Serverless function on a separate host
   - Vercel Function
   - Netlify Function
   - Cloudflare Worker
   - another small HTTP function host

2. Small dedicated backend service
   - only if we expect this integration to grow significantly

For this project, a serverless function is the recommended production choice.

## Recommended production setup

### 1. Keep the main app static

- Continue serving the frontend as a static site if desired
- Keep GitHub Pages for the main app only if we are comfortable depending on an external API host for `/api/ifdb`

### 2. Deploy a separate serverless proxy

- Deploy a tiny serverless service that exposes:
  - `GET /api/ifdb/search`
  - `GET /api/ifdb/viewgame`
- Configure CORS on the proxy to allow requests from the fweep frontend origin

Current implementation in this repo:

- Vercel function entry points:
  - `api/ifdb/search.ts`
  - `api/ifdb/viewgame.ts`
- Shared server-side proxy logic:
  - `shared/ifdb-proxy.ts`
  - `shared/ifdb-proxy-http.ts`
- Suggested Vercel config:
  - `vercel.json`

### 3. Point the frontend at the proxy

- In development, frontend code can call a local path such as `/api/ifdb/...`
- In production, configure that path to resolve to the deployed proxy origin
- Prefer using an environment variable for the proxy base URL

Current frontend production setting:

- `VITE_IFDB_PROXY_BASE_URL`
  - Example: `https://fweep-ifdb-proxy.vercel.app`
  - If unset, the frontend falls back to same-origin `/api/ifdb/...`

## Endpoint design

### Search endpoint

`GET /api/ifdb/search?query=<text>`

Behavior:

- validate that `query` is present and non-empty
- call IFDB search server-side
- return only the fields the frontend needs, such as:
  - `tuid`
  - `title`
  - `author`
  - `published`
  - `publishedDisplay`
  - `publishedYear`
  - `averageRating`

### Viewgame endpoint

`GET /api/ifdb/viewgame?tuid=<tuid>`

Behavior:

- validate that `tuid` is present
- call IFDB viewgame server-side
- return only the fields fweep needs for game selection and persistence, such as:
  - `tuid`
  - `ifids`
  - `title`
  - `author`
  - candidate downloadable story files
  - `playOnlineUrl` only if useful as fallback metadata

## Proxy responsibilities

- validate inputs
- translate frontend-friendly parameter names into IFDB request parameters
- normalize IFDB responses into the shapes expected by fweep
- hide IFDB quirks from the frontend
- return clear HTTP errors and messages for:
  - invalid request parameters
  - IFDB failure
  - malformed IFDB response
  - no usable story files

## Proxy non-goals

- storing IFDB data permanently
- caching aggressively on day one
- rewriting or scraping IFDB pages outside the documented API unless absolutely necessary
- acting as a general-purpose IFDB mirror

## Caching guidance

Caching is optional for the first pass, but useful.

Recommended:

- short cache for search results
- longer cache for `viewgame` details keyed by TUID

Keep caching simple and conservative.

## Security guidance

- do not expose secrets in frontend code
- validate and constrain all incoming query parameters
- avoid open proxy behavior
- allow only the small fixed set of IFDB upstream endpoints fweep needs
- return sanitized error messages to the client

Current proxy guardrails implemented:

- only `/api/ifdb/search` and `/api/ifdb/viewgame` are supported
- only `GET` and `OPTIONS` are accepted
- disallowed origins can be rejected using:
  - `IFDB_PROXY_ALLOWED_ORIGINS`
  - comma-separated list, for example: `https://rileypb.github.io`
- IFDB requests still use the fixed custom `User-Agent` header
- request validation includes:
  - `query` max length: `120`
  - `tuid` max length: `64`
- upstream IFDB requests use a `5s` timeout signal when available
- cache headers are returned:
  - search: `public, s-maxage=300, stale-while-revalidate=600`
  - viewgame: `public, s-maxage=86400, stale-while-revalidate=604800`

## Development setup

For local development, use a dev proxy so the frontend can keep calling `/api/ifdb/...`.

Current implementation:

- `frontend/vite.config.ts` now serves:
  - `GET /api/ifdb/search`
  - `GET /api/ifdb/viewgame`
- the Vite proxy calls IFDB server-side and adds a custom `User-Agent` header to avoid Cloudflare bot rejection
- the frontend code can keep using same-origin `/api/ifdb/...` paths in both development and preview

Keep the frontend code identical between dev and production as much as possible.

## Vercel setup notes

Recommended Vercel environment variables:

- `IFDB_PROXY_ALLOWED_ORIGINS`
  - Example: `https://rileypb.github.io`

Recommended frontend environment variable:

- `VITE_IFDB_PROXY_BASE_URL`
  - Set this in the frontend build environment to the deployed Vercel proxy origin

Deployment shape:

1. Create a Vercel project rooted at this repository.
2. Use the serverless endpoints under `api/ifdb/`.
3. Set `IFDB_PROXY_ALLOWED_ORIGINS` in the Vercel project.
4. Deploy and note the Vercel project URL.
5. Set `VITE_IFDB_PROXY_BASE_URL` for the frontend build to that deployed URL.
6. Redeploy the frontend so production requests target the Vercel proxy instead of same-origin `/api/ifdb/...`.

## Recommended next implementation steps

1. Deploy the Vercel proxy.
2. Set `VITE_IFDB_PROXY_BASE_URL` for the frontend production build.
3. Verify `search` and `viewgame` from the deployed site.
4. Optionally add lightweight caching and rate limiting once end-to-end search is in regular use.
