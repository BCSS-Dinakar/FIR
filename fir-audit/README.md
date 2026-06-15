# FIRAudit Frontend Dashboard

This is the React.js frontend for the **FIRAudit AI Legal Intelligence** platform. It provides an intuitive, high-fidelity user interface tailored for law enforcement officers, allowing them to audit criminal petitions, visualize compliance logs, and submit structured FIRs.

---

## ✨ Design & Visual Features
- **Ultra-Premium Theme**: Designed with custom glassmorphism, harmonious dark/light mode configurations, glowing neon elements, and responsive gradients.
- **Interactive Visualizations**: Comprehensive analytics charts showcasing compliance scores and active mistake distributions.
- **Dynamic Workflows**: Streaming text and image upload wizards with step-by-step progress bars and validation results.

---

## 🛠️ Tech Stack
- **Library**: React.js (Create React App)
- **Styling**: Tailwind CSS (with custom animations and transitions)
- **Navigation**: React Router DOM (v6)
- **Charts**: ChartJS (via `react-chartjs-2` for visual stats)

---

## 📂 Project Structure

```text
fir-audit/
├── public/                 # Static assets (HTML, favicons)
├── src/
│   ├── components/         # Reusable UI elements (Buttons, Cards, Modals)
│   ├── context/            # AuthContext and AppState providers
│   ├── pages/              # Primary dashboard screens
│   │   ├── Analytics.js    # Data charting and compliance tracking
│   │   ├── FileFIR.js      # Form filling and FIR registration
│   │   ├── Login.js        # Officer login form
│   │   ├── Mistakes.js     # Warnings log and correction hub
│   │   ├── StatusBoard.js  # Main table tracking all petitions
│   │   └── ScanPetition.js # Upload wizard running the AI pipeline
│   ├── App.js              # Routing and primary layout wrappers
│   ├── index.css           # Tailwind configurations and glassmorphic designs
│   └── index.js            # React entrypoint
└── package.json            # NPM scripts and React dependencies
```

---

## 🚀 Getting Started

### 1. Configure Environment Variables
Create a `.env` file in the frontend root directory to configure the target API server port:

```env
PORT=3000
REACT_APP_API_URL=http://localhost:3001
```

### 2. Available Scripts
From the `fir-audit` directory, run:

- **Install Dependencies**:
  ```bash
  npm install
  ```

- **Run in Development Mode**:
  ```bash
  npm start
  ```
  *(Starts the development server on [http://localhost:3000](http://localhost:3000). The page will auto-reload when files are modified)*

- **Build for Production**:
  ```bash
  npm run build
  ```
  *(Compiles the app into static files in the `build` folder for production hosting)*

---

## 📘 Central Documentation

For system-wide documentation and setup procedures:
- 📖 [doc/doc.md](file:///Users/sadhudinakar/VSCode/fir/doc/doc.md) - System-wide Architecture & Pipelines
- 🔧 [doc/requirements.md](file:///Users/sadhudinakar/VSCode/fir/doc/requirements.md) - Setup & installation guides
