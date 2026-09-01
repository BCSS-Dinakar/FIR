const express = require('express');
const multer = require('multer');
const fs = require('fs');
const petitionsRepo = require('../repositories/petitionsRepo');
const firsRepo = require('../repositories/firsRepo');
const usersRepo = require('../repositories/usersRepo');
const { runPetitionPipeline, runPipelineStep1, runPipelineStep2, runPipelineStep3, runPipelineStep4 } = require('../services/firPipeline');
const bnsCatalogService = require('../services/bnsCatalogService');
const { extractFirFields } = require('../services/firAutofillService');

const router = express.Router();

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }
});

const formatPetition = (p) => {
  if (!p) return null;
  return {
    _id: p._id || p.id,
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
    firNo: p.firNo || '',
    filedAt: p.filedAt || '',
    district: p.district || '',
    policeStation: p.policeStation || '',
    gdNumber: p.gdNumber || '',
    incidentDate: p.incidentDate || '',
    incidentTime: p.incidentTime || '',
    occurrencePlace: p.occurrencePlace || '',
    complainantRelative: p.complainantRelative || '',
    complainantPhone: p.complainantPhone || '',
    complainantAddress: p.complainantAddress || '',
    incidentFacts: p.incidentFacts || '',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    __v: 0
  };
};

router.get('/draftandfile', async (req, res) => {
  try {
    const petitions = await petitionsRepo.list({ filter: { withoutBlockers: true } });
    const formatted = petitions.map(formatPetition);
    const totalScanned = await petitionsRepo.count();
    const pendingFiling = await petitionsRepo.count({ filter: { status: 'Pending Filing' } });
    const firsRegistered = await petitionsRepo.count({ filter: { status: 'FIR Filed' } });

    return res.status(200).json({
      success: true,
      petitions: formatted,
      stats: { totalScanned, pendingFiling, firsRegistered }
    });
  } catch (error) {
    console.error('Fetch draftandfile error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/mistakesandwarnings', async (req, res) => {
  try {
    const petitions = await petitionsRepo.list({ filter: { withBlockers: true } });
    const formatted = petitions.map(formatPetition);
    const activeMistakes = await petitionsRepo.countActiveBlockers();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const all = await petitionsRepo.list();
    const resolvedTodayCount = all.filter((p) => {
      const blockers = p.blockers || [];
      const updated = p.updatedAt ? new Date(p.updatedAt) : null;
      const created = p.createdAt ? new Date(p.createdAt) : null;
      return (
        blockers.length === 0 &&
        updated &&
        updated >= startOfToday &&
        created &&
        updated.getTime() !== created.getTime()
      );
    }).length;

    const resolvedWithDiff = all.filter((p) => {
      const blockers = p.blockers || [];
      return (
        blockers.length === 0 &&
        p.createdAt &&
        p.updatedAt &&
        new Date(p.updatedAt).getTime() !== new Date(p.createdAt).getTime()
      );
    });
    let avgResolutionTime = '--';
    if (resolvedWithDiff.length) {
      const avgMs =
        resolvedWithDiff.reduce(
          (sum, p) => sum + (new Date(p.updatedAt) - new Date(p.createdAt)),
          0
        ) / resolvedWithDiff.length;
      avgResolutionTime = `${Math.round(avgMs / (1000 * 60))} min`;
    }

    return res.status(200).json({
      success: true,
      petitions: formatted,
      stats: {
        activeMistakes,
        avgResolutionTime,
        resolvedToday: String(resolvedTodayCount)
      }
    });
  } catch (error) {
    console.error('Fetch mistakesandwarnings error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const scoreRows = await petitionsRepo.scoresAscending();
    const scores = scoreRows.map((p) => p.score);

    const all = await petitionsRepo.list();
    const blockerCounts = {};
    all.forEach((p) => {
      (p.blockers || []).forEach((b) => {
        blockerCounts[b] = (blockerCounts[b] || 0) + 1;
      });
    });

    const users = await usersRepo.listPublic();
    const officers = users.map((user) => {
      const parts = user.name
        .replace(/^(Insp\.|Sub-Insp\.|Asst\.|Insp|SI|ASI|DSP|Constable)\.?\s+/i, '')
        .split(' ');
      const initials =
        parts.length >= 2
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
        trend: null,
        initials,
        color: colors[colorIdx],
        badge: user.badge
      };
    });

    officers.sort((a, b) => (b.score || 0) - (a.score || 0));
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

router.get('/counts', async (req, res) => {
  try {
    const activeMistakesCount = await petitionsRepo.countActiveBlockers();
    const pending = await petitionsRepo.list({
      filter: { status: 'Pending Filing', withoutBlockers: true }
    });
    return res.status(200).json({
      success: true,
      activeMistakesCount,
      pendingFilingCount: pending.length
    });
  } catch (error) {
    console.error('Fetch counts error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/firstatusboard', async (req, res) => {
  try {
    const petitions = await petitionsRepo.list();
    const firs = await firsRepo.list();
    const formattedPetitions = petitions.map(formatPetition);
    const totalChecked = await petitionsRepo.count();
    const pendingReview = (
      await petitionsRepo.list({
        filter: { status: 'Pending Filing', withoutBlockers: true }
      })
    ).length;

    const avg =
      petitions.length === 0
        ? 0
        : petitions.reduce((s, p) => s + (p.score || 0), 0) / petitions.length;
    const avgAccuracy = `${avg.toFixed(1)}%`;
    const unresolvedMistakes = await petitionsRepo.countActiveBlockers();

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

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.hasBlockers === 'true') filter.withBlockers = true;
    if (req.query.hasBlockers === 'false') filter.withoutBlockers = true;
    if (req.query.search) filter.search = req.query.search;

    const petitions = await petitionsRepo.list({ filter });
    return res.status(200).json(petitions.map(formatPetition));
  } catch (error) {
    console.error('Fetch petitions error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/bns-sections', async (req, res) => {
  try {
    const { search = '', recommended, petitionId } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    let recommendedRaw = [];
    let confidenceByCode = {};
    if (petitionId) {
      const petition = await petitionsRepo.findByLegacyId(petitionId);
      if (petition) {
        const recs = Array.isArray(petition.sectionRecommendations)
          ? petition.sectionRecommendations
          : [];
        if (recs.length > 0) {
          recommendedRaw = recs.map((r) => r.code);
          confidenceByCode = Object.fromEntries(recs.map((r) => [r.code, r.confidence]));
        } else {
          recommendedRaw = petition.sections || [];
        }
      }
    } else if (recommended) {
      recommendedRaw = recommended
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const resolvedRecommended = await bnsCatalogService.resolveCodes(recommendedRaw);
    const recommendedSections = resolvedRecommended.map((entry) => ({
      ...entry,
      confidence: confidenceByCode[entry.code] ?? null
    }));
    const { results: allSections, total } = await bnsCatalogService.searchCatalog(search, {
      limit,
      offset
    });

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

router.get('/:id/autofill-fir', async (req, res) => {
  try {
    const petition = await petitionsRepo.findByLegacyId(req.params.id);
    if (!petition) {
      return res.status(404).json({ success: false, message: 'Petition not found' });
    }

    const cached = petition.metadata?.firAutofill;
    if (cached && req.query.refresh !== 'true') {
      return res.status(200).json({ success: true, fields: cached, cached: true });
    }

    const sourceText = petition.step2Output || petition.step1Output;
    if (!sourceText) {
      return res.status(422).json({
        success: false,
        message: 'No petition text available to extract from.'
      });
    }

    const fields = await extractFirFields(sourceText);
    const metadata = { ...(petition.metadata || {}), firAutofill: fields };
    await petitionsRepo.updateByLegacyId(req.params.id, { metadata });

    return res.status(200).json({ success: true, fields, cached: false });
  } catch (error) {
    console.error('FIR autofill error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const petition = await petitionsRepo.findByLegacyId(req.params.id);
    if (!petition) {
      return res.status(404).json({ success: false, message: 'Petition not found' });
    }
    return res.status(200).json(petition);
  } catch (error) {
    console.error('Fetch single petition error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const petition = await petitionsRepo.create(req.body);
    return res.status(201).json(formatPetition(petition));
  } catch (error) {
    console.error('Save petition error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await petitionsRepo.updateByLegacyId(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Petition not found' });
    }
    return res.status(200).json(formatPetition(updated));
  } catch (error) {
    console.error('Update petition error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const petition = await petitionsRepo.findByLegacyId(req.params.id);
    if (!petition) {
      return res.status(404).json({ success: false, message: 'Petition not found' });
    }
    if (petition.status === 'FIR Filed') {
      return res.status(409).json({
        success: false,
        message: 'This petition has an FIR filed against it and cannot be deleted.'
      });
    }
    await petitionsRepo.deleteByLegacyId(req.params.id);
    return res.status(200).json({ success: true, message: 'Petition deleted' });
  } catch (error) {
    console.error('Delete petition error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/pipeline/step/1', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file was uploaded.' });
  }

  try {
    const result = await runPipelineStep1(req.file);
    return res.json({ success: true, step: 1, ...result });
  } catch (error) {
    console.error('Pipeline step 1 error:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    }
  }
});

router.post('/pipeline/step/2', async (req, res) => {
  try {
    const step1Output = req.body?.step1Output;
    if (!step1Output || typeof step1Output !== 'string') {
      return res.status(400).json({ success: false, message: 'step1Output text is required.' });
    }
    const result = await runPipelineStep2(step1Output);
    return res.json({ success: true, step: 2, ...result });
  } catch (error) {
    console.error('Pipeline step 2 error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/pipeline/step/3', async (req, res) => {
  try {
    const step2Output = req.body?.step2Output;
    if (!step2Output || typeof step2Output !== 'string') {
      return res.status(400).json({ success: false, message: 'step2Output text is required.' });
    }
    const result = await runPipelineStep3(step2Output);
    return res.json({ success: true, step: 3, ...result });
  } catch (error) {
    console.error('Pipeline step 3 error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/pipeline/finalize', async (req, res) => {
  try {
    const {
      step1Output,
      step2Output,
      step3Output,
      metadata: clientMetadata,
      sourceFile
    } = req.body || {};

    console.log(
      `[Pipeline Finalize] POST /pipeline/finalize — source=${sourceFile || 'upload'}, ` +
        `valid=${step3Output?.valid}, complainant=${clientMetadata?.complainant || '?'}`
    );

    if (!step2Output || !step3Output) {
      return res.status(400).json({ success: false, message: 'step2Output and step3Output are required.' });
    }

    const { metadata } = await runPipelineStep4(
      step2Output,
      step3Output,
      clientMetadata || {}
    );

    const blockers = step3Output?.missing_fields;
    const valid = step3Output?.valid;
    const score = valid ? 95 : Math.max(40, 90 - (blockers ? blockers.length : 0) * 15);
    const newId = `PET-2026-${Math.floor(100 + Math.random() * 900)}`;
    const petNo = `PET/HYD/2026/${Math.floor(100 + Math.random() * 900)}`;
    const dateFormatted = new Date().toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    console.log(`[Pipeline Finalize] Saving petition ${petNo} (id=${newId}, score=${score})...`);

    const newPetition = await petitionsRepo.create({
      id: newId,
      petitionNo: petNo,
      date: dateFormatted,
      complainant: metadata.complainant,
      accused: metadata.accused,
      sections: metadata.sections,
      sectionRecommendations: metadata.sectionRecommendations,
      score,
      status: 'Pending Filing',
      blockers,
      sourceFile: sourceFile || 'upload',
      step1Output: step1Output || '',
      step2Output,
      step3Output,
      metadata
    });

    console.log(
      `[Pipeline Finalize] Saved ${petNo}. sections=${(metadata.sections || []).length}, ` +
        `blockers=${(blockers || []).length}.`
    );

    return res.json({ success: true, step: 4, result: formatPetition(newPetition) });
  } catch (error) {
    console.error('Pipeline finalize error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/pipeline', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file was uploaded.' });
  }

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.writeHead(200);

  try {
    const onStep = (data) => {
      res.write(`${JSON.stringify(data)}\n`);
    };

    const result = await runPetitionPipeline(req.file, onStep);
    const complainant = result.metadata?.complainant;
    const accused = result.metadata?.accused;
    const sections = result.metadata?.sections;
    const sectionRecommendations = result.metadata?.sectionRecommendations || [];
    const blockers = result.step3Output?.missing_fields;
    const valid = result.step3Output?.valid;
    const score = valid ? 95 : Math.max(40, 90 - (blockers ? blockers.length : 0) * 15);
    const newId = `PET-2026-${Math.floor(100 + Math.random() * 900)}`;
    const petNo = `PET/HYD/2026/${Math.floor(100 + Math.random() * 900)}`;
    const dateFormatted = new Date().toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const newPetition = await petitionsRepo.create({
      id: newId,
      petitionNo: petNo,
      date: dateFormatted,
      complainant,
      accused,
      sections,
      sectionRecommendations,
      score,
      status: 'Pending Filing',
      blockers,
      sourceFile: req.file.originalname,
      step1Output: result.step1Output,
      step2Output: result.step2Output,
      step3Output: result.step3Output,
      metadata: result.metadata
    });

    res.write(
      `${JSON.stringify({ step: 4, status: 'completed', result: formatPetition(newPetition) })}\n`
    );
    res.end();
  } catch (error) {
    console.error('Petition Pipeline error:', error);
    res.write(`${JSON.stringify({ status: 'error', message: error.message })}\n`);
    res.end();
  } finally {
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
