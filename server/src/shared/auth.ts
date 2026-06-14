import crypto from 'node:crypto';

// Use a fallback secret key if JWT_SECRET environment variable is not defined
const JWT_SECRET = process.env.JWT_SECRET || 'diary-secret-key-9876543210-abcdef';

/**
 * Hash password using PBKDF2 with a random salt
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify password against stored PBKDF2 hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;
    const [salt, hash] = parts;
    const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

interface TokenPayload {
  userId: string;
  username: string;
}

/**
 * Generate a cryptographically signed JWT-like token (Header.Payload.Signature)
 */
export function signToken(payload: TokenPayload, expiresInDays = 7): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + expiresInDays * 24 * 60 * 60;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

/**
 * Verify JWT-like token and return decoded payload, or null if invalid or expired
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    
    // Verify HMAC signature
    const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (signature !== expectedSignature) return null;

    // Decode and parse payload
    const payloadJson = Buffer.from(body, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);

    // Verify expiration time
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return null;
    }

    return {
      userId: payload.userId,
      username: payload.username,
    };
  } catch (error) {
    return null;
  }
}
