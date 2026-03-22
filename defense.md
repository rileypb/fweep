It’s a real risk, but probably not a reason to abandon the feature.

The risk is not “someone will definitely bankrupt me,” but these are genuine concerns:

- a public proxy can be abused for request amplification
- serverless invocations can cost money under sustained traffic
- without controls, your proxy could hammer IFDB in ways that look like they came from you
- GitHub Pages frontend plus separate proxy means the proxy is the exposed choke point

The good news is that your proxy design is already narrow, which helps a lot. It only needs:
- `GET /api/ifdb/search`
- `GET /api/ifdb/viewgame`

So this is manageable if we design it defensively.

What I’d recommend as minimum protection:
- strict endpoint allowlist
  - only those two paths
  - only `GET`
  - only specific query params
- input validation
  - max query length
  - require non-empty query/tuid
- aggressive caching
  - especially for `viewgame`
  - short cache for `search`
- per-IP rate limiting
  - even simple rate limiting is much better than none
- origin restriction
  - allow browser calls only from your deployed app origin
  - this is not sufficient alone, but still useful
- no open proxy behavior
  - never accept arbitrary upstream URLs
- conservative upstream timeouts
- friendly error responses rather than retries/spinning
- a distinctive `User-Agent` and being a good citizen toward IFDB

Important nuance:
- CORS restrictions do not protect your proxy from non-browser abuse
- someone can hit the endpoint directly with curl/bots
- so rate limiting and caching matter more than CORS

Best practical architecture:
- put the proxy behind a CDN/edge cache
- cache popular search/viewgame responses
- rate limit at the edge if possible
- keep the function tiny and stateless

If you want the safest path, I’d do one of these:
1. ship `v3` without public IFDB production support yet
2. or ship with proxy plus rate limiting and caching from day one

So no, you’re not worrying too much. It’s a real design concern. But it’s a standard one, and it can be reduced a lot with a small set of guardrails.

If you want, I can draft a concrete “safe proxy requirements” checklist for this project before we implement anything.