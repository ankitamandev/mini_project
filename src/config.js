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
