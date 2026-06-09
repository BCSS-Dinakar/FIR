const jwt = require('jsonwebtoken');

/**
 * Generate a JWT token and attach it to an HTTP-only cookie.
 * @param {Response} res - Express response object
 * @param {String} userId - The user's ID
 */
const generateTokenAndSetCookie = (res, userId) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: '7d', // Token valid for 7 days
  });

  res.cookie('jwt', token, {
    httpOnly: true, // Prevents client-side JS from reading the cookie
    secure: process.env.NODE_ENV !== 'development', // Use secure cookies in production (HTTPS)
    sameSite: 'strict', // Prevents CSRF attacks
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  });

  return token;
};

/**
 * Clear the JWT cookie (used for logout).
 * @param {Response} res - Express response object
 */
const clearTokenCookie = (res) => {
  res.cookie('jwt', '', {
    httpOnly: true,
    expires: new Date(0),
  });
};

module.exports = {
  generateTokenAndSetCookie,
  clearTokenCookie,
};
