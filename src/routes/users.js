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

// GET /users/me => for checking that a key works.
router.get('/me', requireApiKey, (req, res) => {
    res.json(req.user);
});

// POST /users/me/api-key => rotate: issue a new key, the old one stops working
// immediately. The answer to "my key leaked" or "I lost my key".
router.post('/me/api-key', requireApiKey, async (req, res) => {
    const apiKey = generateApiKey();
    await query(
        `UPDATE users SET api_key_hash = $1 WHERE id = $2`,
        [hashApiKey(apiKey), req.user.id]
    );
    res.status(201).json({ api_key: apiKey, note: 'the previous key no longer works' });
});

export default router;
