const jwt = require('jsonwebtoken');
const usersRepo = require('../repositories/usersRepo');

const protect = async (req, res, next) => {
  let token;

  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, session token missing.'
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'firaudit_super_secret_jwt_key_2026'
    );

    const user = await usersRepo.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Officer not found.' });
    }

    req.user = usersRepo.toPublic(user);
    next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Not authorized, session token invalid or expired.'
    });
  }
};

module.exports = { protect };
