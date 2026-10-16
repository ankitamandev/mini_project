import crypto from 'crypto';
import { query } from './db.js';
import { ApiError } from './errors.js';

export function generateApiKey() {
    return 'sk_' + crypto.randomBytes(32).toString('base64url');
}

export function hashApiKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
}

// Middleware: expects "Authorization: Bearer sk_..." and sets req.user
export async function requireApiKey(req, res, next) {
    const header = req.get('authorization') || '';
    const match = header.match(/^Bearer\s+(\S+)$/i);
    if (!match) {
        res.set('WWW-Authenticate', 'Bearer');
        throw new ApiError(401, 'missing API key: send "Authorization: Bearer <key>"');
    }

    const result = await query(
        `SELECT id, email FROM users WHERE api_key_hash = $1`,
        [hashApiKey(match[1])]
    );
    if (result.rows.length === 0) {
        res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
        throw new ApiError(401, 'invalid API key');
    }

    req.user = result.rows[0];
    next();
}
