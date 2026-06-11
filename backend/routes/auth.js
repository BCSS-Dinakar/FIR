const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// @route   POST api/auth/register
// @desc    Register a new government officer
// @access  Public
router.post('/register', async (req, res) => {
  const { name, badge, email, password, mobile, station } = req.body;

  // 1. Basic validation
  if (!name || !badge || !email || !password || !mobile || !station) {
    return res.status(400).json({ 
      success: false, 
      message: 'Please provide all required registration fields.' 
    });
  }

  // 2. Email domain validation
  if (!email.toLowerCase().endsWith('.gov.in')) {
    return res.status(400).json({ 
      success: false, 
      message: 'Registration is restricted to government emails ending with .gov.in.' 
    });
  }

  // 3. Mobile validation (10 digits)
  if (!/^\d{10}$/.test(mobile)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Mobile number must be a valid 10-digit number.' 
    });
  }

  try {
    // 4. Duplicate checks
    const userExistsByEmail = await User.findOne({ email: email.toLowerCase() });
    if (userExistsByEmail) {
      return res.status(400).json({ 
        success: false, 
        message: 'An officer is already registered with this email.' 
      });
    }

    const userExistsByBadge = await User.findOne({ badge });
    if (userExistsByBadge) {
      return res.status(400).json({ 
        success: false, 
        message: 'An officer is already registered with this badge number.' 
      });
    }

    // 5. Create user
    const user = await User.create({
      name,
      badge,
      email: email.toLowerCase(),
      mobile,
      station,
      password // Schema pre-save hook handles hashing
    });

    // 6. Return response
    return res.status(201).json({
      success: true,
      message: 'Officer account created successfully.',
      user: {
        id: user._id,
        name: user.name,
        badge: user.badge,
        email: user.email,
        mobile: user.mobile,
        station: user.station,
        rank: user.rank,
        state: user.state,
        district: user.district,
        lastLogin: user.lastLogin
      }
    });

  } catch (error) {
    console.error('Error in registration:', error.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error during account creation. Please try again.' 
    });
  }
});

// @route   POST api/auth/login
// @desc    Authenticate officer & get profile
// @access  Public
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // 1. Validation
  if (!email || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Please provide email and password.' 
    });
  }

  try {
    // 2. Check for user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid credentials. User not found.' 
      });
    }

    // 3. Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid credentials. Password mismatch.' 
      });
    }

    // 4. Update lastLogin
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token & set cookie
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || 'firaudit_super_secret_jwt_key_2026',
      { expiresIn: '1d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    // 5. Return response
    return res.json({
      success: true,
      message: 'Sign in successful.',
      user: {
        id: user._id,
        name: user.name,
        badge: user.badge,
        email: user.email,
        mobile: user.mobile,
        station: user.station,
        rank: user.rank,
        state: user.state,
        district: user.district,
        lastLogin: user.lastLogin
      }
    });

  } catch (error) {
    console.error('Error in login:', error.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error during authentication.' 
    });
  }
});

// @route   GET api/auth/me
// @desc    Get current logged in officer profile
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    return res.json({
      success: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        badge: req.user.badge,
        email: req.user.email,
        mobile: req.user.mobile,
        station: req.user.station,
        rank: req.user.rank,
        state: req.user.state,
        district: req.user.district,
        lastLogin: req.user.lastLogin
      }
    });
  } catch (error) {
    console.error('Error in /me route:', error.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error retrieving user profile.' 
    });
  }
});

// @route   POST api/auth/logout
// @desc    Logout officer & clear session cookie
// @access  Public
router.post('/logout', (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0),
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  return res.json({ success: true, message: 'Logged out successfully.' });
});

module.exports = router;
