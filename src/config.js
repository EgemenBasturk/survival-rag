// Application configuration – all paths relative to project root
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

export const config = {
  // Model
  model: "Phi-3.5-mini-instruct-generic-cpu:2",

  // RAG
  docsDir: path.join(ROOT, "docs"),
  dbPath: path.join(ROOT, "data", "rag.db"),
  chunkSize: 350,       // ingilizceye çevirince bazı dosyalar sığmadı 
  chunkOverlap: 40,      // tokens overlap between chunks – gelecekteki daha uzun dokümanlar için pay
  topK: 3,              // number of chunks to retrieve – limited for NPU context window

  // Server
  port: 3000,
  host: "127.0.0.1",

  // UI
  publicDir: path.join(ROOT, "public"),
};
