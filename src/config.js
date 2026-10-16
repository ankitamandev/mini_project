function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        console.error(`FATAL: missing required environment variable: ${name}`);
        process.exit(1);
    }
    return value;
}

export const PORT = Number(process.env.PORT) || 3000;
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const DATABASE_URL = requireEnv('DATABASE_URL');

// Short URLs are built as `${BASE_URL}/${code}`. Trailing slash is stripped so
// "http://localhost:3000/" doesn't produce "http://localhost:3000//abc".
export const BASE_URL = requireEnv('BASE_URL').replace(/\/+$/, '');

// Rate limits (optional, sensible defaults).
export const LINKS_PER_MINUTE = Number(process.env.LINKS_PER_MINUTE) || 10;
export const SIGNUPS_PER_HOUR = Number(process.env.SIGNUPS_PER_HOUR) || 5;
