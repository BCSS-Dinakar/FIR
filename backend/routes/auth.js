const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const usersRepo = require('../repositories/usersRepo');
const { protect } = require('../middleware/auth');

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  badge: user.badge,
  email: user.email,
  mobile: user.mobile,
  station: user.station,
  rank: user.rank,
  state: user.state,
  district: user.district,
  lastLogin: user.lastLogin,
  themeModeUi: user.themeModeUi,
  sidebarCollapse: user.sidebarCollapse
});

router.post('/register', async (req, res) => {
  const { name, badge, email, password, mobile, station } = req.body;

  if (!name || !badge || !email || !password || !mobile || !station) {
    return res.status(400).json({
      success: false,
      message: 'Please provide all required registration fields.'
    });
  }

  if (!email.toLowerCase().endsWith('.gov.in')) {
    return res.status(400).json({
      success: false,
      message: 'Registration is restricted to government emails ending with .gov.in.'
    });
  }

  if (!/^\d{10}$/.test(mobile)) {
    return res.status(400).json({
      success: false,
      message: 'Mobile number must be a valid 10-digit number.'
    });
  }

  try {
    if (await usersRepo.findByEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'An officer is already registered with this email.'
      });
    }

    if (await usersRepo.findByBadge(badge)) {
      return res.status(400).json({
        success: false,
        message: 'An officer is already registered with this badge number.'
      });
    }

    const user = await usersRepo.create({
      name,
      badge,
      email: email.toLowerCase(),
      mobile,
      station,
      password
    });

    return res.status(201).json({
      success: true,
      message: 'Officer account created successfully.',
      user: publicUser(user)
    });
  } catch (error) {
    console.error('Error in registration:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error during account creation. Please try again.'
    });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide email and password.'
    });
  }

  try {
    const user = await usersRepo.findByEmail(email);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials. User not found.'
      });
    }

    const isMatch = await usersRepo.comparePassword(user, password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials. Password mismatch.'
      });
    }

    const updated = await usersRepo.updateById(user.id, { lastLogin: new Date() });

    const token = jwt.sign(
      { id: updated.id, email: updated.email },
      process.env.JWT_SECRET || 'firaudit_super_secret_jwt_key_2026',
      { expiresIn: '1d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      message: 'Sign in successful.',
      user: publicUser(updated)
    });
  } catch (error) {
    console.error('Error in login:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error during authentication.'
    });
  }
});

router.get('/me', protect, async (req, res) => {
  try {
    return res.json({
      success: true,
      user: publicUser(req.user)
    });
  } catch (error) {
    console.error('Error in /me route:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving user profile.'
    });
  }
});

router.post('/logout', (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0),
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  return res.json({ success: true, message: 'Logged out successfully.' });
});

router.put('/profile', protect, async (req, res) => {
  const { name, station, district, rank } = req.body;

  try {
    const user = await usersRepo.updateById(req.user.id, {
      name,
      station,
      district,
      rank
    });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      user: publicUser(user)
    });
  } catch (error) {
    console.error('Error in profile update:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error updating user profile.'
    });
  }
});

router.put('/globals', protect, async (req, res) => {
  const { themeModeUi, sidebarCollapse } = req.body;

  try {
    const user = await usersRepo.updateById(req.user.id, {
      themeModeUi,
      sidebarCollapse
    });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({
      success: true,
      message: 'Global UI settings updated successfully.',
      user: publicUser(user)
    });
  } catch (error) {
    console.error('Error in globals update:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error updating global UI settings.'
    });
  }
});

module.exports = router;
