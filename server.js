import express from 'express'
import { PORT, NODE_ENV } from './src/config.js';
import { notFoundHandler, errorHandler, ApiError } from './src/errors.js';
import linksRouter from './src/routes/links.js';
import { query } from './src/db.js';

const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
});

app.use(express.json());

app.get('/health', (req, res) => {
    res.json({status: 'ok', uptime: process.uptime()});
});

app.use('/links', linksRouter);

app.get('/:code', async (req, res) => {
    const result = await query(
        `SELECT original_url FROM links WHERE code = $1`,
        [req.params.code]
    );
    if (result.rows.length === 0) throw new ApiError(404, 'link not found');
    res.redirect(302, result.rows[0].original_url);
});

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`listening on ${PORT} in ${NODE_ENV} mode`);
});