import express from 'express';
import { query, withTransaction } from '../db.js';
import { ApiError } from '../errors.js';

const router = express.Router();

// GET /:code — public, no API key needed. 
router.get('/:code', async (req, res) => {
    const code = req.params.code;

    const link = await withTransaction(async (client) => {
        const result = await client.query(
            `UPDATE links
             SET clicks = clicks + 1
             WHERE code = $1
               AND (expires_at IS NULL OR expires_at > now())
               AND (max_clicks IS NULL OR clicks < max_clicks)
             RETURNING id, original_url`,
            [code]
        );
        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        await client.query(`INSERT INTO link_clicks (link_id) VALUES ($1)`, [row.id]);
        return row;
    });

    if (!link) {
        const result = await query(
            `SELECT (expires_at IS NOT NULL AND expires_at <= now()) AS expired
             FROM links WHERE code = $1`,
            [code]
        );
        if (result.rows.length === 0) throw new ApiError(404, 'link not found');
        if (result.rows[0].expired) throw new ApiError(410, 'link has expired');
        throw new ApiError(410, 'link has reached its click limit');
    }

    // 302 (temporary), not 301: browsers cache 301s forever and would skip this
    // server on later visits, so clicks, expiry, limits and deletes would stop
    // working for that browser.
    res.redirect(302, link.original_url);
});

export default router;
