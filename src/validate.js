export const RESERVED_ALIASES = new Set(['health', 'links', 'users', 'api', 'admin', 'static', 'docs']);

// Only characters that are safe in a URL path segment. "/" would split the path
// (so /:code never matches), "?" and "#" would be read as query/fragment.
const ALIAS_PATTERN = /^[A-Za-z0-9_-]+$/;
const ALIAS_MIN = 3;
const ALIAS_MAX = 30;

// A time without an offset ("2026-12-31T10:00") means different moments on
// different servers, so the timezone (Z or +05:30) is required.
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

// Largest value a Postgres `integer` column can hold.
const PG_INT_MAX = 2_147_483_647;

// Deliberately loose: something@something.something. Real verification would
// mean sending a confirmation mail, which is out of scope here.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLinks(body) {
    const errors = [];
    if (body === undefined || body === null || typeof body !== 'object') {
        return [{ field: '_body', message: 'a JSON body is required' }];
    }

    const link = body.link;
    if (link === undefined) {
        errors.push({ field: 'link', message: 'link is required' });
    } else if (typeof link !== 'string') {
        errors.push({ field: 'link', message: 'link must be a string' });
    } else if (link.trim().length === 0) {
        errors.push({ field: 'link', message: 'link field cannot be empty' });
    } else if (link.trim().length > 2048) {
        errors.push({ field: 'link', message: 'link must be 2048 characters or fewer' });
    } else if (!checkHttp(link.trim())) {
        errors.push({ field: 'link', message: 'link must be a valid http or https URL' });
    }

    const alias = body.alias;
    if (alias !== undefined && alias !== null) {
        if (typeof alias !== 'string') {
            errors.push({ field: 'alias', message: 'alias must be a string' });
        } else {
            const a = alias.trim();
            if (a.length < ALIAS_MIN || a.length > ALIAS_MAX) {
                errors.push({ field: 'alias', message: `alias must be ${ALIAS_MIN}-${ALIAS_MAX} characters` });
            } else if (!ALIAS_PATTERN.test(a)) {
                errors.push({ field: 'alias', message: 'alias may only contain letters, digits, "-" and "_"' });
            } else if (RESERVED_ALIASES.has(a.toLowerCase())) {
                errors.push({ field: 'alias', message: `"${a}" is reserved` });
            }
        }
    }

    const expiresAt = body.expires_at;
    if (expiresAt !== undefined && expiresAt !== null) {
        if (typeof expiresAt !== 'string' || !ISO_WITH_OFFSET.test(expiresAt)) {
            errors.push({
                field: 'expires_at',
                message: 'expires_at must be an ISO 8601 date-time with a timezone, e.g. 2026-12-31T23:59:59+05:30'
            });
        } else {
            const date = new Date(expiresAt);
            if (Number.isNaN(date.getTime())) {
                errors.push({ field: 'expires_at', message: 'expires_at is not a real date' });
            } else if (date <= new Date()) {
                errors.push({ field: 'expires_at', message: 'expires_at must be in the future' });
            }
        }
    }

    const maxClicks = body.max_clicks;
    if (maxClicks !== undefined && maxClicks !== null) {
        if (!Number.isInteger(maxClicks) || maxClicks < 1 || maxClicks > PG_INT_MAX) {
            errors.push({ field: 'max_clicks', message: `max_clicks must be a whole number from 1 to ${PG_INT_MAX}` });
        }
    }

    return errors;
}

export function validateUser(body) {
    if (body === undefined || body === null || typeof body !== 'object') {
        return [{ field: '_body', message: 'a JSON body is required' }];
    }
    const email = body.email;
    if (typeof email !== 'string' || email.trim().length === 0) {
        return [{ field: 'email', message: 'email is required' }];
    }
    if (email.trim().length > 254 || !EMAIL_PATTERN.test(email.trim())) {
        return [{ field: 'email', message: 'email must be a valid address' }];
    }
    return [];
}

// ?limit=20&offset=40 -> { limit: 20, offset: 40 }, or null if invalid.
export function parsePagination(q) {
    const limit = q.limit === undefined ? 20 : Number(q.limit);
    const offset = q.offset === undefined ? 0 : Number(q.offset);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return null;
    if (!Number.isInteger(offset) || offset < 0) return null;
    return { limit, offset };
}

function checkHttp(reqUrl) {
    try {
        const url = new URL(reqUrl);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}
