// Sample data mode: the same methods as createApi(), answered from memory.
// Lets someone look around the dashboard without running the server.
// It follows the server's rules (alias format, reserved words, expiry in the
// future, 10 new links a minute) so the screens behave the same way.

import { RequestError } from './api.js';
import { istDay, lastIstDays } from './format.js';

const SAMPLE_BASE = 'http://localhost:3000';
const DAY = 86_400_000;
const RESERVED = new Set(['health', 'links', 'users', 'api', 'admin', 'static', 'docs']);
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Every visit sees the same sample data.
function seeded(seed) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// age = days since created, rate = typical clicks a day
const SEED = [
    { url: 'https://github.com/ankitamandev/mini_project', alias: 'shortener-repo', age: 44, rate: 5 },
    { url: 'https://leetcode.com/problemset/', alias: 'dsa-sheet', age: 38, rate: 9 },
    { url: 'https://datatracker.ietf.org/doc/html/rfc2328', alias: 'ospf-rfc', age: 35, rate: 3, expiresIn: -9 },
    { url: 'https://www.postgresql.org/docs/current/tutorial-transactions.html', alias: null, age: 31, rate: 2.5 },
    { url: 'https://expressjs.com/en/guide/routing.html', alias: 'express-routing', age: 27, rate: 4 },
    { url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/410', alias: null, age: 24, rate: 1.2 },
    { url: 'https://nodejs.org/en/learn/getting-started/introduction-to-nodejs', alias: 'node-intro', age: 21, rate: 5, maxClicks: 60 },
    { url: 'https://www.postgresql.org/docs/current/functions-srf.html', alias: null, age: 18, rate: 1.6 },
    { url: 'https://github.com/ankitamandev', alias: 'gh', age: 15, rate: 7 },
    { url: 'https://datatracker.ietf.org/doc/html/rfc6585#section-4', alias: 'http-429', age: 12, rate: 2, expiresIn: 18 },
    { url: 'https://en.wikipedia.org/wiki/Double-entry_bookkeeping', alias: 'ledger-notes', age: 9, rate: 3.5 },
    { url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API', alias: null, age: 6, rate: 8, maxClicks: 25 },
    { url: 'https://expressjs.com/en/starter/static-files.html', alias: 'static-files', age: 4, rate: 4.5, expiresIn: 10 },
    { url: 'https://www.postgresql.org/docs/current/indexes-multicolumn.html', alias: null, age: 2, rate: 0 },
    { url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After', alias: null, age: 1, rate: 0 }
];

function poisson(rand, lambda) {
    const limit = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= rand(); } while (p > limit);
    return k - 1;
}

function buildLinks(now) {
    const rand = seeded(20261017);
    const randomCode = () => Array.from({ length: 7 }, () => ALPHABET[Math.floor(rand() * 62)]).join('');

    return SEED.map((s, i) => {
        const createdAt = now - s.age * DAY - Math.floor(rand() * 6) * 3_600_000;
        const expiresAt = s.expiresIn === undefined ? null : now + s.expiresIn * DAY;
        const stop = expiresAt === null ? now : Math.min(now, expiresAt);
        const clickTimes = [];

        for (let t = createdAt; t < stop && s.rate > 0; t += DAY) {
            const dayIndex = (t - createdAt) / DAY;
            const weekday = new Date(t).getUTCDay();
            const busy = weekday === 0 || weekday === 6 ? 0.6 : 1.1;   // quieter weekends
            const launch = dayIndex < 3 ? 2.2 : 1;                     // shared widely at first
            const n = poisson(rand, s.rate * busy * launch);
            for (let k = 0; k < n; k++) {
                const at = t + rand() * DAY;
                if (at < stop) clickTimes.push(at);
            }
        }
        clickTimes.sort((a, b) => a - b);
        if (s.maxClicks) clickTimes.splice(s.maxClicks);

        return {
            id: i + 1,
            code: s.alias ?? randomCode(),
            original_url: s.url,
            max_clicks: s.maxClicks ?? null,
            expires_at: expiresAt === null ? null : new Date(expiresAt).toISOString(),
            created_at: new Date(createdAt).toISOString(),
            clickTimes
        };
    });
}

const WORKS = (l, now) =>
    (l.expires_at === null || new Date(l.expires_at).getTime() > now) &&
    (l.max_clicks === null || l.clickTimes.length < l.max_clicks);

function publicLink(l) {
    return {
        id: l.id,
        code: l.code,
        original_url: l.original_url,
        clicks: l.clickTimes.length,
        max_clicks: l.max_clicks,
        expires_at: l.expires_at,
        created_at: l.created_at,
        short_url: `${SAMPLE_BASE}/${l.code}`
    };
}

function validate(body) {
    const errors = [];
    const link = typeof body.link === 'string' ? body.link.trim() : '';
    let okUrl = false;
    try { okUrl = ['http:', 'https:'].includes(new URL(link).protocol); } catch { okUrl = false; }
    if (!link) errors.push({ field: 'link', message: 'link is required' });
    else if (link.length > 2048) errors.push({ field: 'link', message: 'link must be 2048 characters or fewer' });
    else if (!okUrl) errors.push({ field: 'link', message: 'link must be a valid http or https URL' });

    if (body.alias != null) {
        const a = String(body.alias).trim();
        if (a.length < 3 || a.length > 30) errors.push({ field: 'alias', message: 'alias must be 3-30 characters' });
        else if (!/^[A-Za-z0-9_-]+$/.test(a)) errors.push({ field: 'alias', message: 'alias may only contain letters, digits, "-" and "_"' });
        else if (RESERVED.has(a.toLowerCase())) errors.push({ field: 'alias', message: `"${a}" is reserved` });
    }
    if (body.expires_at != null && new Date(body.expires_at).getTime() <= Date.now()) {
        errors.push({ field: 'expires_at', message: 'expires_at must be in the future' });
    }
    if (body.max_clicks != null && (!Number.isInteger(body.max_clicks) || body.max_clicks < 1)) {
        errors.push({ field: 'max_clicks', message: 'max_clicks must be a whole number from 1 to 2147483647' });
    }
    return errors;
}

export function createSampleApi() {
    const links = buildLinks(Date.now());
    let nextId = links.length + 1;
    const rateWindow = { count: 0, resetAt: 0 };
    const rand = seeded(Date.now() % 100000);

    const find = (code) => {
        const l = links.find((x) => x.code === code);
        if (!l) throw new RequestError(404, 'That link no longer exists. It may have been deleted.');
        return l;
    };

    const api = {
        lastRateLimit: null,
        isSample: true,

        async me() { return { id: 1, email: 'sample@example.com' }; },

        async rotateKey() {
            const key = 'sk_sample_' + Array.from({ length: 24 }, () => ALPHABET[Math.floor(rand() * 62)]).join('');
            return { api_key: key, note: 'the previous key no longer works' };
        },

        async summary(days) {
            const now = Date.now();
            const allDays = lastIstDays(days * 2, now);
            const curFirst = allDays[days];
            const prevFirst = allDays[0];
            const perDay = new Map(allDays.map((d) => [d, 0]));

            const top = [];
            for (const l of links) {
                let current = 0, previous = 0;
                for (const t of l.clickTimes) {
                    const d = istDay(new Date(t));
                    if (!perDay.has(d)) continue;
                    perDay.set(d, perDay.get(d) + 1);
                    if (d >= curFirst) current++; else if (d >= prevFirst) previous++;
                }
                if (current + previous > 0) top.push({ id: l.id, code: l.code, current, previous });
            }
            top.sort((a, b) => b.current - a.current || b.previous - a.previous || b.id - a.id);

            const working = links.filter((l) => WORKS(l, now));
            return {
                days,
                totals: {
                    links: links.length,
                    live: working.filter((l) => l.clickTimes.length > 0).length,
                    unused: working.filter((l) => l.clickTimes.length === 0).length,
                    ended: links.length - working.length,
                    clicks: links.reduce((n, l) => n + l.clickTimes.length, 0)
                },
                daily: allDays.map((day) => ({ day, clicks: perDay.get(day) })),
                top_links: top.slice(0, 8).map(({ code, current, previous }) => ({ code, current, previous }))
            };
        },

        async listLinks({ limit, offset }) {
            const sorted = [...links].sort((a, b) => b.id - a.id);
            return { links: sorted.slice(offset, offset + limit).map(publicLink), limit, offset };
        },

        async createLink(body) {
            const now = Date.now();
            if (rateWindow.resetAt <= now) { rateWindow.count = 0; rateWindow.resetAt = now + 60_000; }
            rateWindow.count++;
            const resetSeconds = Math.ceil((rateWindow.resetAt - now) / 1000);
            api.lastRateLimit = { limit: 10, remaining: Math.max(0, 10 - rateWindow.count), resetSeconds };
            if (rateWindow.count > 10) {
                throw new RequestError(429, `Too many requests. Try again in ${resetSeconds} seconds.`, [], resetSeconds);
            }

            const errors = validate(body);
            if (errors.length) throw new RequestError(400, 'Some fields need fixing.', errors);

            const alias = body.alias ? String(body.alias).trim() : null;
            if (alias && links.some((l) => l.code === alias)) {
                throw new RequestError(409, 'Custom alias already in use.');
            }
            let code = alias;
            while (!code || links.some((l) => l.code === code)) {
                code = Array.from({ length: 7 }, () => ALPHABET[Math.floor(rand() * 62)]).join('');
            }
            const link = {
                id: nextId++,
                code,
                original_url: body.link.trim(),
                max_clicks: body.max_clicks ?? null,
                expires_at: body.expires_at ?? null,
                created_at: new Date(now).toISOString(),
                clickTimes: []
            };
            links.push(link);
            return publicLink(link);
        },

        async linkStats(code) {
            const l = find(code);
            const now = Date.now();
            const recent = l.clickTimes.filter((t) => t >= now - 7 * DAY);
            const byDay = new Map();
            for (const t of recent) {
                const d = istDay(new Date(t));
                byDay.set(d, (byDay.get(d) || 0) + 1);
            }
            const days = Math.max(1, Math.ceil((now - new Date(l.created_at).getTime()) / DAY));
            return {
                code: l.code,
                total_clicks: l.clickTimes.length,
                last_7_days: recent.length,
                avg_per_day: Number((l.clickTimes.length / days).toFixed(2)),
                daily: [...byDay].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, clicks]) => ({ day, clicks }))
            };
        },

        async deleteLink(code) {
            const l = find(code);
            links.splice(links.indexOf(l), 1);
            return null;
        }
    };
    return api;
}
