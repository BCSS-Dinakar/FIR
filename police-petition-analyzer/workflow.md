# Police Petition Analyzer - Workflow

This directory (`police-petition-analyzer`) acts as a dedicated **AI Extraction & Analysis Microservice** for the FIRAudit platform. 

Instead of heavily loading the main backend with complex AI integrations and OCR (Optical Character Recognition) tasks, this independent Node.js service handles the heavy lifting of reading documents, structuring legal data, mapping sections, and generating official court-ready PDFs.

## 🚀 The 5-Step AI Pipeline

This microservice receives a petition image (via an API endpoint or the `test.html` testbed) and runs it through a sequential, 5-step generative AI pipeline powered by Google Gemini:

### Step 1: Document OCR & Translation
- **Input**: Handwritten or typed police petition image (can be in regional languages like Telugu, Tamil, Hindi, etc.)
- **Process**: Gemini Vision reads the image, extracts the text exactly as written, detects the original language, and translates the entire petition into English without summarizing.

### Step 2: Validation & 5W1H Extraction
- **Input**: The translated English text from Step 1.
- **Process**: The AI validates whether the text is a legitimate police petition. It then structures the unstructured narrative into a strict **5W1H format**:
  - **WHO**: Complainant, victim, accused
  - **WHAT**: The core incident or offence
  - **WHEN**: Date and time
  - **WHERE**: Location of the incident
  - **WHY**: Motive
  - **HOW**: Method of the crime

### Step 3: Legal Audit & Section Mapping
- **Input**: The extracted 5W1H facts.
- **Process**: A Senior Legal Advisor AI persona analyzes the facts and maps the criminal offences to the relevant **Bharatiya Nyaya Sanhita (BNS)** sections (and cross-references the old IPC sections). It also drafts a formal, concise 1-paragraph summary narrative for the official FIR document.

### Step 4: BNSS Procedural Compliance Check
- **Input**: The 5W1H facts and translated text.
- **Process**: The AI acts as a Procedural Compliance Auditor. It verifies if the petition meets the standard FIR registration parameters under the **Bharatiya Nagarik Suraksha Sanhita (BNSS)**. It calculates a compliance score (out of 100) and lists any "Blockers" (e.g., missing timeline, missing complainant details) that prevent immediate registration.

### Step 5: Official FIR PDF Generation
- **Process**: If the petition passes the pipeline successfully, the Node.js server utilizes `pdfkit` to automatically generate a formal Court-Ready FIR Draft PDF.
- **Output**: The PDF includes the Date, Applied Legal Sections, Complainant/Accused details, 5W1H details, the AI Narrative Draft, the Compliance Score, and the Blocker list. The file is saved to the `/test_petitions` directory and a download URL is returned.

## 📡 Output Delivery
The microservice streams its progress via `NDJSON` (Newline Delimited JSON) so that the frontend UI can display real-time updates for each step. Once Step 5 completes, it sends the final consolidated JSON object with the `pdf_url` back to the client.

## 🛠 Tech Stack
- **Framework**: Node.js / Express
- **AI Integration**: `@google/genai` (Gemini 2.5 Flash / Vision)
- **File Handling**: `multer` (in-memory image processing)
- **Document Generation**: `pdfkit` (PDF rendering)
