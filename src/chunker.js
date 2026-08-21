/**
 * Document chunking utility.
 * Splits markdown documents into overlapping chunks suitable for RAG retrieval.
 */

/**
 * Parse front-matter (YAML-like) from a markdown document.
 */
export function parseFrontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: text };

  const meta = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return { meta, body: match[2] };
}

/**
 * Split text into chunks of approximately `maxTokens` tokens
 * with `overlapTokens` overlap between consecutive chunks.
 * Uses whitespace-based token approximation (good enough for local RAG).
 */
export function chunkText(text, maxTokens = 400, overlapTokens = 50) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxTokens) return [text];

  const chunks = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + maxTokens, words.length);
    chunks.push(words.slice(start, end).join(" "));
    if (end >= words.length) break;
    start = end - overlapTokens;
  }
  return chunks;
}
