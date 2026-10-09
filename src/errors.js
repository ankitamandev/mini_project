export class ApiError extends Error {
    constructor(status, message, details) {
        super(message);
        this.status = status;
        this.details = details;
    }
}
 
const PG_ERROR_MAP = {
    '23505': { status: 409, message: 'already exists' },
    '23503': { status: 409, message: 'referenced record does not exist' },
    '23502': { status: 400, message: 'required field missing' },
    '23514': { status: 400, message: 'value failed a validation rule' },
    '22P02': { status: 400, message: 'invalid value format' }
};
 
function toApiError(err) {
    const mapped = PG_ERROR_MAP[err.code];
    if (!mapped) return err;
    return new ApiError(mapped.status, mapped.message, [{ constraint: err.constraint }]);
}
 
export function notFoundHandler(req, res, next) {
    next(new ApiError(404, 'route not found'));
}
 
export function errorHandler(err, req, res, next) {
    err = toApiError(err);
    console.error(err);
    const status = err.status || err.statusCode || 500;
    const body = { error: err.message || 'internal server error' };
    if (err.details) body.details = err.details;
    if (status >= 500) {
        body.error = 'internal server error';
        delete body.details;
    }
    res.status(status).json(body);
}
