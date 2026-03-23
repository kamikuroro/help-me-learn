import { config } from '../config.js';
import { logger } from '../logger.js';

interface MarkerMetadata {
  total_pages?: number;
  title?: string;
  author?: string;
}

interface MarkerResponse {
  markdown: string;
  metadata: MarkerMetadata;
}

export interface ChapterSegment {
  index: number;
  title: string;
  markdown: string;
}

/**
 * Extract markdown from a PDF file via the on-prem Marker API.
 */
export async function extractMarkdown(
  filePath: string,
  pageRange?: string,
): Promise<MarkerResponse> {
  const start = Date.now();

  const body: Record<string, string> = { file_path: filePath, output_format: 'markdown' };
  if (pageRange) {
    body.page_range = pageRange;
  }

  const response = await fetch(`${config.marker.baseUrl}/api/v1/marker`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.marker.timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Marker API error ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = (await response.json()) as MarkerResponse;
  const duration = Date.now() - start;

  logger.info({
    event: 'marker_extract',
    file_path: filePath,
    page_range: pageRange,
    duration_ms: duration,
    markdown_length: data.markdown?.length ?? 0,
  });

  return data;
}

/**
 * Split extracted markdown into chapters by heading boundaries.
 * Tries H1 first, falls back to H2, then treats entire content as one chapter.
 */
export function splitIntoChapters(markdown: string): ChapterSegment[] {
  // Try H1 boundaries first
  let chapters = splitByHeadingLevel(markdown, 1);
  if (chapters.length > 1) return chapters;

  // Fall back to H2 boundaries
  chapters = splitByHeadingLevel(markdown, 2);
  if (chapters.length > 1) return chapters;

  // Single chapter fallback
  const title = extractFirstHeading(markdown) || 'Untitled Chapter';
  return [{ index: 0, title, markdown }];
}

function splitByHeadingLevel(markdown: string, level: number): ChapterSegment[] {
  const prefix = '#'.repeat(level);
  // Match lines that start with exactly `level` hashes followed by a space
  const pattern = new RegExp(`^${prefix} (?!#)(.+)$`, 'gm');
  const matches: { title: string; startIndex: number }[] = [];

  let match;
  while ((match = pattern.exec(markdown)) !== null) {
    matches.push({ title: match[1].trim(), startIndex: match.index });
  }

  if (matches.length === 0) return [];

  const chapters: ChapterSegment[] = [];

  // Include any content before the first heading as a preamble chapter
  if (matches[0].startIndex > 0) {
    const preamble = markdown.slice(0, matches[0].startIndex).trim();
    if (preamble.length > 100) {
      chapters.push({ index: 0, title: 'Preamble', markdown: preamble });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const startIdx = matches[i].startIndex;
    const endIdx = i + 1 < matches.length ? matches[i + 1].startIndex : markdown.length;
    const content = markdown.slice(startIdx, endIdx).trim();

    chapters.push({
      index: chapters.length,
      title: matches[i].title,
      markdown: content,
    });
  }

  return chapters;
}

function extractFirstHeading(markdown: string): string | null {
  const match = markdown.match(/^#{1,6}\s+(.+)$/m);
  return match ? match[1].trim() : null;
}
