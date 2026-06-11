const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  // Read token from HTTP-only cookie
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, session token missing.' });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'firaudit_super_secret_jwt_key_2026');

    // Fetch user details excluding password
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Officer not found.' });
    }

    next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    return res.status(401).json({ success: false, message: 'Not authorized, session token invalid or expired.' });
  }
};

module.exports = { protect };
