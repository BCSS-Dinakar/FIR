const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');

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

// Basic Route for testing
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'FIRAudit Backend is running successfully!' });
});

// Start Server
app.listen(PORT, async () => {
  await connectDB();
  console.log(`🚀 Server running on port ${PORT}`);
});
