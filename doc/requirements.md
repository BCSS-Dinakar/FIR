# Setup & Requirements Guide

This document provides step-by-step instructions to set up, configure, and run the various components of the **FIR Audit & Legal Intelligence** system.

---

## 🛠️ System Prerequisites

Before setting up any component, ensure you have the following installed on your local machine:

1. **Node.js** (v18.x or higher) & **npm** (v9.x or higher)
2. **Python** (v3.9 or higher, required for `legalsections`)
3. **MongoDB** (v5.0 or higher, running locally on port `27017` or a MongoDB Atlas URI)
4. **Ollama** (v0.1.48 or higher, running locally on port `11434`)
5. **ChromaDB** (Running locally on port `8000` or via Docker, required for the `petition` pipeline)
6. **Gemini API Key** (Required for the `legalsections` RAG service)

---

## 🤖 AI Models (Ollama)

Ensure Ollama is running, then pull the following models in your terminal:

```bash
# General-purpose text model used for translations and validation
ollama pull llama3.2

# Vision model used to extract text/OCR from petition images
ollama pull llava

# Text embedding model used for BNS section vectorization and retrieval
ollama pull nomic-embed-text
```

---

## 📂 Project Directory Structure

```text
fir/
├── doc/
│   ├── doc.md                # System Architecture & Component Documentation
│   └── requirements.md       # Setup and Installation Guide (This file)
├── backend/                  # Node.js/Express API Server (Port 3001)
├── fir-audit/                # React.js Frontend Dashboard (Port 3000)
├── petition/                 # Standalone Ollama & ChromaDB Petition Pipeline (Port 3002/3000)
└── legalsections/            # Python FastAPI Legal RAG & FAISS Vector Service (Port 8000)
```

---

## 🚀 Setup Steps for Components

### 1. Express Backend (`/backend`)
The backend service handles Officer accounts, authentication, MongoDB transactions, and step-by-step petition validation up to stage 3.

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```
4. Verify/configure your `.env` settings:
   ```env
   PORT=3001
   MONGO_URI=mongodb://127.0.0.1:27017/firaudit
   JWT_SECRET=firaudit_super_secret_jwt_key_2026
   NODE_ENV=development
   OLLAMA_URL=http://localhost:11434
   ```
5. Start the backend server in development mode:
   ```bash
   npm run dev
   ```
   *(Running on [http://localhost:3001](http://localhost:3001))*

---

### 2. React Frontend (`/fir-audit`)
The frontend dashboard provides an interactive UI for police officers to scan petitions, check accuracy, and manage FIRs.

1. Navigate to the frontend directory:
   ```bash
   cd ../fir-audit
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create/update your `.env` file:
   ```env
   PORT=3000
   REACT_APP_API_URL=http://localhost:3001
   ```
4. Start the React development server:
   ```bash
   npm start
   ```
   *(Running on [http://localhost:3000](http://localhost:3000))*

---

### 3. Standalone Petition Pipeline (`/petition`)
This service runs a standalone 4-stage pipeline that includes semantic law suggestions using ChromaDB.

> [!WARNING]
> Since the frontend (`fir-audit`) runs on port `3000` by default, ensure you configure the `petition` port to `3002` (or another free port) in its `.env` file to avoid a port conflict.

1. Navigate to the petition directory:
   ```bash
   cd ../petition
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file:
   ```env
   PORT=3002
   OLLAMA_URL=http://localhost:11434
   ```
4. **Ingest BNS Data into ChromaDB**:
   Ensure ChromaDB is running locally on port `8000`. Then, parse the BNS laws and ingest them into ChromaDB:
   ```bash
   # Extract text from BNS PDF
   node sections_data/scripts/extract_pdf.js
   
   # Parse raw text into structured JSON
   node sections_data/scripts/parse_json.js
   
   # Ingest JSON sections into ChromaDB collection
   node sections_data/scripts/ingest_chromadb.js
   
   # Optional: Test vector search queries
   node sections_data/scripts/test_search.js
   ```
5. Start the pipeline server:
   ```bash
   # Dev Mode
   npm run dev
   
   # Production Mode
   npm start
   ```
   *(Running on [http://localhost:3002](http://localhost:3002))*

---

### 4. Legal RAG Python API (`/legalsections`)
This Python FastAPI service implements a production-ready Lightweight Legal Retrieval-Augmented Generation (RAG) system using MongoDB, FAISS search, and Google's Gemini API.

1. Navigate to the legalsections directory:
   ```bash
   cd ../legalsections
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv env
   
   # On macOS/Linux:
   source env/bin/activate
   
   # On Windows (Command Prompt):
   env\Scripts\activate.bat
   
   # On Windows (PowerShell):
   env\Scripts\Activate.ps1
   ```
3. Install Python requirements:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   GEMINI_MODEL=gemini-2.5-flash
   GEMINI_FALLBACK_MODEL=gemini-2.5-flash-lite
   MONGO_URI=mongodb://127.0.0.1:27017/firaudit
   ```
5. **Build the FAISS Vector Index**:
   Ensure MongoDB is running and populated with the BNS, BNSS, and BSA documents. Build the FAISS vector database:
   ```bash
   python scripts/build_faiss.py
   ```
6. Run the FastAPI server:
   ```bash
   python run.py
   ```
   *(Running on [http://localhost:8000](http://localhost:8000))*
   - API Docs will be available at [http://localhost:8000/docs](http://localhost:8000/docs).
   - Test RAG response quality with:
     ```bash
     python scripts/test_rag.py
     ```
