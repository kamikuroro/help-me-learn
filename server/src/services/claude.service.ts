import { spawn } from 'child_process';
import { config } from '../config.js';
import { logger } from '../logger.js';

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

export interface ClaudeOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  outputFormat?: 'text' | 'json';
  timeoutMs?: number;
}

export async function invokeClaude(options: ClaudeOptions): Promise<string> {
  const {
    prompt,
    systemPrompt,
    model = config.claude.model,
    outputFormat = 'text',
    timeoutMs = config.claude.timeoutMs,
  } = options;

  const args = ['-p', '--model', model];
  if (outputFormat === 'json') {
    args.push('--output-format', 'json');
  }
  if (systemPrompt) {
    args.push('--system-prompt', systemPrompt);
  }

  await acquireSemaphore();
  const start = Date.now();

  try {
    const result = await new Promise<string>((resolve, reject) => {
      const child = spawn(config.claude.binaryPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: timeoutMs,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr.slice(0, 500)}`));
        }
      });

      child.on('error', (err) => {
        reject(new Error(`Claude CLI spawn error: ${err.message}`));
      });

      // Pass prompt via stdin to avoid shell arg limits
      child.stdin.write(prompt);
      child.stdin.end();
    });

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
