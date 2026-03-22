import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function optionalInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

export const config = {
  server: {
    port: optionalInt('PORT', 3741),
    host: optional('HOST', '0.0.0.0'),
  },
  db: {
    connectionString: required('DB9_CONNECTION_STRING'),
    poolMax: optionalInt('DB_POOL_MAX', 10),
  },
  jina: {
    apiKey: process.env.JINA_API_KEY || '',
    baseUrl: 'https://r.jina.ai',
    timeoutMs: 60_000,
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    voiceId: optional('ELEVENLABS_VOICE_ID', ''),
    modelId: optional('ELEVENLABS_MODEL_ID', 'eleven_multilingual_v2'),
  },
  fishaudio: {
    apiKey: process.env.FISH_AUDIO_API_KEY || '',
  },
  claude: {
    binaryPath: optional('CLAUDE_PATH', 'claude'),
    model: optional('CLAUDE_MODEL', 'opus'),
    timeoutMs: optionalInt('CLAUDE_TIMEOUT_MS', 120_000),
  },
  auth: {
    token: required('API_TOKEN'),
  },
  audio: {
    dir: path.resolve(__dirname, '..', optional('AUDIO_DIR', '../audio')),
  },
  log: {
    level: optional('LOG_LEVEL', 'info'),
  },
} as const;
