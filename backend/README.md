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
- **RAG:** PostgreSQL FTS/trigram + optional pgvector embeddings

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

---

## Documentation

- [doc/doc.md](../doc/doc.md) — Architecture and pipelines
- [doc/requirements.md](../doc/requirements.md) — Setup prerequisites
