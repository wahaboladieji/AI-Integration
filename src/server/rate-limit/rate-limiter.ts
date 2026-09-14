import { AI_CONFIG } from '@/server/config/ai.config';

/**
 * Shared Rate Limiter Implementation
 * 
 * Implements rate-limiting-implementation/SKILL.md:
 * - Shared rate limiter imported by /api/upload and /api/jobs/[id]/followup
 * - Reads window and maxRequests directly from ai.config.ts
 * - Keyed by user identifier or client IP
 * - Returns 429 signal with Retry-After header
 */

interface RateLimitRecord {
  count: number;
  resetTimeMs: number;
}

// In-memory token bucket store for local development
const rateLimitStore = new Map<string, RateLimitRecord>();

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  identifier: string,
  config: { windowMs: number; maxRequests: number }
): RateLimitResult {
  const now = Date.now();
  const key = `ratelimit:${identifier}`;
  const record = rateLimitStore.get(key);

  if (!record || now >= record.resetTimeMs) {
    // Window expired or new request
    const resetTimeMs = now + config.windowMs;
    rateLimitStore.set(key, { count: 1, resetTimeMs });

    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
      retryAfterSeconds: Math.ceil(config.windowMs / 1000),
    };
  }

  if (record.count >= config.maxRequests) {
    // Threshold exceeded
    const retryAfterSeconds = Math.ceil((record.resetTimeMs - now) / 1000);
    return {
      allowed: false,
      limit: config.maxRequests,
      remaining: 0,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }

  // Increment count within window
  record.count += 1;
  rateLimitStore.set(key, record);

  return {
    allowed: true,
    limit: config.maxRequests,
    remaining: config.maxRequests - record.count,
    retryAfterSeconds: Math.ceil((record.resetTimeMs - now) / 1000),
  };
}

/**
 * Helper to extract client identifier from Request headers
 */
export function getClientIdentifier(request: Request, userId?: string): string {
  if (userId) return `user_${userId}`;
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'anonymous_client';
}
