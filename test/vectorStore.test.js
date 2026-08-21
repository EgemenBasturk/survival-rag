import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { VectorStore } from "../src/vectorStore.js";

// Hand-crafted embedding vectors instead of a real model: keeps this a fast,
// model-independent unit test of the storage/scoring layer. Vectors sharing
// a dominant dimension are "similar" (high cosine score); orthogonal ones
// are "unrelated" (score ~0) — the exact relationship a real embedding
// model provides, just without needing to load one.
const GAS_LEAK = [1, 0, 0, 0];
const GAS_LEAK_NEAR = [0.9, 0.1, 0, 0];
const GAS_LEAK_NEAR2 = [0.8, 0.2, 0, 0];
const VALVE = [0, 1, 0, 0];
const VALVE_NEAR = [0, 0.9, 0.1, 0];
const UNRELATED_QUERY = [0, 0, 0, 1]; // orthogonal to every stored vector above

let store;
const tmpDir = path.join(os.tmpdir(), `rag-test-${Date.now()}`);
const dbPath = path.join(tmpDir, "test.db");

before(() => {
  store = new VectorStore(dbPath);
});

after(() => {
  store.close();
  // Clean up temp DB
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* ignore */ }
});

describe("VectorStore", () => {
  it("starts with zero chunks", () => {
    assert.equal(store.count(), 0);
  });

  it("inserts a chunk and increments count", () => {
    store.insert("DOC-001", "Gas Leak Detection", "Inspection", 0, "Check for gas leaks using a portable detector.", GAS_LEAK);
    assert.equal(store.count(), 1);
  });

  it("inserts multiple chunks for the same document", () => {
    store.insert("DOC-001", "Gas Leak Detection", "Inspection", 1, "Apply soapy water to joints and observe bubbles.", GAS_LEAK_NEAR);
    store.insert("DOC-001", "Gas Leak Detection", "Inspection", 2, "Record findings in the inspection log.", GAS_LEAK_NEAR2);
    assert.equal(store.count(), 3);
  });

  it("inserts chunks for a different document", () => {
    store.insert("DOC-002", "Valve Types", "Equipment", 0, "Gate valves control flow by raising or lowering a gate.", VALVE);
    store.insert("DOC-002", "Valve Types", "Equipment", 1, "Ball valves use a rotating ball to control flow.", VALVE_NEAR);
    assert.equal(store.count(), 5);
  });

  it("searches and returns relevant chunks ranked by similarity", () => {
    const results = store.search(GAS_LEAK, 3);
    assert.ok(results.length > 0, "should return results");
    assert.ok(results[0].score > 0, "top result should have positive score");
    // The gas leak doc should rank higher than the valve doc
    assert.equal(results[0].doc_id, "DOC-001");
  });

  it("scores an unrelated query near zero rather than filtering it out", () => {
    // VectorStore.search() always returns topK, ranked by score — filtering
    // by a minimum relevance threshold is the caller's (chatEngine.js's)
    // responsibility, not the store's.
    const results = store.search(UNRELATED_QUERY, 3);
    assert.equal(results.length, 3);
    for (const r of results) {
      assert.ok(Math.abs(r.score) < 1e-9, "orthogonal vectors should score ~0");
    }
  });

  it("respects topK limit", () => {
    const results = store.search(GAS_LEAK, 2);
    assert.ok(results.length <= 2);
  });

  it("lists distinct documents", () => {
    const docs = store.listDocs();
    assert.equal(docs.length, 2);
    const ids = docs.map((d) => d.doc_id).sort();
    assert.deepEqual(ids, ["DOC-001", "DOC-002"]);
  });

  it("listDocs includes chunk count per document", () => {
    const docs = store.listDocs();
    const doc1 = docs.find((d) => d.doc_id === "DOC-001");
    assert.equal(doc1.chunks, 3);
    const doc2 = docs.find((d) => d.doc_id === "DOC-002");
    assert.equal(doc2.chunks, 2);
  });

  it("removes chunks by docId", () => {
    store.removeByDocId("DOC-002");
    assert.equal(store.count(), 3);
    const docs = store.listDocs();
    assert.equal(docs.length, 1);
    assert.equal(docs[0].doc_id, "DOC-001");
  });

  it("clear removes all chunks", () => {
    store.clear();
    assert.equal(store.count(), 0);
    assert.deepEqual(store.listDocs(), []);
  });

  it("works correctly after clear and re-insert", () => {
    store.insert("DOC-003", "PPE Requirements", "Safety", 0, "Hard hat and safety glasses required at all times.", GAS_LEAK);
    assert.equal(store.count(), 1);
    const results = store.search(GAS_LEAK, 1);
    assert.equal(results.length, 1);
    assert.equal(results[0].doc_id, "DOC-003");
  });
});
