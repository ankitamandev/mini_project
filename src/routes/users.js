import express from 'express';
import { query } from '../db.js';
import { ApiError } from '../errors.js';
import { validateUser } from '../validate.js';
import { generateApiKey, hashApiKey, requireApiKey } from '../auth.js';
import { rateLimit } from '../rateLimit.js';
import { SIGNUPS_PER_HOUR } from '../config.js';

const router = express.Router();

const UNIQUE_VIOLATION = '23505';

const signupLimiter = rateLimit({
    limit: SIGNUPS_PER_HOUR,
    windowMs: 60 * 60_000,
    keyFn: (req) => `ip:${req.ip}`
});

// POST /users => sign up
router.post('/', signupLimiter, async (req, res) => {
    const errors = validateUser(req.body);
    if (errors.length > 0) throw new ApiError(400, 'validation failed', errors);
    const email = req.body.email.trim().toLowerCase();
    const apiKey = generateApiKey();

    try {
        const result = await query(
            `INSERT INTO users (email, api_key_hash)
             VALUES ($1, $2)
             RETURNING id, email, created_at`,
            [email, hashApiKey(apiKey)]
        );
        res.status(201).json({
            ...result.rows[0],
            api_key: apiKey,
            note: 'store this key now, it will not be shown again'
        });
    } catch (err) {
        if (err.code === UNIQUE_VIOLATION) throw new ApiError(409, 'email already registered');
        throw err;
    }
});

// GET /users/me — handy for checking that a key works.
router.get('/me', requireApiKey, (req, res) => {
    res.json(req.user);
});

// POST /users/me/api-key — rotate: issue a new key, the old one stops working
// immediately. The answer to "my key leaked" or "I lost my key".
router.post('/me/api-key', requireApiKey, async (req, res) => {
    const apiKey = generateApiKey();
    await query(
        `UPDATE users SET api_key_hash = $1 WHERE id = $2`,
        [hashApiKey(apiKey), req.user.id]
    );
    res.status(201).json({ api_key: apiKey, note: 'the previous key no longer works' });
});

// GET /users/me/stats?days=7 — the dashboard's numbers, across ALL of the
// caller's links (GET /links/:code/stats is the per-link version).
//
// "Period" = the last `days` calendar days in IST, today included. The
// previous period is the `days` days before that, so the dashboard can say
// "up 24% on the previous 7 days".
const STATS_RANGES = new Set([7, 14, 30]);

const PERIOD_BOUNDS = `
    SELECT ((today - ($2::int - 1))::timestamp       AT TIME ZONE 'Asia/Kolkata') AS cur_start,
           ((today - ($2::int * 2 - 1))::timestamp   AT TIME ZONE 'Asia/Kolkata') AS prev_start,
           today
    FROM (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS today) t
`;

// A link "works" while it hasn't expired and hasn't used up its click limit.
const WORKING = `(expires_at IS NULL OR expires_at > now())
                 AND (max_clicks IS NULL OR clicks < max_clicks)`;

router.get('/me/stats', requireApiKey, async (req, res) => {
    const days = req.query.days === undefined ? 7 : Number(req.query.days);
    if (!STATS_RANGES.has(days)) {
        throw new ApiError(400, 'validation failed', [{ field: 'days', message: 'days must be 7, 14 or 30' }]);
    }
    const params = [req.user.id, days];

    const [totals, daily, top] = await Promise.all([
        query(
            `SELECT COUNT(*)::int                                              AS links,
                    COUNT(*) FILTER (WHERE ${WORKING} AND clicks > 0)::int     AS live,
                    COUNT(*) FILTER (WHERE ${WORKING} AND clicks = 0)::int     AS unused,
                    COUNT(*) FILTER (WHERE NOT (${WORKING}))::int              AS ended,
                    COALESCE(SUM(clicks), 0)::int                              AS clicks
             FROM links
             WHERE user_id = $1`,
            [req.user.id]
        ),

        // generate_series makes one row per day, and the LEFT JOIN keeps days
        // with no clicks as 0. GROUP BY alone would simply leave them out.
        query(
            `WITH b AS (${PERIOD_BOUNDS}),
             days AS (
                 SELECT generate_series(b.today - ($2::int * 2 - 1), b.today, interval '1 day')::date AS day
                 FROM b
             ),
             counted AS (
                 SELECT (c.clicked_at AT TIME ZONE 'Asia/Kolkata')::date AS day, COUNT(*)::int AS clicks
                 FROM link_clicks c
                 JOIN links l ON l.id = c.link_id
                 CROSS JOIN b
                 WHERE l.user_id = $1 AND c.clicked_at >= b.prev_start
                 GROUP BY 1
             )
             SELECT days.day::text AS day, COALESCE(counted.clicks, 0) AS clicks
             FROM days LEFT JOIN counted USING (day)
             ORDER BY days.day`,
            params
        ),

        query(
            `WITH b AS (${PERIOD_BOUNDS})
             SELECT l.code,
                    COUNT(*) FILTER (WHERE c.clicked_at >= b.cur_start)::int AS current,
                    COUNT(*) FILTER (WHERE c.clicked_at <  b.cur_start)::int AS previous
             FROM link_clicks c
             JOIN links l ON l.id = c.link_id
             CROSS JOIN b
             WHERE l.user_id = $1 AND c.clicked_at >= b.prev_start
             GROUP BY l.id, l.code
             ORDER BY current DESC, previous DESC, l.id DESC
             LIMIT 8`,
            params
        )
    ]);

    res.json({
        days,
        totals: totals.rows[0],
        daily: daily.rows,          
        top_links: top.rows
    });
});

export default router;
