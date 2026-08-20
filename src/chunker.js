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

// Common English function words – excluded so they don't dilute similarity
// scores with noise shared by virtually every query and every document.
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "to", "of", "on", "in", "at", "by", "for", "with", "without", "from",
  "into", "over", "under", "about", "as", "so", "than", "then",
  "this", "that", "these", "those", "it", "its", "i", "you", "he", "she",
  "we", "they", "my", "your", "his", "her", "our", "their",
  "and", "or", "but", "if", "not", "no", "nor",
  "what", "which", "who", "whom", "how", "why", "when", "where",
  "do", "does", "did", "doing", "can", "could", "will", "would",
  "should", "may", "might", "must", "shall", "have", "has", "had",
]);

/**
 * Build simple term-frequency vector for a chunk of text.
 * Returns a Map<term, frequency>.
 */
export function termFrequency(text) {
  const tf = new Map();
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9₂\-']/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }
  return tf;
}

/**
 * Compute cosine similarity between two term-frequency maps.
 */
export function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [term, freq] of a) {
    normA += freq * freq;
    if (b.has(term)) dot += freq * b.get(term);
  }
  for (const [, freq] of b) normB += freq * freq;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
