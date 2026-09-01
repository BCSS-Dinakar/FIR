const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const connectDB = require('./config/db');
const { connectPostgres } = require('./config/postgres');
const authRoutes = require('./routes/auth');
const petitionRoutes = require('./routes/petition');
const firRoutes = require('./routes/fir');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    callback(null, origin);
  },
  credentials: true, // Allow cookies to be sent back and forth
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/petitions', petitionRoutes);
app.use('/api/firs', firRoutes);

// Basic Route for testing
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'FIRAudit Backend is running successfully!' });
});

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Start Server
app.listen(PORT, async () => {
  try {
    await connectPostgres();
  } catch (err) {
    console.error(`❌ PostgreSQL connection failed: ${err.message}`);
    process.exit(1);
  }

  // Mongo retained for Phase A dual-write / fallback (non-fatal if sync-only).
  try {
    await connectDB();
  } catch (err) {
    console.warn(`⚠️ MongoDB connection failed (fallback/sync degraded): ${err.message}`);
  }

  console.log(`🚀 Server running on port ${PORT}`);
});
