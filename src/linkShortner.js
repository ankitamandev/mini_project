import crypto from 'crypto';

const BASE62_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function generateShortCode(length = 7) {
    let shortCode = "";
    for (let i = 0; i < length; i++) {
        shortCode += BASE62_ALPHABET[crypto.randomInt(BASE62_ALPHABET.length)];
    }
    return shortCode;
}
