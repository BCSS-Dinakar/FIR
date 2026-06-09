# FIRAudit - AI Legal Intelligence

FIRAudit is an AI-powered platform built specifically for Indian Law Enforcement to ensure First Information Reports (FIRs) are procedurally compliant and structurally sound before they reach the courts.

By leveraging Google's Gemini Vision AI and Tesseract OCR, FIRAudit can read handwritten or typed petitions, automatically map the facts to relevant IPC / BNS / NDPS sections, and flag critical missing components (like missing Forensic Lab IDs or incorrect procedures).

## Project Structure

This repository is split into two main sections:

- **[`/fir-audit`](./fir-audit)**: The React.js frontend dashboard. Features an ultra-premium, modern, dark/light glassmorphic UI.
- **[`/backend`](./backend)**: The Node.js / Express backend. Handles JWT authentication, secure cookies, and MongoDB database storage.

## Quick Start

### 1. Start the Backend
```bash
cd backend
npm install
npm run dev
```
*(Runs on `http://localhost:5000`)*

### 2. Start the Frontend
```bash
cd fir-audit
npm install
npm start
```
*(Runs on `http://localhost:3000`)*

---
*Built with Neural Intelligence for Indian Law Enforcement.*
