# FIRAudit Backend API

This is the Node.js / Express backend API server for the FIRAudit platform. It securely manages Officer authentication, stores petition audit records, and runs the 3-stage petition extraction, translation, and validation pipeline.

---

## 🛠️ Tech Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB (using Mongoose ODM)
- **Security:** Bcrypt (password hashing), JSON Web Tokens (JWT via secure HTTP-only cookies)
- **AI Engine:** Local Ollama integration (`llama3.2` and `llava`)

---

## ⚡ Available Endpoints

### 🔐 Authentication (`/api/auth`)
- `POST /api/auth/register` - Register a new officer account
- `POST /api/auth/login` - Log in an officer and set cookie-based token
- `POST /api/auth/logout` - Log out and clear cookies
- `GET /api/auth/me` - Retrieve the current authenticated officer's details

### 📋 Petition Management (`/api/petitions`)
- `GET /api/petitions` - Fetch all audited petitions (supports filtering by status, search, and blockers)
- `GET /api/petitions/draftandfile` - Fetch valid petitions ready for filing
- `GET /api/petitions/mistakesandwarnings` - Fetch petitions flagged with missing compliance details
- `GET /api/petitions/counts` - Fetch active warning counts for the dashboard sidebar
- `GET /api/petitions/analytics` - Fetch compliance scores and officer statistics
- `POST /api/petitions/pipeline` - Streams progress of the 3-stage upload pipeline (OCR/Extraction, English Translation, legal validation)
- `GET /api/petitions/:id` - Fetch details of a single petition
- `PUT /api/petitions/:id` - Update a petition's fields
- `DELETE /api/petitions/:id` - Delete a petition record

---

## 📂 Project Structure

```text
backend/
├── config/             # Database connection setups
├── helpers/            # Shared utility functions
├── middleware/         # Auth verification and route blockers
├── models/             # Mongoose schemas (User, Petition, FIR)
├── routes/             # Express routing modules (auth, petition, fir)
├── services/           # AI Pipeline Orchestrators (firPipeline, ollamaService)
├── server.js           # Server initialization and middleware setups
└── package.json        # Dependencies and scripts configuration
```

---

## 🚀 Getting Started

### 1. Prerequisites & Environment Variables
Ensure MongoDB and Ollama are running locally. Create a `.env` file in the backend root directory:

```env
PORT=3001
MONGO_URI=mongodb://127.0.0.1:27017/firaudit
JWT_SECRET=firaudit_super_secret_jwt_key_2026
NODE_ENV=development
OLLAMA_URL=http://localhost:11434
```

### 2. Available Scripts
Run the following commands:

- **Install Dependencies**:
  ```bash
  npm install
  ```

- **Run in Development Mode (Recommended)**:
  ```bash
  npm run dev
  ```
  *(Uses `nodemon` to watch and auto-restart on changes. Runs on `http://localhost:3001`)*

- **Run in Production Mode**:
  ```bash
  npm start
  ```

---

## 📘 Central Documentation

For comprehensive system workflows and setup guides, refer to:
- 📖 [doc/doc.md](file:///Users/sadhudinakar/VSCode/fir/doc/doc.md) - Architecture and Pipelines
- 🔧 [doc/requirements.md](file:///Users/sadhudinakar/VSCode/fir/doc/requirements.md) - Setup Prerequisites and Installation
