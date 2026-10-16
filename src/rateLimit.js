import { ApiError } from './errors.js';


export function rateLimit({ limit, windowMs, keyFn }) {
    const hits = new Map(); // key -> { count, resetAt }
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of hits) {
            if (entry.resetAt <= now) hits.delete(key);
        }
    }, windowMs).unref();

    return function rateLimitMiddleware(req, res, next) {
        const key = keyFn(req);
        const now = Date.now();

        let entry = hits.get(key);
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            hits.set(key, entry);
        }
        entry.count++;

        const secondsLeft = Math.ceil((entry.resetAt - now) / 1000);
        res.set('RateLimit-Limit', String(limit));
        res.set('RateLimit-Remaining', String(Math.max(0, limit - entry.count)));
        res.set('RateLimit-Reset', String(secondsLeft));

        if (entry.count > limit) {
            res.set('Retry-After', String(secondsLeft));
            throw new ApiError(429, `too many requests, try again in ${secondsLeft}s`);
        }
        next();
    };
}
