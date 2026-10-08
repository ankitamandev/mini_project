import express from 'express'

const PORT = 3000;

const app = express();
app.use(express.json());
app.disable('x-powered-by');

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
});

app.get('/health', (req, res) => {
    res.json({status: 'ok', uptime: process.uptime()});
});

app.listen( PORT, () => {
    console.log(`server listening on Port: ${PORT}`);
});