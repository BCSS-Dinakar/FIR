const mongoose = require('mongoose');

const FIRSchema = new mongoose.Schema({
  // === Core identifiers ===
  firNo: { type: String, required: true, unique: true, trim: true },
  petitionId: { type: String, required: true, trim: true },

  // === Section 1: Registration Details ===
  district:       { type: String, default: '' },
  policeStation:  { type: String, default: '' },
  year:           { type: String, default: '' },
  firDate:        { type: String, default: '' },
  firTime:        { type: String, default: '' },

  // === Section 2: Acts & Sections ===
  sections: { type: [String], default: [] },

  // === Section 3: Occurrence & Receipt ===
  occurrenceDay:       { type: String, default: '' },
  occurrenceDateFrom:  { type: String, default: '' },
  occurrenceTimeFrom:  { type: String, default: '' },
  occurrenceDateTo:    { type: String, default: '' },
  occurrenceTimeTo:    { type: String, default: '' },
  priorToTimePeriod:   { type: String, default: '' },
  receivedDate:        { type: String, default: '' },
  receivedTime:        { type: String, default: '' },
  gdEntryNo:           { type: String, default: '' },
  gdDateTime:          { type: String, default: '' },

  // === Section 4: Type of Information ===
  typeOfInformation: { type: String, default: 'Written' },

  // === Section 5: Place of Occurrence ===
  distanceDirection:     { type: String, default: '' },
  beatNo:                { type: String, default: '' },
  occurrenceAddress:     { type: String, default: '' },
  outsideLimitPSName:    { type: String, default: '' },
  outsideLimitDistrict:  { type: String, default: '' },

  // === Section 6: Complainant / Informant ===
  complainant:                  { type: String, default: '' },
  complainantRelative:          { type: String, default: '' },
  complainantDob:               { type: String, default: '' },
  complainantAge:               { type: String, default: '' },
  complainantNationality:       { type: String, default: 'India' },
  complainantCaste:             { type: String, default: '' },
  complainantPassport:          { type: String, default: '' },
  complainantPassportIssueDate: { type: String, default: '' },
  complainantPassportIssuePlace:{ type: String, default: '' },
  complainantOccupation:        { type: String, default: '' },
  complainantPhone:             { type: String, default: '' },
  complainantAddress:           { type: String, default: '' },

  // === Section 7: Accused Details (array of suspect objects) ===
  accused:     { type: String, default: '' },    // comma-joined names for quick display
  accusedList: { type: mongoose.Schema.Types.Mixed, default: [] }, // full accused objects

  // === Section 8: Reasons for Delay ===
  reasonsForDelay: { type: String, default: '' },

  // === Section 9 & 10: Properties Stolen ===
  propertiesStolen: { type: String, default: '' },
  totalValueStolen: { type: String, default: '' },

  // === Section 11: Inquest Report ===
  inquestReport: { type: String, default: '' },

  // === Section 12: Contents of Complaint (Brief Facts) ===
  incidentFacts: { type: String, default: '' },

  // === Section 13: Action Taken ===
  actionTaken:               { type: String, default: '1' },
  refusedInvestigationDueTo: { type: String, default: '' },
  transferredPS:             { type: String, default: '' },
  transferredDistrict:       { type: String, default: '' },

  // === Section 14: Officer Details ===
  officerName: { type: String, default: '' },
  officerRank: { type: String, default: '' },
  officerNo:   { type: String, default: '' },

  // === Section 15: Dispatch Details ===
  dispatchDateTime: { type: String, default: '' },

  // === Filing metadata ===
  filedAt: { type: String, required: true }

}, {
  timestamps: true
});

module.exports = mongoose.model('FIR', FIRSchema);
