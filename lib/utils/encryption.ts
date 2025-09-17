import * as crypto from 'crypto';
import * as CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
const ALGORITHM = 'aes-256-gcm';

export interface EncryptedData {
  encryptedData: string;
  iv: string;
  authTag: string;
}

/**
 * Encrypts sensitive data using AES-256-GCM
 */
export function encryptData(data: string): EncryptedData {
  if (!ENCRYPTION_KEY) {
    throw new Error('Encryption key not configured');
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);

  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * Decrypts data encrypted with encryptData
 */
export function decryptData(encryptedObj: EncryptedData): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('Encryption key not configured');
  }

  try {
    const iv = Buffer.from(encryptedObj.iv, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    decipher.setAuthTag(Buffer.from(encryptedObj.authTag, 'hex'));

    let decrypted = decipher.update(encryptedObj.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (_error) {
    throw new Error('Failed to decrypt data: Invalid key or corrupted data');
  }
}

/**
 * Encrypts token data for storage
 */
export function encryptToken(token: string): string {
  if (!token) return '';

  try {
    const encrypted = CryptoJS.AES.encrypt(token, ENCRYPTION_KEY).toString();
    return encrypted;
  } catch (_error) {
    throw new Error('Failed to encrypt token');
  }
}

/**
 * Decrypts token data from storage
 */
export function decryptToken(encryptedToken: string): string {
  if (!encryptedToken) return '';

  try {
    const bytes = CryptoJS.AES.decrypt(encryptedToken, ENCRYPTION_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);

    if (!decrypted) {
      throw new Error('Invalid encrypted token');
    }

    return decrypted;
  } catch (_error) {
    throw new Error('Failed to decrypt token');
  }
}

/**
 * Generates a cryptographically secure random string
 */
export function generateSecureRandom(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generates a state parameter for OAuth flow
 */
export function generateStateParameter(): string {
  return generateSecureRandom(16);
}

/**
 * Generates a CSRF token
 */
export function generateCSRFToken(): string {
  return generateSecureRandom(16);
}

/**
 * Creates a hash of sensitive data for comparison
 */
export function createHash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Verifies a hash against original data
 */
export function verifyHash(data: string, hash: string): boolean {
  const dataHash = createHash(data);
  return crypto.timingSafeEqual(Buffer.from(dataHash), Buffer.from(hash));
}

/**
 * Securely compares two strings to prevent timing attacks
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}