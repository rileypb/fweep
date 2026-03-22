# IFDB proxy plan

## Why this is needed

Direct browser requests from fweep to IFDB do not work in production because IFDB does not allow cross-origin browser access to its API responses.

What we observed:

- fweep can be configured to allow outbound requests to `https://ifdb.org`
- the browser still blocks the response because IFDB does not send CORS headers permitting access from the app origin

This means the browser cannot call IFDB directly with `fetch()` from frontend code.

## Production approach

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

### 3. Point the frontend at the proxy

- In development, frontend code can call a local path such as `/api/ifdb/...`
- In production, configure that path to resolve to the deployed proxy origin
- Prefer using an environment variable for the proxy base URL

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

## Development setup

For local development, use a dev proxy so the frontend can keep calling `/api/ifdb/...`.

Current implementation:

- `frontend/vite.config.ts` now serves:
  - `GET /api/ifdb/search`
  - `GET /api/ifdb/viewgame`
- the Vite proxy calls IFDB server-side and adds a custom `User-Agent` header to avoid Cloudflare bot rejection
- the frontend code can keep using same-origin `/api/ifdb/...` paths in both development and preview

Keep the frontend code identical between dev and production as much as possible.

## Recommended next implementation steps

1. Keep the current frontend client pointed at `/api/ifdb/search` and `/api/ifdb/viewgame`.
2. Reuse the same request/response contract in a production serverless proxy.
3. Update deployment configuration so the production app origin can reach that proxy.
4. Optionally add lightweight caching and rate limiting once end-to-end search is in regular use.
