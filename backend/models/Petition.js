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

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

PetitionSchema.virtual('firRecord', {
  ref: 'FIR',
  localField: 'firNo',
  foreignField: 'firNo',
  justOne: true
});

module.exports = mongoose.model('Petition', PetitionSchema);
