import crypto from 'crypto';

const BASE62_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function generateShortCode(length = 5) {
    let shortCode = "";
    // Fetch secure random bytes
    const randomBytes = crypto.randomBytes(length);
  
    for (let i = 0; i < length; i++) {
        // Map each byte (0-255) to a character in our 62-character alphabet
        shortCode += BASE62_ALPHABET[randomBytes[i] % 62];
    }
  
  return shortCode;
}