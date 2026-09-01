# Setup & Requirements Guide

Step-by-step instructions to configure and run **FIR Audit & Legal Intelligence**.

---

## System Prerequisites

1. **Node.js** (v18+) and **npm** (v9+)
2. **PostgreSQL** — primary database (legislative schema with laws tables)
3. **MongoDB** — optional sync/fallback (`MONGO_SYNC`, `MONGO_FALLBACK` in `.env`)
4. **vLLM endpoint** — OpenAI-compatible text API (translation, 5W+1H, metadata)
5. **OCR gateway** — PaddleOCR-VL (separate from vLLM text model)
6. **Python 3.9+** — only if running optional `legalsections` service
7. **Gemini API key** — only for optional `legalsections` RAG service

You do **not** need Ollama, ChromaDB, or local LLM daemons for the live fir-audit stack.

---

## Project Directory Structure

```text
fir/
├── doc/                # Documentation
├── backend/            # Node.js API (port 5000 default)
├── fir-audit/          # React frontend (port 3000)
└── legalsections/      # Optional Python FastAPI RAG (port 8000)
```

---

## Setup Steps

### 1. Express Backend (`/backend`)

Handles auth, petition pipeline, PostgreSQL, and optional Mongo sync.

```bash
cd backend
npm install
cp .env.example .env
# Edit .env: VLLM_*, OCR_*, POSTGRES_*, JWT_SECRET, MONGO_URI (if syncing)
npm run dev
```

Default: [http://localhost:5000](http://localhost:5000)

Key env vars (see `backend/.env.example`):

```env
VLLM_BASE_URL=http://your-vllm-host/v1
VLLM_API_KEY=your-key
VLLM_MODEL=qwen3:14b-awq

OCR_BASE_URL=http://your-ocr-host/v1
OCR_API_KEY=your-key
OCR_MODEL=paddleocr-vl:0.9b

POSTGRES_HOST=...
POSTGRES_DB=legislative
PG_PRIMARY=true
```

Optional pgvector RAG: install `vector` extension, set `EMBEDDING_*` vars, run `npm run db:ingest-embeddings`.

---

### 2. React Frontend (`/fir-audit`)

```bash
cd fir-audit
npm install
```

Create `.env`:

```env
PORT=3000
REACT_APP_API_URL=http://localhost:5000
```

```bash
npm start
```

Default: [http://localhost:3000](http://localhost:3000)

---

### 3. Legal RAG Python API (`/legalsections`) — optional

Not required for the live Check New Petition flow. See `legalsections/README.md` if you need standalone FIR section validation via Gemini + FAISS.

```bash
cd legalsections
python -m venv env
source env/bin/activate   # Windows: env\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # GEMINI_API_KEY, MONGO_URI
python scripts/build_faiss.py
python run.py
```

API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Verify End-to-End

With backend running:

```bash
cd backend
node scripts/verifyLiveWorkflow.js
```

This exercises auth, petition CRUD, pipeline steps, and autofill against the configured vLLM/OCR endpoints.
