export function validateLinks(body) {
    const errors = [];
    if (body === undefined || body === null || typeof body !== 'object') {
        return [{ field: '_body', message: 'a JSON body is required' }];
    }
    const link = body.link;
    if (link === undefined) {
        errors.push({ field: 'link', message: 'link is required' });
    } else if (typeof link !== 'string') {
        errors.push({ field: 'link', message: 'link must be a string' });
    } else if (link.trim().length === 0) {
        errors.push({ field: 'link', message: 'link field cannot be empty' });
    } else if (link.trim().length > 2048) {
        errors.push({ field: 'link', message: '2048 characters or fewer' });
    } else if (!checkHttp(link.trim())) {
        errors.push({field: 'link', message : "link must have http or https"});
    }
    return errors;
}

function checkHttp(reqUrl) {
    try {
        const url = new URL(reqUrl);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}
 
export function parseId(raw) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id < 1) return null;
    return id;
}
 
export const badId = [{ field: 'id', message: 'id must be a positive integer' }];
