/**
 * Local vector store backed by SQLite.
 * Stores document chunks and their embedding vectors for offline RAG retrieval.
 *
 * Retrieval is done by cosine similarity between the query's embedding and
 * each stored chunk's embedding. With only a few dozen chunks, comparing
 * against every row is fast enough that no index structure is needed.
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

/** Cosine similarity between two equal-length embedding vectors. */
function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class VectorStore {
  constructor(dbPath) {
    // Ensure data directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this._init();

    // In-memory cache of parsed rows, rebuilt after any mutation
    this._rowCache = null; // Array of { id, doc_id, title, category, content, embedding }
  }

  _init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id TEXT NOT NULL,
        title TEXT,
        category TEXT,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_doc_id ON chunks(doc_id);
    `);

    // Prepare reusable statements
    this._stmtInsert = this.db.prepare(
      "INSERT INTO chunks (doc_id, title, category, chunk_index, content, embedding_json) VALUES (?, ?, ?, ?, ?, ?)"
    );
    this._stmtAll = this.db.prepare("SELECT * FROM chunks");
    this._stmtCount = this.db.prepare("SELECT COUNT(*) as cnt FROM chunks");
    this._stmtListDocs = this.db.prepare(
      "SELECT doc_id, title, category, COUNT(*) as chunks FROM chunks GROUP BY doc_id ORDER BY title"
    );
    this._stmtDeleteDoc = this.db.prepare("DELETE FROM chunks WHERE doc_id = ?");
  }

  /** Invalidate the in-memory row cache (called after any mutation). */
  _invalidateCache() {
    this._rowCache = null;
  }

  /** Build or return the in-memory row cache. */
  _ensureCache() {
    if (this._rowCache) return;

    const rows = this._stmtAll.all();
    this._rowCache = rows.map((row) => ({
      id: row.id,
      doc_id: row.doc_id,
      title: row.title,
      category: row.category,
      content: row.content,
      embedding: JSON.parse(row.embedding_json),
    }));
  }

  /** Remove all existing chunks (for fresh re-ingestion). */
  clear() {
    this.db.exec("DELETE FROM chunks");
    this._invalidateCache();
  }

  /** Insert a single chunk with its precomputed embedding vector. */
  insert(docId, title, category, chunkIndex, content, embedding) {
    this._stmtInsert.run(docId, title, category, chunkIndex, content, JSON.stringify(embedding));
    this._invalidateCache();
  }

  /**
   * Retrieve the top-K most relevant chunks for a precomputed query embedding.
   * @param {number[]} queryEmbedding - embedding vector of the user's question
   * @param {number} topK
   */
  search(queryEmbedding, topK = 5) {
    this._ensureCache();

    const scored = this._rowCache.map((row) => ({
      ...row,
      score: cosineSimilarity(queryEmbedding, row.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /** Remove all chunks for a specific document. */
  removeByDocId(docId) {
    this._stmtDeleteDoc.run(docId);
    this._invalidateCache();
  }

  /** Get total chunk count. */
  count() {
    return this._stmtCount.get().cnt;
  }

  /** List distinct documents in the store. */
  listDocs() {
    return this._stmtListDocs.all();
  }

  close() {
    this.db.close();
  }
}
