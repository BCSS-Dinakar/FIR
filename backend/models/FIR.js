const mongoose = require('mongoose');

const FIRSchema = new mongoose.Schema({
  firNo: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  petitionId: {
    type: String,
    required: true,
    trim: true
  },
  complainant: {
    type: String,
    required: true
  },
  accused: {
    type: String,
    required: true
  },
  sections: {
    type: [String],
    default: []
  },
  filedAt: {
    type: String,
    required: true
  },
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

module.exports = mongoose.model('FIR', FIRSchema);
