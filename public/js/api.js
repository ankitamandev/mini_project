// Talks to the Express API. The dashboard is served by the same server, so
// every path is relative ("/links", "/users/me") and no CORS is involved.

export class RequestError extends Error {
    constructor(status, message, details = [], retryAfter = null) {
        super(message);
        this.status = status;
        this.details = details;        // [{ field, message }] from validation errors
        this.retryAfter = retryAfter;  // seconds, on 429
    }
}

// The server's messages are written for developers ("validation failed").
// These say the same thing to a person using the dashboard.
const FRIENDLY = {
    401: 'Your API key was not accepted. Sign in again with a current key.',
    404: 'That link no longer exists. It may have been deleted.',
    500: 'The server hit an error. Check the terminal running it for details.'
};

export function createApi({ getKey, baseUrl = '' }) {
    const api = {
        lastRateLimit: null,

        async request(method, path, body) {
            const headers = { Accept: 'application/json' };
            const key = getKey();
            if (key) headers.Authorization = `Bearer ${key}`;
            if (body !== undefined) headers['Content-Type'] = 'application/json';

            let res;
            try {
                res = await fetch(baseUrl + path, {
                    method,
                    headers,
                    body: body === undefined ? undefined : JSON.stringify(body)
                });
            } catch {
                throw new RequestError(0, 'Could not reach the server. Check that it is running.');
            }

            // RateLimit-* headers come back on POST /links and POST /users.
            const remaining = res.headers.get('RateLimit-Remaining');
            if (remaining !== null) {
                api.lastRateLimit = {
                    limit: Number(res.headers.get('RateLimit-Limit')),
                    remaining: Number(remaining),
                    resetSeconds: Number(res.headers.get('RateLimit-Reset'))
                };
            }

            if (res.status === 204) return null;
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                const retryAfter = Number(res.headers.get('Retry-After')) || null;
                let message = data?.error || `Request failed (${res.status})`;
                if (res.status === 429 && retryAfter) message = `Too many requests. Try again in ${retryAfter} seconds.`;
                else if (res.status === 409 || res.status === 410) message = data?.error ? capitalise(data.error) : message;
                else if (res.status === 400) message = 'Some fields need fixing.';
                else if (FRIENDLY[res.status]) message = FRIENDLY[res.status];
                throw new RequestError(res.status, message, data?.details || [], retryAfter);
            }
            return data;
        },

        signUp: (email) => api.request('POST', '/users', { email }),
        me: () => api.request('GET', '/users/me'),
        rotateKey: () => api.request('POST', '/users/me/api-key'),
        summary: (days) => api.request('GET', `/users/me/stats?days=${days}`),
        listLinks: ({ limit, offset }) => api.request('GET', `/links?limit=${limit}&offset=${offset}`),
        createLink: (body) => api.request('POST', '/links', body),
        linkStats: (code) => api.request('GET', `/links/${encodeURIComponent(code)}/stats`),
        deleteLink: (code) => api.request('DELETE', `/links/${encodeURIComponent(code)}`)
    };
    return api;
}

function capitalise(s) {
    return s.charAt(0).toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? '' : '.');
}
