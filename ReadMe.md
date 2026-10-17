# URL Shortener

A URL shortener backend in Node.js, Express 5 and PostgreSQL, written with raw SQL (no ORM), with a small dashboard served by the same server.

Users sign up for an API key, create short links (random or custom alias), optionally set an expiry date or a click limit, and see click stats per link and across all their links. Redirects are public.

## Running it

Requirements: Node 20+, PostgreSQL 14+.

```bash
npm install
cp .env.example .env        # then set DATABASE_URL (BASE_URL defaults to localhost:3000)
npm run migrate             # applies migrations/*.sql in order, once each
npm run dev                 # API and dashboard on http://localhost:3000
```

Run `npm run migrate` again after pulling new code: it skips migrations that already ran and applies only the new ones.

## Dashboard

Open `http://localhost:3000/` after `npm run dev`. The dashboard lives in `public/` (plain HTML, CSS and JavaScript, no build step) and Express serves it from the same origin as the API, so no CORS setup is needed.

- **Overview**: clicks this period against the previous one, links by status (live, not clicked yet, ended), top links, and a timeline of the newest links from creation to expiry
- **Links**: create links (alias, expiry, click limit), copy, per-link stats, delete, pagination
- **Account**: API key, key rotation, a ready-to-run curl command
- **Explore with sample data** on the sign-in screen runs the whole dashboard from memory, without touching the server

The API key is kept in the browser's `localStorage` so you stay signed in. Every value from the server is escaped before it goes into the page.

## Using your API key

The key is how the server knows who is asking. HTTP keeps no memory between requests, so the key travels with every request.

1. **Get it once.** Sign up in the dashboard, or with `POST /users` and `{ "email": "..." }`. The response is the only time the key is shown: the server stores just its SHA-256 hash.
2. **Send it with every request** to `/links` and `/users/me`, in the `Authorization` header:

   ```bash
   export KEY=sk_...
   curl localhost:3000/links -H "Authorization: Bearer $KEY"
   ```

   ```javascript
   await fetch('http://localhost:3000/links', {
       headers: { Authorization: `Bearer ${process.env.KEY}` }
   });
   ```

   The dashboard does the same: it keeps the key in the browser and adds this header to every request.
3. **Rotate it if it leaks** with `POST /users/me/api-key` (or Account → Rotate key). You get a new key and the old one stops working immediately.

People who open a short link never need a key. `GET /:code` is public.

Keep the key secret: put it in an environment variable, keep `.env` out of git, use HTTPS in production (the header is plain text over HTTP), and never hard-code it into frontend code that other people load.

## API

All `/links` routes and `/users/me*` routes need `Authorization: Bearer <api_key>`.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/users` | — | Sign up with `{ "email" }`. Returns the API key **once**. |
| `GET` | `/users/me` | key | Who this key belongs to |
| `GET` | `/users/me/stats` | key | Dashboard numbers across all your links (`?days=7\|14\|30`) |
| `POST` | `/users/me/api-key` | key | Rotate the key; the old one stops working |
| `POST` | `/links` | key | Create a link (body below) |
| `GET` | `/links` | key | Your links, newest first (`?limit=1-100&offset=0`) |
| `GET` | `/links/:code` | key | One link's details, no redirect |
| `GET` | `/links/:code/stats` | key | Total, last 7 days, average per day, daily breakdown |
| `DELETE` | `/links/:code` | key | Delete a link (and its click history) |
| `GET` | `/:code` | — | Redirect (302) to the original URL |
| `GET` | `/health` | — | Liveness check |

`POST /links` body:

```json
{
  "link": "https://example.com/some/long/path",
  "alias": "my-resume",
  "expires_at": "2026-12-31T23:59:59+05:30",
  "max_clicks": 100
}
```

Only `link` is required. `alias` is 3-30 characters of `A-Z a-z 0-9 - _`. `expires_at` must include a timezone and be in the future.

### Status codes

| Code | When |
|---|---|
| `201` | Link or user created (`Location` header on links) |
| `204` | Link deleted |
| `302` | Redirect |
| `400` | Validation failed (`details` lists each field) |
| `401` | Missing or invalid API key |
| `404` | Unknown code, or a link owned by someone else |
| `409` | Alias already taken, or email already registered |
| `410` | Link expired or reached its click limit |
| `429` | Rate limit hit (`Retry-After` says when to retry) |

### Example

```bash
KEY=$(curl -s -X POST localhost:3000/users -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com"}' | jq -r .api_key)

curl -s -X POST localhost:3000/links -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' -d '{"link":"https://example.com","max_clicks":3}'

curl -i localhost:3000/<code>                                       # 302
curl -s localhost:3000/links/<code>/stats -H "Authorization: Bearer $KEY"
```

## Design decisions

**Same URL submitted twice gets a new code each time.** Each link has its own owner, expiry, click limit and stats, so two people shortening the same URL (or one person making two campaign links) need separate rows. Returning the existing code would also force a decision on URL normalisation (`a.com` vs `a.com/`) with no real benefit.

**Codes are never handed out twice, and the database guarantees it.** `links.code` has a `UNIQUE` constraint. Checking with a `SELECT` first would not be enough: two concurrent requests could both see a code as free. Instead the insert is attempted, and on a unique violation (`23505`) a new random code is generated, up to 5 attempts. A custom alias isn't retried, since it would clash again; that returns `409`.

**Click limits hold under concurrency.** The redirect is one `UPDATE ... SET clicks = clicks + 1 WHERE code = $1 AND (expires_at IS NULL OR expires_at > now()) AND (max_clicks IS NULL OR clicks < max_clicks) RETURNING ...`. Postgres locks the row and re-checks the `WHERE` for each waiting request, so with `max_clicks = 10` and 50 simultaneous requests exactly 10 succeed (tested). Reading the count in JS and writing it back would let several requests pass at once.

**The counter and the click log stay in sync.** The `UPDATE` and the `INSERT INTO link_clicks` run in one transaction.

**302, not 301.** Browsers cache 301s permanently and stop asking the server, which would break click counting, expiry, limits and deletion.

**410 for expired / used-up links, 404 for unknown ones.** `410 Gone` says "this existed and was retired on purpose", which is true and lets a client stop retrying.

**Another user's link returns 404, not 403.** A 403 would confirm that the code exists.

**API keys are stored as SHA-256 hashes.** A leaked database doesn't expose usable keys. A fast hash is fine here because the keys are 256-bit random values; slow hashes like bcrypt exist for guessable human passwords.

**Aliases can't shadow routes.** Words like `health`, `links` and `users` are reserved, and aliases are limited to URL-safe characters, so `/:code` always matches them.

**Rate limiting is per user for links, per IP for sign-ups.** Link creation is counted by API key because many users can share one IP. Sign-up has no key yet, so it is counted by IP.

## Known limitations

- The rate limiter is in memory: counts reset on restart and aren't shared between processes. A shared store (Redis or a Postgres table) would fix both.
- Fixed-window limiting allows a burst at the window edge (up to 2x the limit across two adjacent windows).
- Behind a reverse proxy, `req.ip` is the proxy's address. Set Express's `trust proxy` for that proxy only; enabling it blindly lets clients fake their IP with `X-Forwarded-For`.
- Links created before migration 007 have no owner: they still redirect, but no API key can list or delete them.
- Clicks made before migration 005 are in `links.clicks` but not in `link_clicks`, so `/stats` doesn't include them.
- Every request to `/:code` counts as a click, including `HEAD` requests and link-preview bots (WhatsApp, Slack). Filtering those would need user-agent rules.
- Email addresses are not verified.
- A lost key can't be recovered. Rotating needs the current key, and there is no password or email reset. A real service would send a reset link by email.
- The dashboard keeps the key in `localStorage`, which any script running on the page could read. That is why every server value is escaped before it is shown; an httpOnly session cookie would be the stronger option.

## Project layout

```
server.js               app setup and route order
src/config.js           env vars (fails fast if a required one is missing)
src/db.js               pg pool, query(), withTransaction()
src/errors.js           ApiError, 404 and error handlers, Postgres error mapping
src/auth.js             API key generation, hashing, requireApiKey middleware
src/rateLimit.js        fixed-window rate limiter
src/validate.js         request validation
src/linkShortner.js     random base62 codes
src/routes/users.js     sign-up, key rotation, dashboard stats
src/routes/links.js     link CRUD and stats
src/routes/redirect.js  public GET /:code
src/migrate.js          runs migrations/*.sql once each, in a transaction
public/index.html       dashboard shell
public/styles.css       dashboard styles
public/js/app.js        screens: sign-in, overview, links, account
public/js/api.js        fetch wrapper for the API
public/js/charts.js     hand-drawn SVG/HTML charts
public/js/demo.js       sample-data mode
public/js/format.js     dates, numbers, escaping, link status
```