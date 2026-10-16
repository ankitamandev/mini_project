import express from 'express'
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

// Catch-all /:code 
app.use(redirectRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`listening on ${PORT} in ${NODE_ENV} mode`);
});
