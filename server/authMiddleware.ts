import { Request, Response, NextFunction } from 'express';
import { getApps, initializeApp, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const clean = (val?: string) => (val ? val.replace(/^["']|["']$/g, '').trim() : val);

/**
 * Initializes and returns the Firebase Admin App instance (singleton).
 */
export function getFirebaseAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const isEmulator = !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const realProjectId = clean(process.env.FIREBASE_PROJECT_ID) ||
                        clean(process.env.GCLOUD_PROJECT) ||
                        clean(process.env.VITE_FIREBASE_PROJECT_ID);

  const selectedProjectId = isEmulator 
    ? (process.env.GCLOUD_PROJECT || 'novo-security-test')
    : realProjectId;

  return initializeApp(selectedProjectId ? { projectId: selectedProjectId } : undefined);
}

// Testing seam for token verification
export type TokenVerifier = (token: string) => Promise<{ uid: string; [key: string]: any }>;
let mockTokenVerifier: TokenVerifier | null = null;

export function setMockTokenVerifier(verifier: TokenVerifier | null) {
  mockTokenVerifier = verifier;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    [key: string]: any;
  };
}

/**
 * Express middleware to enforce Firebase ID token authentication on protected endpoints.
 * Rejects missing, malformed, or invalid tokens with a clean 401 response.
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || typeof authHeader !== 'string') {
    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required. Authorization header missing.',
        retryable: false,
      },
    });
    return;
  }

  const parts = authHeader.trim().split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1].trim()) {
    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Invalid token format. Must be Bearer <token>.',
        retryable: false,
      },
    });
    return;
  }

  const token = parts[1].trim();

  try {
    let decodedUser: { uid: string; [key: string]: any };

    if (mockTokenVerifier) {
      decodedUser = await mockTokenVerifier(token);
    } else {
      getFirebaseAdminApp();
      const decoded = await getAuth().verifyIdToken(token);
      decodedUser = { uid: decoded.uid, email: decoded.email };
    }

    if (!decodedUser || !decodedUser.uid) {
      throw new Error('Token verification did not return a valid uid');
    }

    // Authoritative identity established on server
    req.user = decodedUser;
    next();
  } catch {
    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Invalid or expired authentication token.',
        retryable: false,
      },
    });
  }
}

// In-memory sliding window rate limiter
interface RateLimitRecord {
  timestamps: number[];
}

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
}

let rateLimiterConfig: RateLimiterOptions = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,      // 30 requests per minute
};

const rateLimitStore = new Map<string, RateLimitRecord>();

export function configureRateLimiter(options: Partial<RateLimiterOptions>) {
  rateLimiterConfig = { ...rateLimiterConfig, ...options };
}

export function resetRateLimiter() {
  rateLimitStore.clear();
}

/**
 * Bounded rate limiting middleware for /api/ai/chat.
 * Limits requests per authenticated user (uid) or IP fallback.
 */
export function rateLimiter(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const clientKey = req.user?.uid || req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowStart = now - rateLimiterConfig.windowMs;

  let record = rateLimitStore.get(clientKey);
  if (!record) {
    record = { timestamps: [] };
    rateLimitStore.set(clientKey, record);
  }

  // Filter timestamps within current window
  record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

  const currentCount = record.timestamps.length;
  const remaining = Math.max(0, rateLimiterConfig.maxRequests - currentCount - 1);
  const resetTime = Math.ceil(
    (record.timestamps[0] ? record.timestamps[0] + rateLimiterConfig.windowMs : now + rateLimiterConfig.windowMs) / 1000
  );

  res.setHeader('X-RateLimit-Limit', rateLimiterConfig.maxRequests);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', resetTime);

  if (currentCount >= rateLimiterConfig.maxRequests) {
    const oldestTimestamp = record.timestamps[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((oldestTimestamp + rateLimiterConfig.windowMs - now) / 1000));
    res.setHeader('Retry-After', retryAfterSec);

    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please wait a moment before sending more messages.',
        messageAr: 'تم تجاوز حد الطلبات المسموح به. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.',
        retryable: true,
      },
    });
    return;
  }

  record.timestamps.push(now);
  next();
}
