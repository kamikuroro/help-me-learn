import { config } from '../config.js';
import { logger } from '../logger.js';
import { spawn } from 'child_process';

interface MarkerMetadata {
  total_pages?: number;
  title?: string;
  author?: string;
}

interface PdfExtractResult {
  markdown: string;
  metadata: MarkerMetadata;
  provider: 'marker' | 'pymupdf4llm';
}

export interface ChapterSegment {
  index: number;
  title: string;
  markdown: string;
}

/**
 * Extract markdown from a PDF. Tries Marker API first, falls back to local pymupdf4llm.
 */
export async function extractMarkdown(
  filePath: string,
  pageRange?: string,
): Promise<PdfExtractResult> {
  try {
    return await extractWithMarker(filePath, pageRange);
  } catch (err) {
    logger.warn({
      event: 'marker_unavailable',
      error: (err as Error).message,
      fallback: 'pymupdf4llm',
    });
    return await extractWithPymupdf4llm(filePath, pageRange);
  }
}

/**
 * Extract via on-prem Marker API.
 */
async function extractWithMarker(
  filePath: string,
  pageRange?: string,
): Promise<PdfExtractResult> {
  const start = Date.now();

  const body: Record<string, string | boolean> = { filepath: filePath, output_format: 'markdown' };
  if (pageRange) {
    body.page_range = pageRange;
  }

  const response = await fetch(`${config.marker.baseUrl}/marker`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.marker.timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Marker API error ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = (await response.json()) as { markdown: string; metadata: MarkerMetadata };

  if (!data.markdown) {
    throw new Error('Marker returned empty markdown');
  }

  const duration = Date.now() - start;

  logger.info({
    event: 'pdf_extract',
    provider: 'marker',
    file_path: filePath,
    page_range: pageRange,
    duration_ms: duration,
    markdown_length: data.markdown?.length ?? 0,
  });

  return { markdown: data.markdown, metadata: data.metadata, provider: 'marker' };
}

/**
 * Extract via local pymupdf4llm (fallback when Marker is unavailable).
 * Spawns a Python process — pymupdf4llm must be pip-installed.
 */
async function extractWithPymupdf4llm(
  filePath: string,
  pageRange?: string,
): Promise<PdfExtractResult> {
  const start = Date.now();

  // Build a Python script that converts PDF to markdown and outputs JSON
  const pagesArg = pageRange ? parsePagesArg(pageRange) : 'None';
  const fileLiteral = JSON.stringify(filePath);
  // Python script — must not have leading indentation
  const script = [
    'import pymupdf4llm, pymupdf, json, sys',
    'try:',
    `    pages = ${pagesArg}`,
    `    md = pymupdf4llm.to_markdown(${fileLiteral}, pages=pages)`,
    `    doc = pymupdf.open(${fileLiteral})`,
    '    meta = doc.metadata or {}',
    '    result = {"markdown": md, "metadata": {"total_pages": len(doc), "title": meta.get("title", ""), "author": meta.get("author", "")}}',
    '    json.dump(result, sys.stdout, ensure_ascii=False)',
    'except Exception as e:',
    '    json.dump({"error": str(e)}, sys.stderr)',
    '    sys.exit(1)',
  ].join('\n');

  const result = await spawnPython(script, config.marker.timeoutMs);
  const data = JSON.parse(result) as { markdown: string; metadata: MarkerMetadata };

  const duration = Date.now() - start;
  logger.info({
    event: 'pdf_extract',
    provider: 'pymupdf4llm',
    file_path: filePath,
    page_range: pageRange,
    duration_ms: duration,
    markdown_length: data.markdown?.length ?? 0,
  });

  return { markdown: data.markdown, metadata: data.metadata, provider: 'pymupdf4llm' };
}

/**
 * Convert a page range string like "1-30" or "5,10-15" into a Python list expression.
 * pymupdf4llm uses 0-based page indices.
 */
function parsePagesArg(pageRange: string): string {
  const pages: number[] = [];
  for (const part of pageRange.split(',')) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const s = parseInt(startStr, 10);
      const e = parseInt(endStr, 10);
      if (!isNaN(s) && !isNaN(e)) {
        for (let i = s; i <= e; i++) {
          pages.push(i - 1); // convert to 0-based
        }
      }
    } else {
      const n = parseInt(trimmed, 10);
      if (!isNaN(n)) pages.push(n - 1);
    }
  }
  return `[${pages.join(',')}]`;
}

function spawnPython(script: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', ['-c', script], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`pymupdf4llm failed (code ${code}): ${stderr.slice(0, 500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn python3: ${err.message}`));
    });
  });
}

/**
 * Extract table of contents from a PDF using pymupdf.
 */
export async function extractTOC(filePath: string): Promise<{
  totalPages: number;
  title: string;
  author: string;
  chapters: Array<{ level: number; title: string; pageStart: number; pageEnd: number }>;
}> {
  const fileLiteral = JSON.stringify(filePath);
  const script = [
    'import sys, json, pymupdf',
    `doc = pymupdf.open(${fileLiteral})`,
    'toc = doc.get_toc()',
    'meta = doc.metadata or {}',
    'result = {',
    '    "total_pages": len(doc),',
    '    "title": meta.get("title", ""),',
    '    "author": meta.get("author", ""),',
    '    "chapters": []',
    '}',
    'for i, entry in enumerate(toc):',
    '    level, title, page = entry',
    '    page_end = toc[i+1][2] - 1 if i + 1 < len(toc) else len(doc)',
    '    result["chapters"].append({',
    '        "level": level,',
    '        "title": title,',
    '        "pageStart": page,',
    '        "pageEnd": page_end',
    '    })',
    'doc.close()',
    'print(json.dumps(result))',
  ].join('\n');

  const output = await spawnPython(script, config.marker.timeoutMs);
  const data = JSON.parse(output) as {
    total_pages: number;
    title: string;
    author: string;
    chapters: Array<{ level: number; title: string; pageStart: number; pageEnd: number }>;
  };

  logger.info({
    event: 'pdf_toc_extracted',
    file_path: filePath,
    total_pages: data.total_pages,
    chapters: data.chapters.length,
  });

  return {
    totalPages: data.total_pages,
    title: data.title,
    author: data.author,
    chapters: data.chapters,
  };
}

/**
 * Extract markdown for a specific page range from a PDF.
 */
export async function extractPageRange(
  filePath: string,
  pageStart: number,
  pageEnd: number,
): Promise<PdfExtractResult> {
  return extractMarkdown(filePath, `${pageStart}-${pageEnd}`);
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
