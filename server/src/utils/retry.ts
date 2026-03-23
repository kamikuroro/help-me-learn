import { logger } from '../logger.js';

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  label?: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs = 60_000, label = 'operation' } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        logger.error({ err: error, attempt, label }, `${label} failed after ${maxAttempts} attempts`);
        throw error;
      }

      const rawDelay = Math.min(baseDelayMs * Math.pow(4, attempt - 1), maxDelayMs);
      const delay = Math.round(rawDelay * (0.5 + Math.random())); // jitter: 0.5x–1.5x
      logger.warn({ err: error, attempt, label, retryInMs: delay }, `${label} failed, retrying`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unreachable');
}
