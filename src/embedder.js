/**
 * Shared embedding model loader.
 * Used by both ingest.js (to embed documents at indexing time) and
 * chatEngine.js (to embed the user's question at query time), so the
 * "discover, download if needed, load" boilerplate lives in one place.
 */
import { FoundryLocalManager } from "foundry-local-sdk";
import { config } from "./config.js";

let cachedModel = null;
let cachedClient = null;

/**
 * Load (or return the already-loaded) embedding model and client.
 * @param {(message: string) => void} onStatus - optional progress callback
 */
export async function getEmbeddingClient(onStatus = () => {}) {
  if (cachedClient) return cachedClient;

  const manager = FoundryLocalManager.create({ appName: "gas-field-local-rag" });
  const model = await manager.catalog.getModelVariant(config.embeddingModel);

  if (!model.isCached) {
    onStatus(`Downloading embedding model ${model.alias}...`);
    await model.download((progress) => {
      onStatus(`Downloading embedding model ${model.alias}... ${Math.round(progress * 100)}%`);
    });
  }

  onStatus(`Loading embedding model ${model.alias}...`);
  await model.load();

  cachedModel = model;
  cachedClient = model.createEmbeddingClient();
  return cachedClient;
}

/** Embed a single piece of text, returning its vector (array of numbers). */
export async function embedText(text) {
  const client = await getEmbeddingClient();
  const response = await client.generateEmbedding(text);
  return response.data[0].embedding;
}

/** Release the embedding model from memory (call when a short-lived script is done). */
export async function unloadEmbeddingModel() {
  if (cachedModel) {
    await cachedModel.unload().catch(() => {});
  }
  cachedModel = null;
  cachedClient = null;
}
