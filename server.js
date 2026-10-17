import express from 'express'
import { fileURLToPath } from 'node:url';
import { PORT, NODE_ENV } from './src/config.js';
import { notFoundHandler, errorHandler } from './src/errors.js';
import linksRouter from './src/routes/links.js';
import usersRouter from './src/routes/users.js';
import redirectRouter from './src/routes/redirect.js';

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

app.use('/users', usersRouter);
app.use('/links', linksRouter);

// The dashboard: public/index.html at "/", plus its CSS and JS. Served from the
// same origin as the API, so the browser needs no CORS setup. Every file name
// has a "." and aliases can't, so a short code can never collide with a file.
app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));

// Catch-all /:code — keep it after every named route above.
app.use(redirectRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`listening on ${PORT} in ${NODE_ENV} mode`);
});
