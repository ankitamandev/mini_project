import express from 'express';
import { query } from '../db.js';
import { ApiError } from '../errors.js';
import { validateLinks } from '../validate.js';
import { generateShortCode } from '../linkShortner.js';

const router = express.Router();

const BASE_URL = process.env.BASE_URL;   
const MAX_ATTEMPTS = 5;
const UNIQUE_VIOLATION = '23505';

// POST /links 
router.post('/', async (req, res) => {
    const errors = validateLinks(req.body);
    if (errors.length > 0) throw new ApiError(400, 'validation failed', errors);

    const originalUrl = req.body.link.trim();
    const alias = req.body.alias ? req.body.alias.trim() : null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const code = alias ? alias : generateShortCode();
        
        try {
            const result = await query(
                `INSERT INTO links (code, original_url)
                 VALUES ($1, $2)
                 RETURNING id, code, original_url, created_at`,
                [code, originalUrl]
            );
            const row = result.rows[0];
            return res
                .status(201)
                .location(`/links/${row.code}`)
                .json({ ...row, short_url: `${BASE_URL}/${row.code}` });
        } catch (err) {
            
            if (err.code === UNIQUE_VIOLATION) {
                if(alias) {
                    throw new ApiError(409, 'Custom alias already in use');
                }
                continue;
            }
            throw err;   
        }
    }

    throw new ApiError(500, 'could not generate a unique code');
});

// GET /links/:code without redirect
router.get('/:code', async (req, res) => {
    const result = await query(
        `SELECT id, code, original_url, created_at FROM links WHERE code = $1`,
        [req.params.code]
    );
    if (result.rows.length === 0) throw new ApiError(404, 'link not found');

    const row = result.rows[0];
    res.json({ ...row, short_url: `${BASE_URL}/${row.code}` });
});

router.get('/:code/stats', async (req, res) => {

    const linkResult = await query(
        `SELECT id, created_at FROM links WHERE code = $1`,
        [req.params.code]
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

router.delete('/:code', async (req, res) => {
    const requestedCode = req.params.code.trim();
    const result = await query(
        `DELETE FROM links WHERE code = $1`, [requestedCode]
    );
    if(result.rowCount === 1) {
        res.status(201).end();
    } else {
        res.status(404).end();
    }
});

export default router;