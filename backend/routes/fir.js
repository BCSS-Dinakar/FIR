const express = require('express');
const firsRepo = require('../repositories/firsRepo');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const firs = await firsRepo.list({ search: req.query.search });
    return res.status(200).json(firs);
  } catch (error) {
    console.error('Fetch FIRs error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const fir = await firsRepo.create(req.body);
    return res.status(201).json(fir);
  } catch (error) {
    console.error('Save FIR error:', error);
    const status = error.code === 'PETITION_NOT_FOUND' ? 404 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
});

router.get('/by-petition/:petitionId', async (req, res) => {
  try {
    const fir = await firsRepo.findByPetitionLegacyId(req.params.petitionId);
    if (!fir) {
      return res.status(404).json({
        success: false,
        message: 'FIR not found for this petition'
      });
    }
    return res.status(200).json(fir);
  } catch (error) {
    console.error('Fetch FIR by petition error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
