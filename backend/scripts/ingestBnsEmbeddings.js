/**
 * @deprecated Use scripts/ingestLawEmbeddings.js (PostgreSQL pgvector) instead.
 * This wrapper remains for backward-compatible npm/script references only.
 *
 * bnsEmbeddings.json (Mistral mistral-embed, 1024d) is no longer used at runtime.
 */
console.warn(
  '[deprecated] ingestBnsEmbeddings.js → use ingestLawEmbeddings.js for PostgreSQL pgvector ingest.'
);
require('./ingestLawEmbeddings');
