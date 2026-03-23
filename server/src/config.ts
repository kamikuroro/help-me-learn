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
  qwen3tts: {
    baseUrl: optional('QWEN3_TTS_BASE_URL', 'http://localhost:8880'),
    voice: optional('QWEN3_TTS_VOICE', 'demo_speaker0'),
  },
  tts: {
    provider: optional('TTS_PROVIDER', 'elevenlabs') as 'elevenlabs' | 'fishaudio' | 'qwen3tts',
  },
  claude: {
    binaryPath: optional('CLAUDE_PATH', 'claude'),
    model: optional('CLAUDE_MODEL', 'opus'),
    timeoutMs: optionalInt('CLAUDE_TIMEOUT_MS', 1_200_000),
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

// Validate TTS provider has required credentials
if (config.tts.provider === 'elevenlabs' && !config.elevenlabs.apiKey) {
  throw new Error('TTS_PROVIDER is elevenlabs but ELEVENLABS_API_KEY is not set');
}
if (config.tts.provider === 'fishaudio' && !config.fishaudio.apiKey) {
  throw new Error('TTS_PROVIDER is fishaudio but FISH_AUDIO_API_KEY is not set');
}
