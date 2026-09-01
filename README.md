# FIRAudit - AI Legal Intelligence

FIRAudit is an AI-powered platform for Indian law enforcement to validate First Information Reports (FIRs) and petitions before court submission.

Using **PaddleOCR-VL** for document scanning, **vLLM** for translation and legal reasoning, and **PostgreSQL RAG** for BNS section recommendations, FIRAudit reads handwritten or typed petitions, maps facts to relevant BNS / IPC / BSA sections, and flags missing components (names, dates, incident details, etc.).

---

## Project Structure

- **[`/fir-audit`](./fir-audit)**: React.js frontend dashboard (dark/light glassmorphic UI).
- **[`/backend`](./backend)**: Node.js / Express API — auth, petition pipeline, PostgreSQL + optional Mongo sync.
- **[`/legalsections`](./legalsections)**: Python FastAPI legal RAG service (FAISS + Gemini; optional, not wired to live UI).
- **[`/doc`](./doc)**: System documentation and setup guides.

---

## Setup & Documentation

- [System Architecture & Component Map](./doc/doc.md)
- [System Features & Capabilities](./doc/features.md)
- [Developer Workflows & Code Map](./doc/workflow.md)
- [Setup & Prerequisites](./doc/requirements.md)

---

*Built with Neural Intelligence for Indian Law Enforcement.*
