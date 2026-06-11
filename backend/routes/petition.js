const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Petition = require('../models/Petition');
const { runPetitionPipeline } = require('../services/firPipeline');

const router = express.Router();

// Configure multer storage
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

/**
 * @route   GET /api/petitions
 * @desc    Get all petitions (supports filtering by status, hasBlockers, and search term)
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const filter = {};
    
    // Filter by status (e.g., 'Pending Filing', 'FIR Filed')
    if (req.query.status) {
      filter.status = req.query.status;
    }

    // Filter by whether blockers are present
    if (req.query.hasBlockers !== undefined) {
      if (req.query.hasBlockers === 'true') {
        filter.blockers = { $exists: true, $not: { $size: 0 } };
      } else if (req.query.hasBlockers === 'false') {
        filter.$or = [
          { blockers: { $exists: false } },
          { blockers: { $size: 0 } }
        ];
      }
    }

    // Filter by search text (matching complainant, accused, or petition number)
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      const searchFilter = {
        $or: [
          { complainant: searchRegex },
          { accused: searchRegex },
          { petitionNo: searchRegex }
        ]
      };
      
      // Merge search filter with existing filters
      if (filter.$or) {
        // If there's already an $or filter (from hasBlockers=false), wrap them in an $and
        const existingOr = filter.$or;
        delete filter.$or;
        filter.$and = [
          { $or: existingOr },
          searchFilter
        ];
      } else {
        filter.$or = searchFilter.$or;
      }
    }

    const petitions = await Petition.find(filter).sort({ createdAt: -1 });
    return res.status(200).json(petitions);
  } catch (error) {
    console.error('Fetch petitions error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/petitions
 * @desc    Save a new scanned petition document
 * @access  Public
 */
router.post('/', async (req, res) => {
  try {
    const petition = new Petition(req.body);
    await petition.save();
    return res.status(201).json(petition);
  } catch (error) {
    console.error('Save petition error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   PUT /api/petitions/:id
 * @desc    Update an existing petition by its custom id
 * @access  Public
 */
router.put('/:id', async (req, res) => {
  try {
    const updated = await Petition.findOneAndUpdate(
      { id: req.params.id },
      { $set: req.body },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Petition not found' });
    }
    return res.status(200).json(updated);
  } catch (error) {
    console.error('Update petition error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   DELETE /api/petitions/:id
 * @desc    Delete a petition by its custom id
 * @access  Public
 */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Petition.findOneAndDelete({ id: req.params.id });
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Petition not found' });
    }
    return res.status(200).json({ success: true, message: 'Petition deleted' });
  } catch (error) {
    console.error('Delete petition error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/petitions/pipeline
 * @desc    Check a petition document up to Step 3 (Extract, Translate, Validate)
 * @access  Public
 */
router.post('/pipeline', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file was uploaded.' });
  }

  try {
    const result = await runPetitionPipeline(req.file);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Petition Pipeline error:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    // Ensure uploaded file is deleted to clean up temp storage
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error('Failed to delete temporary upload file:', err);
      }
    }
  }
});

module.exports = router;
