import fs from 'node:fs/promises';
import path from 'node:path'
import pg from 'pg';

const client = new pg.Client({connectionString: process.env.DATABASE_URL});
await client.connect();

await client.query (`
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version     TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )    
`);

const done = await client.query(`SELECT version FROM schema_migrations`);
const applied = new Set(done.rows.map(r => r.version));

const files = (await fs.readdir('migrations'))
.filter(f => f.endsWith('.sql'))
.sort();

for(const file of files) {
    if(applied.has(file)) {
        console.log(`skip  ${file}`);
        continue;
    }

    const sql = await fs.readFile(path.join('migrations', file), 'utf8');
    try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
            'INSERT INTO schema_migrations (version) VALUES ($1)',
            [file]
        );
        await client.query('COMMIT');
        console.log(`applied ${file}`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`FAILED  ${file}`);
        console.error(err.message);
        process.exit(1);
    }

}
await client.end();
console.log('migrations up to date');
