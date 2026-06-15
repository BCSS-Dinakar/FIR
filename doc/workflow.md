# Developer Workflows & Code Map

This document outlines the step-by-step developer and code pathways for critical flows in the system, mapping frontend actions to specific backend controllers, services, database models, and external APIs.

---

## 🔄 1. Ingestion & Pipeline Validation Flow
This flow is triggered when an officer uploads a raw written petition to scan it for compliance.

```mermaid
sequenceDiagram
    participant UI as React: FileFIR.js
    participant API as Express Route: petition.js
    participant Pipe as Service: firPipeline.js
    participant Ollama as Service: ollamaService.js
    participant DB as MongoDB: Petition.js

    UI->>API: POST /api/petitions/pipeline (File upload)
    API->>Pipe: runPetitionPipeline(fileDetails)
    Note over Pipe: Stage 1: OCR / Text Scanning
    Pipe->>Ollama: Extract text using llava (if image)
    Note over Pipe: Stage 2: Legal Translation
    Pipe->>Ollama: Translate to English using llama3.2
    Note over Pipe: Stage 3: Legal Validation
    Pipe->>Ollama: Check facts against 6 Ws using llama3.2
    Pipe-->>API: Stream progress updates back to UI
    Pipe->>DB: Save/update petition audit log
    DB-->>UI: View results/blockers
```

### File Map for Ingestion & Pipeline
* **Triggering UI**: [FileFIR.js](file:///Users/sadhudinakar/VSCode/fir/fir-audit/src/pages/FileFIR.js) handles the local file selection and makes an `Axios` multipart request to `/api/petitions/pipeline`.
* **API Entrypoint**: [petition.js](file:///Users/sadhudinakar/VSCode/fir/backend/routes/petition.js) exposes the endpoint, uploads the files to `/uploads` using Multer, and initiates the pipeline run.
* **Pipeline Runner**: [firPipeline.js](file:///Users/sadhudinakar/VSCode/fir/backend/services/firPipeline.js) orchestrates each stage of translation and validation.
* **Local AI Client**: [ollamaService.js](file:///Users/sadhudinakar/VSCode/fir/backend/services/ollamaService.js) formats prompts and performs POST HTTP calls to the local Ollama daemon (port `11434`).
* **Database Representation**: [Petition.js](file:///Users/sadhudinakar/VSCode/fir/backend/models/Petition.js) records the processing status, extracted English translation text, and blocker fields in the `petitions` MongoDB collection.

---

## ⚖️ 2. Legal Section Validation Flow (RAG Service)
This flow checks whether the legal sections applied to the complaint are actually supported by the incident facts, grounding the checks in the vector database of the BNS 2023 code.

```mermaid
sequenceDiagram
    participant API as FastAPI Route: routes.py
    participant Retrieval as RAG: retrieval.py
    participant FAISS as Vector DB: vector_store.py
    participant Gemini as GenAI: gemini_client.py
    participant Validator as RAG: fir_validator.py

    API->>Retrieval: retrieve_relevant_context(incident_facts)
    Retrieval->>FAISS: query(embeddings)
    FAISS-->>Retrieval: Returns top BNS law definitions
    API->>Validator: validate_applied_sections(facts, sections, retrieved_laws)
    Validator->>Gemini: call_gemini(system_instructions, user_prompt)
    Gemini-->>Validator: Structured evaluation response
    Validator-->>API: Returns validation details and suggestion verdict
```

### File Map for RAG Validation
* **Python API Entrypoint**: [routes.py](file:///Users/sadhudinakar/VSCode/fir/legalsections/app/api/routes.py) hosts the `POST /validate-fir` endpoint.
* **Text Embeddings Provider**: [embedding.py](file:///Users/sadhudinakar/VSCode/fir/legalsections/app/rag/embedding.py) converts raw queries into high-dimensional vectors.
* **Vector Index Querying**: [vector_store.py](file:///Users/sadhudinakar/VSCode/fir/legalsections/app/rag/vector_store.py) handles context loading and searching in the local FAISS index.
* **Gemini Grounding Client**: [gemini_client.py](file:///Users/sadhudinakar/VSCode/fir/legalsections/app/rag/gemini_client.py) prepares low-temperature prompts referencing law descriptions, sending them to Google's Gemini SDK.
* **Validation & Verdict Engine**: [fir_validator.py](file:///Users/sadhudinakar/VSCode/fir/legalsections/app/rag/fir_validator.py) checks if the facts contain correct "legal ingredients" matching the law.

---

## 📂 3. Ingesting BNS Laws (ChromaDB Vector Store)
For the standalone pipeline, law sections must be loaded and embedded. This flow runs offline to set up the system.

```mermaid
graph TD
    PDF[BNS PDF File] -->|extract_pdf.js| TXT[Raw Text File]
    TXT -->|parse_json.js| JSON[Structured JSON Sections]
    JSON -->|ingest_chromadb.js| Chroma[ChromaDB Collection]
```

### File Map for Ingestion Scripts
* **PDF OCR/Reader**: [extract_pdf.js](file:///Users/sadhudinakar/VSCode/fir/petition/sections_data/scripts/extract_pdf.js) parses the official BNS Act document into plain text.
* **Text Parser**: [parse_json.js](file:///Users/sadhudinakar/VSCode/fir/petition/sections_data/scripts/parse_json.js) maps the raw text into structured JSON containing section numbers, titles, descriptions, and legal categories.
* **Vector Database Populator**: [ingest_chromadb.js](file:///Users/sadhudinakar/VSCode/fir/petition/sections_data/scripts/ingest_chromadb.js) connects to ChromaDB, generates embeddings using Ollama's `nomic-embed-text`, and stores them.
