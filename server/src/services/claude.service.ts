import { spawn } from 'child_process';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { withRetry } from '../utils/retry.js';

// Semaphore to limit concurrent Claude invocations
let activeCount = 0;
const MAX_CONCURRENT = 1;
const waitQueue: (() => void)[] = [];

async function acquireSemaphore(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++;
    return;
  }
  return new Promise((resolve) => {
    waitQueue.push(() => {
      activeCount++;
      resolve();
    });
  });
}

function releaseSemaphore(): void {
  activeCount--;
  const next = waitQueue.shift();
  if (next) next();
}

function spawnClaude(args: string[], prompt: string, timeoutMs: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(config.claude.binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });

    // SIGKILL fallback if SIGTERM (from spawn timeout) doesn't kill the process
    const killTimer = setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
        logger.warn({ event: 'claude_sigkill' }, 'Claude process did not respond to SIGTERM, sent SIGKILL');
      }
    }, timeoutMs + 5000);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(killTimer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr.slice(0, 500)}`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(killTimer);
      reject(new Error(`Claude CLI spawn error: ${err.message}`));
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

export interface ClaudeOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  outputFormat?: 'text' | 'json';
  timeoutMs?: number;
  /** UUID for a new session (first message). Mutually exclusive with resumeSessionId. */
  sessionId?: string;
  /** UUID of an existing session to resume (subsequent messages). */
  resumeSessionId?: string;
}

export async function invokeClaude(options: ClaudeOptions): Promise<string> {
  const {
    prompt,
    systemPrompt,
    model = config.claude.model,
    outputFormat = 'text',
    timeoutMs = config.claude.timeoutMs,
    sessionId,
    resumeSessionId,
  } = options;

  const args = ['-p', '--model', model];
  if (outputFormat === 'json') {
    args.push('--output-format', 'json');
  }
  if (systemPrompt) {
    args.push('--system-prompt', systemPrompt);
  }
  if (resumeSessionId) {
    args.push('-r', resumeSessionId);
  } else if (sessionId) {
    args.push('--session-id', sessionId);
  }

  await acquireSemaphore();
  const start = Date.now();

  try {
    const result = await withRetry(
      () => spawnClaude(args, prompt, timeoutMs),
      { maxAttempts: 3, baseDelayMs: 5000, label: 'claude_cli' },
    );

    const duration = Date.now() - start;
    logger.info({
      event: 'claude_invoke',
      purpose: systemPrompt?.slice(0, 50) || 'general',
      input_chars: prompt.length,
      output_chars: result.length,
      duration_ms: duration,
    });

    return result;
  } finally {
    releaseSemaphore();
  }
}

/**
 * Invoke Claude and parse JSON response.
 */
export async function invokeClaudeJson<T>(options: Omit<ClaudeOptions, 'outputFormat'>): Promise<T> {
  const raw = await invokeClaude({ ...options, outputFormat: 'text' });

  // Extract JSON from the response — Claude may wrap it in markdown code blocks
  let jsonStr = raw;
  const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    return JSON.parse(jsonStr.trim());
  } catch (err) {
    logger.error({ raw: raw.slice(0, 500) }, 'Failed to parse Claude JSON response');
    throw new Error(`Failed to parse Claude JSON response: ${(err as Error).message}`);
  }
}
