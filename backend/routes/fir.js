const express = require('express');
const FIR = require('../models/FIR');

const router = express.Router();

/**
 * @route   GET /api/firs
 * @desc    Get all filed FIR records (supports search query parameter)
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { complainant: searchRegex },
        { accused: searchRegex },
        { firNo: searchRegex }
      ];
    }
    const firs = await FIR.find(filter).sort({ createdAt: -1 });
    return res.status(200).json(firs);
  } catch (error) {
    console.error('Fetch FIRs error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/firs
 * @desc    Create a new registered FIR record
 * @access  Public
 */
router.post('/', async (req, res) => {
  try {
    const fir = new FIR(req.body);
    await fir.save();
    return res.status(201).json(fir);
  } catch (error) {
    console.error('Save FIR error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/firs/by-petition/:petitionId
 * @desc    Get FIR record by associated petitionId
 * @access  Public
 */
router.get('/by-petition/:petitionId', async (req, res) => {
  try {
    const fir = await FIR.findOne({ petitionId: req.params.petitionId });
    if (!fir) {
      return res.status(404).json({ success: false, message: 'FIR not found for this petition' });
    }
    return res.status(200).json(fir);
  } catch (error) {
    console.error('Fetch FIR by petition error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
