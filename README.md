# FIRAudit - AI Legal Intelligence

FIRAudit is an AI-powered platform built specifically for Indian Law Enforcement to ensure First Information Reports (FIRs) are procedurally compliant and structurally sound before they reach the courts.

By leveraging Google's Gemini Vision AI, Tesseract OCR, local Ollama models, and RAG pipelines, FIRAudit can read handwritten or typed petitions, automatically map the facts to relevant BNS / IPC / BSA sections, and flag critical missing components (like missing names, dates, or incident details).

---

## 📂 Project Structure

This repository contains the following components:

- **[`/fir-audit`](./fir-audit)**: The React.js frontend dashboard. Features an ultra-premium, modern, dark/light glassmorphic UI.
- **[`/backend`](./backend)**: The Node.js / Express backend. Handles JWT authentication, secure cookies, MongoDB database storage, and 3-stage validation.
- **[`/petition`](./petition)**: Standalone 4-stage petition audit pipeline utilizing Ollama and ChromaDB for BNS vector search suggestions.
- **[`/legalsections`](./legalsections)**: Python FastAPI Legal RAG service using MongoDB, FAISS index, and Gemini API for fact grounding.
- **[`/doc`](./doc)**: System-wide documentation and step-by-step setup guides.

---

## 🚀 Setup & Documentation

To set up the database, install requirements, and run the applications, please refer to the detailed guides in the `doc/` folder:

- 📖 **[System Architecture & Component Map](./doc/doc.md)**
- 🌟 **[System Features & Capabilities Guide](./doc/features.md)**
- 🔄 **[Developer Workflows & Code Map](./doc/workflow.md)**
- 🔧 **[Setup & Prerequisites Guide](./doc/requirements.md)**

---
*Built with Neural Intelligence for Indian Law Enforcement.*

