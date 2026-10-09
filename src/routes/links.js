import express from 'express';
import { query } from '../db.js';
import { ApiError } from '../errors.js';
import { validateLinks } from '../validate.js';
import { generateShortCode } from '../linkShortner.js';

const router = express.Router();

const BASE_URL = process.env.BASE_URL;   // apne requireEnv('BASE_URL') se le lo
const MAX_ATTEMPTS = 5;
const UNIQUE_VIOLATION = '23505';

// POST /links — naya short link banao
router.post('/', async (req, res) => {
    const errors = validateLinks(req.body);
    if (errors.length > 0) throw new ApiError(400, 'validation failed', errors);

    const originalUrl = req.body.link.trim();

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const code = generateShortCode();
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
            // code pehle se kisi ne le liya: naya code bana ke dobara try karo
            if (err.code === UNIQUE_VIOLATION) continue;
            throw err;   // koi aur error hai to central handler ko jaane do
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

export default router;