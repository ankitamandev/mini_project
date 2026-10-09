import pg from 'pg';
import { DATABASE_URL } from './config.js';
 
const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
});
 
export function query(text, params) {
    return pool.query(text, params);
}
 
export async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
 
export function poolStats() {
    return {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
    };
}
 
export function closePool() {
    return pool.end();
}