import { invokeClaude } from './claude.service.js';
import { logger } from '../logger.js';

const VERBATIM_SYSTEM_PROMPT = `You are a professional audiobook narrator preparing a spoken-word script from technical content.

Rules:
- Read all prose content verbatim — do not summarize or skip paragraphs.
- For code blocks: say "Here we have a code example" then describe what the code does conversationally. Mention the language, key function names, and the purpose. Do NOT read code syntax aloud.
- For tables: describe the table structure and highlight the key data points conversationally. For example: "The table compares three algorithms across latency, throughput, and memory usage. Algorithm A leads in throughput at 10,000 ops per second..."
- For images/diagrams: if alt text or a caption exists, describe it. Otherwise say "The text includes a diagram illustrating [topic]" and continue.
- For mathematical equations: read them in natural language. For example, "E equals m c squared" or "the sum from i equals 1 to n of x sub i."
- Preserve the chapter structure: announce section headings naturally.
- Do NOT add opinions, commentary, or filler beyond what the text contains.
- Wrap every paragraph of output in [NARRATOR]: tags, one tag per logical spoken segment.
- Match the language of the source material. If the source is Chinese, narrate in Chinese.
- Output ONLY the tagged script. No preamble, no explanation.`;

const CONVERSATIONAL_SYSTEM_PROMPT = `You are writing a podcast script for two hosts discussing a book chapter.
HOST_A is the explainer — they have read the chapter thoroughly and present ALL content.
HOST_B is the curious learner — they ask clarifying questions, request examples, and react naturally.

Rules:
- Cover EVERY concept, argument, and example from the chapter. This is comprehensive coverage, not a summary.
- HOST_A explains each section. HOST_B asks follow-up questions that a reader might have.
- For code blocks: HOST_A describes what the code does, HOST_B might ask "what would happen if we changed X?" or "why did the author choose this approach?"
- For tables: HOST_A walks through the key comparisons, HOST_B highlights surprising findings.
- For images/diagrams: HOST_A describes what the diagram shows and why it matters.
- For equations: HOST_A reads them naturally and explains the intuition behind them.
- Keep the tone conversational but substantive — like a graduate-level study session between friends.
- Each speaker turn is one tag: [HOST_A]: or [HOST_B]:
- Aim for roughly 70% HOST_A, 30% HOST_B by word count.
- Match the language of the source material. If the source is Chinese, the entire podcast should be in Chinese.
- Do NOT skip content. If a section is dense, take more turns to cover it fully.
- Output ONLY the tagged script. No preamble, no explanation.`;

/**
 * Generate a verbatim narration script for a book chapter.
 */
export async function generateVerbatimScript(
  chapterMarkdown: string,
  chapterTitle: string,
  bookTitle: string,
  language: string,
): Promise<string> {
  const start = Date.now();

  const prompt = `Book: ${bookTitle}
Chapter: ${chapterTitle}
Language: ${language}

---

${chapterMarkdown}`;

  const script = await invokeClaude({
    prompt,
    systemPrompt: VERBATIM_SYSTEM_PROMPT,
  });

  const duration = Date.now() - start;
  logger.info({
    event: 'script_generate',
    mode: 'verbatim',
    book_title: bookTitle,
    chapter_title: chapterTitle,
    input_chars: chapterMarkdown.length,
    output_chars: script.length,
    duration_ms: duration,
  });

  return script;
}

/**
 * Generate a two-host conversational script for a book chapter.
 */
export async function generateConversationalScript(
  chapterMarkdown: string,
  chapterTitle: string,
  bookTitle: string,
  language: string,
): Promise<string> {
  const start = Date.now();

  const prompt = `Book: ${bookTitle}
Chapter: ${chapterTitle}
Language: ${language}

---

${chapterMarkdown}`;

  const script = await invokeClaude({
    prompt,
    systemPrompt: CONVERSATIONAL_SYSTEM_PROMPT,
  });

  const duration = Date.now() - start;
  logger.info({
    event: 'script_generate',
    mode: 'conversational',
    book_title: bookTitle,
    chapter_title: chapterTitle,
    input_chars: chapterMarkdown.length,
    output_chars: script.length,
    duration_ms: duration,
  });

  return script;
}
