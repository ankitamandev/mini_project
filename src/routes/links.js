import express from 'express';
import { query } from '../db.js';
import { ApiError } from '../errors.js';
import { validateLinks, parsePagination } from '../validate.js';
import { generateShortCode } from '../linkShortner.js';
import { requireApiKey } from '../auth.js';
import { rateLimit } from '../rateLimit.js';
import { BASE_URL, LINKS_PER_MINUTE } from '../config.js';

const router = express.Router();

// Every /links route needs an API key. req.user is set from here on.
router.use(requireApiKey);

// Creation is limited per user 
const createLimiter = rateLimit({
    limit: LINKS_PER_MINUTE,
    windowMs: 60_000,
    keyFn: (req) => `user:${req.user.id}`
});

const MAX_ATTEMPTS = 5;
const UNIQUE_VIOLATION = '23505';

const LINK_COLUMNS = 'id, code, original_url, clicks, max_clicks, expires_at, created_at';

function toLinkResponse(row) {
    return { ...row, short_url: `${BASE_URL}/${row.code}` };
}

// GET /links => the caller's own links, newest first
router.get('/', async (req, res) => {
    const page = parsePagination(req.query);
    if (!page) {
        throw new ApiError(400, 'validation failed', [
            { field: 'limit/offset', message: 'limit must be 1-100, offset must be 0 or more' }
        ]);
    }

    const result = await query(
        `SELECT ${LINK_COLUMNS} FROM links
         WHERE user_id = $1
         ORDER BY id DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, page.limit, page.offset]
    );
    res.json({ links: result.rows.map(toLinkResponse), ...page });
});

// POST /links
router.post('/', createLimiter, async (req, res) => {
    const errors = validateLinks(req.body);
    if (errors.length > 0) throw new ApiError(400, 'validation failed', errors);

    const originalUrl = req.body.link.trim();
    const alias = req.body.alias ? req.body.alias.trim() : null;
    // undefined/null both become SQL NULL = "never expires" / "no click limit".
    const expiresAt = req.body.expires_at ?? null;
    const maxClicks = req.body.max_clicks ?? null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const code = alias ?? generateShortCode();

        try {
            const result = await query(
                `INSERT INTO links (code, original_url, expires_at, max_clicks, user_id)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING ${LINK_COLUMNS}`,
                [code, originalUrl, expiresAt, maxClicks, req.user.id]
            );
            const row = result.rows[0];
            return res
                .status(201)
                .location(`/links/${row.code}`)
                .json(toLinkResponse(row));
        } catch (err) {
            if (err.code === UNIQUE_VIOLATION) {
                // A user-chosen alias won't change on retry, so a clash is the
                // client's problem (409). A random code clash is ours: try again.
                if (alias) throw new ApiError(409, 'custom alias already in use');
                continue;
            }
            throw err;
        }
    }

    throw new ApiError(500, 'could not generate a unique code');
});

// GET /links/:code — details without redirecting
router.get('/:code', async (req, res) => {
    const result = await query(
        `SELECT ${LINK_COLUMNS} FROM links WHERE code = $1 AND user_id = $2`,
        [req.params.code, req.user.id]
    );
    if (result.rows.length === 0) throw new ApiError(404, 'link not found');

    res.json(toLinkResponse(result.rows[0]));
});

// GET /links/:code/stats
router.get('/:code/stats', async (req, res) => {
    const linkResult = await query(
        `SELECT id, created_at FROM links WHERE code = $1 AND user_id = $2`,
        [req.params.code, req.user.id]
    );
    if (linkResult.rows.length === 0) throw new ApiError(404, 'link not found');
    const { id, created_at } = linkResult.rows[0];

    const totalsResult = await query(
        `SELECT
             COUNT(*)::int AS total_clicks,
             COUNT(*) FILTER (WHERE clicked_at >= now() - interval '7 days')::int AS last_7_days
         FROM link_clicks
         WHERE link_id = $1`,
        [id]
    );
    const { total_clicks, last_7_days } = totalsResult.rows[0];

    const dailyResult = await query(
        `SELECT
             (clicked_at AT TIME ZONE 'Asia/Kolkata')::date::text AS day,
             COUNT(*)::int AS clicks
         FROM link_clicks
         WHERE link_id = $1
           AND clicked_at >= now() - interval '7 days'
         GROUP BY day
         ORDER BY day`,
        [id]
    );

    const days = Math.max(1, Math.ceil((Date.now() - created_at.getTime()) / 86_400_000));

    res.json({
        code: req.params.code,
        total_clicks,
        last_7_days,
        avg_per_day: Number((total_clicks / days).toFixed(2)),
        daily: dailyResult.rows,
    });
});

// DELETE /links/:code
router.delete('/:code', async (req, res) => {
    const result = await query(
        `DELETE FROM links WHERE code = $1 AND user_id = $2`,
        [req.params.code, req.user.id]
    );
    if (result.rowCount === 0) throw new ApiError(404, 'link not found');

    // 204 No Content: it worked, and there is nothing to send back.
    res.status(204).end();
});

export default router;
