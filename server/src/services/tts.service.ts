import { config } from '../config.js';
import { logger } from '../logger.js';
import { splitSentences } from '../utils/text.js';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const MAX_SEGMENT_CHARS = 4500;

/**
 * Preload the Kokoro model in mlx-audio server.
 * mlx-audio requires models to be loaded via POST /v1/models before use.
 */
export async function preloadKokoroModel(): Promise<void> {
  if (config.tts.provider !== 'kokoro') return;

  try {
    const response = await fetch(
      `${config.kokoro.baseUrl}/v1/models?model_name=${encodeURIComponent(config.kokoro.model)}`,
      { method: 'POST' },
    );
    if (!response.ok) {
      const body = await response.text();
      logger.warn({ event: 'kokoro_preload_failed', status: response.status, body: body.slice(0, 200) });
      return;
    }
    logger.info({ event: 'kokoro_model_loaded', model: config.kokoro.model });
  } catch (err) {
    logger.warn({ event: 'kokoro_preload_failed', error: (err as Error).message });
  }
}

export interface TTSResult {
  filePath: string;
  durationSeconds: number;
}

export async function generateTTS(
  text: string,
  outputPath: string,
): Promise<TTSResult> {
  const start = Date.now();
  const segments = splitIntoSegments(text);

  if (segments.length === 0) {
    throw new Error('No text to generate audio for');
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  if (segments.length === 1) {
    const result = await synthesizeSegment(segments[0], outputPath);
    const duration = Date.now() - start;
    logger.info({
      event: 'tts_generate',
      chars: text.length,
      segments: 1,
      duration_ms: duration,
      provider: result.provider,
    });
    return { filePath: outputPath, durationSeconds: result.durationSeconds };
  }

  const tempDir = outputPath + '.parts';
  await fs.mkdir(tempDir, { recursive: true });

  const partPaths: string[] = [];
  let totalDuration = 0;

  try {
    for (let i = 0; i < segments.length; i++) {
      const partPath = path.join(tempDir, `part-${String(i).padStart(3, '0')}.mp3`);
      const result = await synthesizeSegment(segments[i], partPath);
      partPaths.push(partPath);
      totalDuration += result.durationSeconds;
    }

    await concatenateAudio(partPaths, outputPath);

    const duration = Date.now() - start;
    logger.info({
      event: 'tts_generate',
      chars: text.length,
      segments: segments.length,
      duration_ms: duration,
      total_audio_s: totalDuration,
    });

    return { filePath: outputPath, durationSeconds: totalDuration };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function splitIntoSegments(text: string): string[] {
  const paragraphs = text.split(/\n\n+/);
  const segments: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (trimmed.length > MAX_SEGMENT_CHARS) {
      if (current.trim()) {
        segments.push(current.trim());
        current = '';
      }
      segments.push(...splitBySentenceSegments(trimmed));
      continue;
    }

    if (current.length + trimmed.length + 2 > MAX_SEGMENT_CHARS && current.length > 0) {
      segments.push(current.trim());
      current = trimmed;
    } else {
      current = current ? current + '\n\n' + trimmed : trimmed;
    }
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments;
}

function splitBySentenceSegments(text: string): string[] {
  const sentences = splitSentences(text);
  const segments: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > MAX_SEGMENT_CHARS && current.length > 0) {
      segments.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments;
}

/**
 * Detect whether text is primarily Chinese or English.
 */
function detectLanguage(text: string): 'zh' | 'en' {
  const cjk = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  return cjk / text.length > 0.3 ? 'zh' : 'en';
}

async function synthesizeSegment(
  text: string,
  outputPath: string,
): Promise<{ durationSeconds: number; provider: string }> {
  switch (config.tts.provider) {
    case 'elevenlabs':
      return synthesizeElevenLabs(text, outputPath);
    case 'fishaudio':
      return synthesizeFishAudio(text, outputPath);
    case 'qwen3tts':
      return synthesizeQwen3TTS(text, outputPath);
    case 'kokoro':
      return synthesizeKokoro(text, outputPath);
    default:
      throw new Error(`Unknown TTS provider: ${config.tts.provider}`);
  }
}

async function synthesizeElevenLabs(
  text: string,
  outputPath: string,
): Promise<{ durationSeconds: number; provider: string }> {
  const voiceId = config.elevenlabs.voiceId || 'pMsXgVXv3BLzUgSXRplE';
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': config.elevenlabs.apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: config.elevenlabs.modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    throw new Error(`ElevenLabs rate limited. Retry after ${retryAfter || 'unknown'}s`);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
  const durationSeconds = Math.round(buffer.length / 16000);
  return { durationSeconds, provider: 'elevenlabs' };
}

async function synthesizeFishAudio(
  text: string,
  outputPath: string,
): Promise<{ durationSeconds: number; provider: string }> {
  const response = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.fishaudio.apiKey}`,
    },
    body: JSON.stringify({ text, format: 'mp3' }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Fish Audio API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
  const durationSeconds = Math.round(buffer.length / 16000);
  return { durationSeconds, provider: 'fishaudio' };
}

async function synthesizeQwen3TTS(
  text: string,
  outputPath: string,
): Promise<{ durationSeconds: number; provider: string }> {
  const language = detectLanguage(text);
  const voice = language === 'zh' ? config.qwen3tts.voiceZh : config.qwen3tts.voiceEn;
  const response = await fetch(`${config.qwen3tts.baseUrl}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3-tts',
      input: text,
      voice,
      response_format: 'mp3',
      language,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Qwen3-TTS API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
  const durationSeconds = Math.round(buffer.length / 16000);
  return { durationSeconds, provider: 'qwen3tts' };
}

async function synthesizeKokoro(
  text: string,
  outputPath: string,
): Promise<{ durationSeconds: number; provider: string }> {
  const language = detectLanguage(text);
  const voice = language === 'zh' ? config.kokoro.voiceZh : config.kokoro.voiceEn;
  const langCode = language === 'zh' ? 'z' : 'a';
  const response = await fetch(`${config.kokoro.baseUrl}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.kokoro.model,
      input: text,
      voice,
      lang_code: langCode,
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Kokoro TTS API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
  const durationSeconds = Math.round(buffer.length / 16000);
  return { durationSeconds, provider: 'kokoro' };
}

function concatenateAudio(inputPaths: string[], outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const listContent = inputPaths.map((p) => `file '${p}'`).join('\n');
    const listPath = outputPath + '.list.txt';

    fs.writeFile(listPath, listContent)
      .then(() => {
        const proc = spawn('ffmpeg', [
          '-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath,
        ], { stdio: ['pipe', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

        proc.on('close', (code) => {
          fs.unlink(listPath).catch(() => {});
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg failed (code ${code}): ${stderr.slice(0, 300)}`));
        });

        proc.on('error', (err) => {
          fs.unlink(listPath).catch(() => {});
          reject(new Error(`ffmpeg spawn error: ${err.message}`));
        });
      })
      .catch(reject);
  });
}
