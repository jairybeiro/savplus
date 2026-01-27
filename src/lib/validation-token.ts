import { customAlphabet } from 'nanoid';

// Generate a secure, short validation token
// Format: 10 uppercase alphanumeric characters (e.g., "5D21F2954B")
// Using only uppercase letters and numbers for easy reading/typing
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const nanoid = customAlphabet(alphabet, 10);

export function generateValidationToken(): string {
    return nanoid();
}

// Format token for display (e.g., "5D21-F295-4B")
export function formatTokenForDisplay(token: string): string {
    if (!token || token.length < 8) return token;
    // Split into groups of 4 for readability
    return token.match(/.{1,4}/g)?.join('-') || token;
}
