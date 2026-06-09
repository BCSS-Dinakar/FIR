# Police Petition Analyzer - Workflow

This directory (`police-petition-analyzer`) acts as a dedicated **AI Extraction & Analysis Microservice** for the FIRAudit platform. 

Instead of heavily loading the main backend with complex AI integrations and OCR (Optical Character Recognition) tasks, this independent service handles the heavy lifting of reading documents and structuring the legal data.

## 🚀 The Core Process Flow

### 1. Document Ingestion
- The user (Police Officer) uploads a handwritten petition or a typed complaint (PDF, JPG, PNG) via the React Frontend.
- The Main Backend (`/backend`) receives the file and forwards it to this Analyzer Microservice.

### 2. Optical Character Recognition (OCR) & AI Processing
Depending on the file type and language (English/Telugu):
- **Handwritten Documents**: Sent to **Google Gemini Vision AI** to accurately transcribe messy handwriting.
- **Typed Documents**: Processed using **Tesseract OCR** (or similar fast extraction tools) for quick text conversion.

### 3. Legal Entity Extraction & Structuring
Once the raw text is extracted, the AI agent parses the unstructured text and automatically maps it into the standard 15-section FIR format. It identifies:
- **Complainant Details** (Name, Age, Address)
- **Accused Details** (If known)
- **Date, Time & Location of Occurrence**
- **Core Facts / Narrative**

### 4. Legal Compliance Audit
The extracted facts are mapped against the legal database:
- **BNSS / BNS / IPC / NDPS Sections**: The AI suggests the correct legal sections based on the crime described.
- **Blocker Identification**: The system flags missing mandatory information (e.g., missing Forensic Lab IDs, unclear jurisdiction).

### 5. Data Return
- The structured JSON object (containing the drafted FIR sections, confidence scores, and compliance blockers) is returned to the Main Backend.
- The Main Backend saves this audit log to MongoDB and sends the real-time feedback back to the Frontend Dashboard for the officer to review.

## 🛠 Tech Stack (Proposed)
- **Framework**: Node.js / Express (or Python/FastAPI if heavy ML libraries are needed later)
- **AI Integration**: `@google/genai` (Gemini SDK)
- **Document Processing**: `pdf-parse`, `tesseract.js`
