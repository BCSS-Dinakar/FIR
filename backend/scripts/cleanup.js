const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const connectDB = require('../config/db');
const User = require('../models/User');
const Petition = require('../models/Petition');
const FIR = require('../models/FIR');

const cleanupData = async () => {
  try {
    await connectDB();

    // Clear existing data
    await User.deleteMany({});
    await Petition.deleteMany({});
    await FIR.deleteMany({});
    console.log('🗑️ Database cleared successfully! (Users, Petitions, and FIRs have been erased)');
    process.exit(0);
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
};

cleanupData();
