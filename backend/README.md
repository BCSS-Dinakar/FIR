# FIRAudit Backend API

Node.js / Express backend for the FIRAudit platform. Handles officer authentication, petition audit storage, and the step-by-step petition pipeline (OCR → translation → 5W+1H validation → BNS RAG).

---

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** PostgreSQL (primary) with optional MongoDB sync/fallback
- **Security:** Bcrypt, JWT via HTTP-only cookies
- **Text AI:** vLLM (OpenAI-compatible API, e.g. Qwen)
- **OCR:** PaddleOCR-VL gateway (images + PDF/DOCX)
- **RAG:** Hybrid retrieval — BM25 + PostgreSQL FTS + trigram + optional pgvector (independent paths, RRF fusion) → Qwen legal judge

---

## Petition Pipeline Endpoints (`/api/petitions`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/pipeline/step/1` | OCR / text extraction (file upload) |
| `POST` | `/pipeline/step/2` | Translate to English |
| `POST` | `/pipeline/step/3` | 5W+1H extraction + metadata |
| `POST` | `/pipeline/finalize` | RAG section recommendations + save |
| `POST` | `/pipeline` | Legacy auto-run (all steps, streaming) |
| `GET` | `/` | List petitions (filter by status, blockers, search) |
| `GET` | `/draftandfile` | Valid petitions ready for filing |
| `GET` | `/mistakesandwarnings` | Petitions with blockers |
| `GET` | `/:id` | Single petition details |
| `PUT` | `/:id` | Update petition |
| `DELETE` | `/:id` | Delete petition |

---

## Project Structure

```text
backend/
├── config/             # Database connection setups
├── helpers/            # Shared utilities (llmUtils, promptGuard)
├── middleware/         # Auth verification
├── repositories/       # PostgreSQL + Mongo adapters
├── routes/             # Express routing (auth, petition, fir)
├── services/           # aiService, ocrService, firPipeline, bnsRagService
├── server.js           # Server initialization
└── package.json
```

---

## Getting Started

### 1. Environment

Copy the example and configure vLLM, OCR, and database URLs:

```bash
cp .env.example .env
```

Required variables: `VLLM_BASE_URL`, `VLLM_API_KEY`, `OCR_BASE_URL`, `OCR_API_KEY`, PostgreSQL credentials, `JWT_SECRET`.

See `.env.example` for the full list (embeddings, pgvector ingest, Mongo sync flags).

### 2. Run

```bash
npm install
npm run dev    # nodemon, default http://localhost:5000
```

### Hybrid RAG (section recommendations)

Retrieval runs **independent lexical and semantic paths**, unions candidates, deduplicates by section code, and fuses ranks with **RRF** before the Qwen legal judge:

```text
Facts → BM25 (50) + FTS (50) + Trigram (30)  ─┐
                                               ├→ UNION → RRF → Top 20 → Qwen judge
Facts → Embedding → pgvector (30)  ────────────┘
```

Scripts:

```bash
npm run db:ingest-embeddings   # after EMBEDDING_* + pgvector are configured
npm run db:test-embedding      # probe /v1/embeddings before ingest
npm run db:audit-embeddings    # coverage + integrity report
npm run db:validate-rag        # full PASS/DEGRADED/NOT_CONFIGURED/FAIL validation
npm run db:validate-rag-integrity  # UNION, dedup, RRF structural tests
npm run db:generate-eval-cases # expand eval dataset from PostgreSQL catalog
npm run db:eval-rag            # Recall@5/10/20/30 ablation (modes A–D)
npm run db:rag-report          # production readiness JSON report
```

Configure limits and RRF weights via `RAG_*` env vars in `.env.example`. Semantic retrieval degrades gracefully when `EMBEDDING_*` is unset.

---

## Documentation

- [doc/doc.md](../doc/doc.md) — Architecture and pipelines
- [doc/requirements.md](../doc/requirements.md) — Setup prerequisites
