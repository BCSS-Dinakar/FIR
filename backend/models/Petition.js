const mongoose = require('mongoose');

const PetitionSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  petitionNo: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  date: {
    type: String,
    required: true
  },
  complainant: {
    type: String,
    default: 'Unknown'
  },
  accused: {
    type: String,
    default: 'Unknown'
  },
  sections: {
    type: [String],
    default: []
  },
  score: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    default: 'Pending Filing'
  },
  blockers: {
    type: [String],
    default: []
  },
  sourceFile: {
    type: String,
    required: true
  },
  step1Output: {
    type: String,
    default: ''
  },
  step2Output: {
    type: String,
    default: ''
  },
  step3Output: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  firNo: {
    type: String,
    default: ''
  },
  filedAt: {
    type: String,
    default: ''
  },
  // Custom CCTNS fields (stored if filed)
  district: { type: String, default: '' },
  policeStation: { type: String, default: '' },
  gdNumber: { type: String, default: '' },
  incidentDate: { type: String, default: '' },
  incidentTime: { type: String, default: '' },
  occurrencePlace: { type: String, default: '' },
  complainantRelative: { type: String, default: '' },
  complainantPhone: { type: String, default: '' },
  complainantAddress: { type: String, default: '' },
  incidentFacts: { type: String, default: '' }
}, {
  timestamps: true
});

module.exports = mongoose.model('Petition', PetitionSchema);
