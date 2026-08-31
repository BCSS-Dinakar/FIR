const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Petition = require('../models/Petition');
const { runPetitionPipeline } = require('../services/firPipeline');
const bnsCatalogService = require('../services/bnsCatalogService');
const { extractFirFields } = require('../services/firAutofillService');

const router = express.Router();

// Configure multer storage
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const formatPetition = (p) => {
  if (!p) return null;
  return {
    _id: p._id,
    id: p.id,
    petitionNo: p.petitionNo,
    date: p.date,
    complainant: p.complainant,
    accused: p.accused,
    sections: p.sections || [],
    score: p.score,
    status: p.status,
    blockers: p.blockers || [],
    sourceFile: p.sourceFile,
    firNo: p.firNo || "",
    filedAt: p.filedAt || "",
    district: p.district || "",
    policeStation: p.policeStation || "",
    gdNumber: p.gdNumber || "",
    incidentDate: p.incidentDate || "",
    incidentTime: p.incidentTime || "",
    occurrencePlace: p.occurrencePlace || "",
    complainantRelative: p.complainantRelative || "",
    complainantPhone: p.complainantPhone || "",
    complainantAddress: p.complainantAddress || "",
    incidentFacts: p.incidentFacts || "",
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    __v: p.__v
  };
};

/**
 * @route   GET /api/petitions/draftandfile
 * @desc    Get petitions without blockers and associated stats for the File FIR page
 * @access  Public
 */
router.get('/draftandfile', async (req, res) => {
  try {
    const petitions = await Petition.find({
      $or: [
        { blockers: { $exists: false } },
        { blockers: { $size: 0 } }
      ]
    }).select('id petitionNo date complainant accused sections score status blockers sourceFile firNo filedAt district policeStation gdNumber incidentDate incidentTime occurrencePlace complainantRelative complainantPhone complainantAddress incidentFacts createdAt updatedAt').sort({ createdAt: -1 });

    const formatted = petitions.map(p => formatPetition(p));

    const totalScanned = await Petition.countDocuments();
    const pendingFiling = await Petition.countDocuments({ status: 'Pending Filing' });
    const firsRegistered = await Petition.countDocuments({ status: 'FIR Filed' });

    return res.status(200).json({
      success: true,
      petitions: formatted,
      stats: {
        totalScanned,
        pendingFiling,
        firsRegistered
      }
    });
  } catch (error) {
    console.error('Fetch draftandfile error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/petitions/mistakesandwarnings
 * @desc    Get petitions with blockers and associated stats for the Mistakes page
 * @access  Public
 */
router.get('/mistakesandwarnings', async (req, res) => {
  try {
    const petitions = await Petition.find({
      blockers: { $exists: true, $not: { $size: 0 } }
    }).select('id petitionNo date complainant accused sections score status blockers sourceFile firNo filedAt district policeStation gdNumber incidentDate incidentTime occurrencePlace complainantRelative complainantPhone complainantAddress incidentFacts createdAt updatedAt').sort({ createdAt: -1 });

    const formatted = petitions.map(p => formatPetition(p));

    const activeMistakesCountResult = await Petition.aggregate([
      { $match: { status: { $ne: 'FIR Filed' } } },
      { $project: { numBlockers: { $cond: { if: { $isArray: '$blockers' }, then: { $size: '$blockers' }, else: 0 } } } },
      { $group: { _id: null, total: { $sum: '$numBlockers' } } }
    ]);
    const activeMistakes = activeMistakesCountResult[0]?.total || 0;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const resolvedTodayCount = await Petition.countDocuments({
      $or: [
        { blockers: { $exists: false } },
        { blockers: { $size: 0 } }
      ],
      updatedAt: { $gte: startOfToday },
      $expr: { $ne: ["$createdAt", "$updatedAt"] }
    });

    const resolutionStats = await Petition.aggregate([
      {
        $match: {
          $or: [
            { blockers: { $exists: false } },
            { blockers: { $size: 0 } }
          ],
          $expr: { $ne: ["$createdAt", "$updatedAt"] }
        }
      },
      {
        $project: {
          diffMs: { $subtract: ["$updatedAt", "$createdAt"] }
        }
      },
      {
        $group: {
          _id: null,
          avgDiffMs: { $avg: "$diffMs" }
        }
      }
    ]);

    let avgResolutionTime = "--"; // Realistic default fallback
    if (resolutionStats.length > 0 && resolutionStats[0].avgDiffMs) {
      const avgMinutes = Math.round(resolutionStats[0].avgDiffMs / (1000 * 60));
      avgResolutionTime = `${avgMinutes} min`;
    }

    const resolvedToday = resolvedTodayCount.toString();

    return res.status(200).json({
      success: true,
      petitions: formatted,
      stats: {
        activeMistakes,
        avgResolutionTime,
        resolvedToday
      }
    });
  } catch (error) {
    console.error('Fetch mistakesandwarnings error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/petitions/analytics
 * @desc    Get optimized compliance scores and blocker distributions for analytics charting
 * @access  Public
 */
router.get('/analytics', async (req, res) => {
  try {
    const petitionsForScores = await Petition.find({}, 'score').sort({ createdAt: 1 });
    const scores = petitionsForScores.map(p => p.score);

    const petitionsForBlockers = await Petition.find({}, 'blockers');
    const blockerCounts = {};
    petitionsForBlockers.forEach(p => {
      if (p.blockers && Array.isArray(p.blockers)) {
        p.blockers.forEach(b => {
          blockerCounts[b] = (blockerCounts[b] || 0) + 1;
        });
      }
    });

    const User = require('../models/User');
    const users = await User.find({}, 'name rank station badge');

    const officers = users.map((user) => {
      const trend = null;

      const parts = user.name.replace(/^(Insp\.|Sub-Insp\.|Asst\.|Insp|SI|ASI|DSP|Constable)\.?\s+/i, '').split(' ');
      const initials = parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : user.name.substring(0, 2).toUpperCase();

      const colors = [
        'from-blue-600 to-cyan-500',
        'from-emerald-600 to-teal-500',
        'from-purple-600 to-pink-500',
        'from-amber-600 to-orange-500'
      ];
      const colorIdx = (user.badge.charCodeAt(user.badge.length - 1)) % colors.length;

      return {
        name: user.name,
        rank: user.rank,
        score: null,
        trend,
        initials,
        color: colors[colorIdx],
        badge: user.badge
      };
    });

    officers.sort((a, b) => b.score - a.score);

    const rankedOfficers = officers.map((off, idx) => ({
      ...off,
      rank: (idx + 1).toString()
    }));

    return res.status(200).json({
      success: true,
      scores,
      blockerCounts,
      officers: rankedOfficers
    });
  } catch (error) {
    console.error('Fetch analytics error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/petitions/counts
 * @desc    Get optimized counts for mistakes and pending filings
 * @access  Public
 */
router.get('/counts', async (req, res) => {
  try {
    const result = await Petition.aggregate([
      { $match: { status: { $ne: 'FIR Filed' } } },
      { $project: { numBlockers: { $cond: { if: { $isArray: '$blockers' }, then: { $size: '$blockers' }, else: 0 } } } },
      { $group: { _id: null, totalMistakes: { $sum: '$numBlockers' } } }
    ]);
    const activeMistakesCount = result[0]?.totalMistakes || 0;

    const pendingFilingCount = await Petition.countDocuments({
      status: 'Pending Filing',
      $or: [
        { blockers: { $exists: false } },
        { blockers: { $size: 0 } }
      ]
    });

    return res.status(200).json({
      success: true,
      activeMistakesCount,
      pendingFilingCount
    });
  } catch (error) {
    console.error('Fetch counts error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/petitions/firstatusboard
 * @desc    Get all petitions and FIRs for the FIR Status Board
 * @access  Public
 */
router.get('/firstatusboard', async (req, res) => {
  try {
    const petitions = await Petition.find().select('id petitionNo date complainant accused sections score status blockers sourceFile firNo filedAt district policeStation gdNumber incidentDate incidentTime occurrencePlace complainantRelative complainantPhone complainantAddress incidentFacts createdAt updatedAt').sort({ createdAt: -1 });
    const FIR = require('../models/FIR');
    const firs = await FIR.find().sort({ createdAt: -1 });

    const formattedPetitions = petitions.map(p => formatPetition(p));

    const totalChecked = await Petition.countDocuments();
    const pendingReview = await Petition.countDocuments({
      status: 'Pending Filing',
      $or: [
        { blockers: { $exists: false } },
        { blockers: { $size: 0 } }
      ]
    });

    const avgAccuracyResult = await Petition.aggregate([
      { $group: { _id: null, avgScore: { $avg: "$score" } } }
    ]);
    const avgAccuracy = avgAccuracyResult[0]?.avgScore ? avgAccuracyResult[0].avgScore.toFixed(1) + '%' : '0%';

    const unresolvedResult = await Petition.aggregate([
      { $match: { status: { $ne: 'FIR Filed' } } },
      { $project: { numBlockers: { $cond: { if: { $isArray: '$blockers' }, then: { $size: '$blockers' }, else: 0 } } } },
      { $group: { _id: null, total: { $sum: '$numBlockers' } } }
    ]);
    const unresolvedMistakes = unresolvedResult[0]?.total || 0;

    return res.status(200).json({
      success: true,
      petitions: formattedPetitions,
      firs,
      stats: {
        totalChecked,
        pendingReview,
        avgAccuracy,
        unresolvedMistakes
      }
    });
  } catch (error) {
    console.error('Fetch statusboard error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
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

    const petitions = await Petition.find(filter).select('id petitionNo date complainant accused sections score status blockers sourceFile firNo filedAt district policeStation gdNumber incidentDate incidentTime occurrencePlace complainantRelative complainantPhone complainantAddress incidentFacts createdAt updatedAt').sort({ createdAt: -1 });

    const formattedPetitions = petitions.map(p => formatPetition(p));

    return res.status(200).json(formattedPetitions);
  } catch (error) {
    console.error('Fetch petitions error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/petitions/bns-sections
 * @desc    Get legal sections from MongoDB (legal_database.laws_sections): BNS, BNSS,
 *          and BSA. Kept at this URL for backward compatibility with existing callers.
 * @access  Public
 */
router.get('/bns-sections', async (req, res) => {
  try {
    const { search = '', recommended, petitionId } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    // Prefer the petition's own RAG-recommended sections; fall back to an explicit
    // ?recommended=CODE,CODE list for callers that don't have a petitionId yet.
    // sectionRecommendations (>=50% confidence, per bnsRagService.CONFIDENCE_THRESHOLD)
    // is the full Suggested Sections set — it's a superset of petition.sections, which
    // only holds the auto-selected (>=80% confidence) subset. Older petitions saved
    // before this field existed fall back to petition.sections with no confidence.
    let recommendedRaw = [];
    let confidenceByCode = {};
    if (petitionId) {
      const petition = await Petition.findOne({ id: petitionId });
      if (petition) {
        const recs = Array.isArray(petition.sectionRecommendations) ? petition.sectionRecommendations : [];
        if (recs.length > 0) {
          recommendedRaw = recs.map((r) => r.code);
          confidenceByCode = Object.fromEntries(recs.map((r) => [r.code, r.confidence]));
        } else {
          recommendedRaw = petition.sections || [];
        }
      }
    } else if (recommended) {
      recommendedRaw = recommended.split(',').map((s) => s.trim()).filter(Boolean);
    }

    const resolvedRecommended = await bnsCatalogService.resolveCodes(recommendedRaw);
    const recommendedSections = resolvedRecommended.map((entry) => ({
      ...entry,
      confidence: confidenceByCode[entry.code] ?? null
    }));
    const { results: allSections, total } = await bnsCatalogService.searchCatalog(search, { limit, offset });

    return res.status(200).json({
      success: true,
      recommended: recommendedSections,
      all: allSections,
      total
    });
  } catch (error) {
    console.error('Fetch BNS sections error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});


/**
 * @route   GET /api/petitions/:id
 * @desc    Get a single petition by its custom id (returns full details)
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const petition = await Petition.findOne({ id: req.params.id });
    if (!petition) {
      return res.status(404).json({ success: false, message: 'Petition not found' });
    }
    return res.status(200).json(petition);
  } catch (error) {
    console.error('Fetch single petition error:', error);
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
    return res.status(201).json(formatPetition(petition));
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
    return res.status(200).json(formatPetition(updated));
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
    const petition = await Petition.findOne({ id: req.params.id });
    if (!petition) {
      return res.status(404).json({ success: false, message: 'Petition not found' });
    }
    if (petition.status === 'FIR Filed') {
      return res.status(409).json({ success: false, message: 'This petition has an FIR filed against it and cannot be deleted.' });
    }
    await Petition.deleteOne({ id: req.params.id });
    return res.status(200).json({ success: true, message: 'Petition deleted' });
  } catch (error) {
    console.error('Delete petition error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/petitions/:id/autofill-fir
 * @desc    AI-extracts FIR form fields (dates, complainant/accused details, property,
 *          incident narrative) grounded strictly in the petition's translated text —
 *          fields not mentioned in the petition come back null, nothing is invented.
 *          Cached on the petition after first run; pass ?refresh=true to re-extract.
 * @access  Public
 */
router.get('/:id/autofill-fir', async (req, res) => {
  try {
    const petition = await Petition.findOne({ id: req.params.id });
    if (!petition) {
      return res.status(404).json({ success: false, message: 'Petition not found' });
    }

    const cached = petition.metadata?.firAutofill;
    if (cached && req.query.refresh !== 'true') {
      return res.status(200).json({ success: true, fields: cached, cached: true });
    }

    const sourceText = petition.step2Output || petition.step1Output;
    if (!sourceText) {
      return res.status(422).json({ success: false, message: 'No petition text available to extract from.' });
    }

    const fields = await extractFirFields(sourceText);

    petition.metadata = { ...(petition.metadata || {}), firAutofill: fields };
    petition.markModified('metadata');
    await petition.save();

    return res.status(200).json({ success: true, fields, cached: false });
  } catch (error) {
    console.error('FIR autofill error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/petitions/pipeline
 * @desc    Check a petition document up to Step 3 (Extract, Translate, Validate) and stream progress
 * @access  Public
 */
router.post('/pipeline', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file was uploaded.' });
  }

  // Set headers for NDJSON streaming
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.writeHead(200);

  try {
    const onStep = (data) => {
      res.write(JSON.stringify(data) + '\n');
    };

    const result = await runPetitionPipeline(req.file, onStep);

    // Build the database record using the pipeline output
    const complainant = result.metadata?.complainant;
    const accused = result.metadata?.accused;
    const sections = result.metadata?.sections;
    const sectionRecommendations = result.metadata?.sectionRecommendations || [];
    const blockers = result.step3Output?.missing_fields;
    const valid = result.step3Output?.valid;

    // Calculate score based on missing fields
    const score = valid ? 95 : Math.max(40, 90 - ((blockers ? blockers.length : 0) * 15));

    const newId = `PET-2026-${Math.floor(100 + Math.random() * 900)}`;
    const petNo = `PET/HYD/2026/${Math.floor(100 + Math.random() * 900)}`;
    const dateFormatted = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

    const newPetition = new Petition({
      id: newId,
      petitionNo: petNo,
      date: dateFormatted,
      complainant: complainant,
      accused: accused,
      sections: sections,
      sectionRecommendations: sectionRecommendations,
      score: score,
      status: 'Pending Filing',
      blockers: blockers,
      sourceFile: req.file.originalname,
      step1Output: result.step1Output,
      step2Output: result.step2Output,
      step3Output: result.step3Output,
      metadata: result.metadata
    });

    // Save directly to MongoDB
    await newPetition.save();

    // Send final result step
    res.write(JSON.stringify({ step: 4, status: 'completed', result: formatPetition(newPetition) }) + '\n');
    res.end();
  } catch (error) {
    console.error('Petition Pipeline error:', error);
    res.write(JSON.stringify({ status: 'error', message: error.message }) + '\n');
    res.end();
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
