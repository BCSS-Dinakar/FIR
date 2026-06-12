const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const connectDB = require('../config/db');
const User = require('../models/User');
const Petition = require('../models/Petition');
const FIR = require('../models/FIR');

const seedData = async () => {
  try {
    await connectDB();

    // Clear existing data
    await User.deleteMany({});
    await Petition.deleteMany({});
    await FIR.deleteMany({});
    console.log('🗑️ Existing database collections cleared.');

    // 1. Seed Users
    const users = [
      {
        name: 'Insp. Shiva Kumar',
        badge: 'TS-9923',
        email: 'shiva@firaudit.gov.in',
        mobile: '9876543211',
        station: 'PS/HYD/04',
        password: 'password123',
        rank: 'Inspector'
      },
      {
        name: 'Insp. Reddy',
        badge: 'TS-5544',
        email: 'reddy@firaudit.gov.in',
        mobile: '9876543212',
        station: 'PS/HYD/04',
        password: 'password123',
        rank: 'Inspector'
      },
      {
        name: 'Sub-Insp. Raju',
        badge: 'SI/HYD/2214',
        email: 'raju@firaudit.gov.in',
        mobile: '9876543213',
        station: 'PS/HYD/04',
        password: 'password123',
        rank: 'Sub-Inspector'
      }
    ];

    await User.create(users);
    console.log('👥 Users seeded successfully.');

    // 2. Seed Petitions
    const petitions = [
      {
        id: 'PET-2026-834',
        petitionNo: 'PET/HYD/2026/572',
        date: 'Just now',
        complainant: 'Ravi Kumar Sharma',
        accused: 'Suresh Reddy and Ramu @ Ramesh',
        sections: ['BNS 318 (Cheating)', 'BNS 120B (Criminal Conspiracy)', 'BNS 336 (Forgery)'],
        score: 95,
        status: 'Pending Filing',
        blockers: [],
        sourceFile: 'sample_fir_complaint.txt',
        firNo: '',
        filedAt: '',
        district: '',
        policeStation: '',
        gdNumber: '',
        incidentDate: '',
        incidentTime: '',
        occurrencePlace: '',
        complainantRelative: '',
        complainantPhone: '',
        complainantAddress: '',
        incidentFacts: '',
        step1Output: 'POLICE COMPLAINT / FIR PETITION\nDate of Complaint: 09/06/2026\nComplainant: Ravi Kumar Sharma\nAccused: Suresh Reddy and Ramu @ Ramesh\nSections: Cheating, Criminal Conspiracy, Forgery.',
        step2Output: 'POLICE COMPLAINT / FIR PETITION\nDate of Complaint: 09/06/2026\nComplainant: Ravi Kumar Sharma\nAccused: Suresh Reddy and Ramu @ Ramesh\nSections: Cheating, Criminal Conspiracy, Forgery.',
        step3Output: { valid: true, missing_fields: [] },
        metadata: { complainant: 'Ravi Kumar Sharma', accused: 'Suresh Reddy and Ramu @ Ramesh', sections: ['BNS 318 (Cheating)', 'BNS 120B (Criminal Conspiracy)', 'BNS 336 (Forgery)'] }
      },
      {
        id: 'PET-2026-901',
        petitionNo: 'PET/HYD/2026/901',
        date: '1 hour ago',
        complainant: 'A. Venkat Rao',
        accused: 'Unknown person',
        sections: ['BNS 303 (Theft)'],
        score: 60,
        status: 'Pending Filing',
        blockers: [
          "Missing Complainant Relative reference (Father/Husband's name)",
          "Missing Complainant Mobile phone number contact"
        ],
        sourceFile: 'theft_complaint.png',
        firNo: '',
        filedAt: '',
        district: '',
        policeStation: '',
        gdNumber: '',
        incidentDate: '',
        incidentTime: '',
        occurrencePlace: '',
        complainantRelative: '',
        complainantPhone: '',
        complainantAddress: '',
        incidentFacts: '',
        step1Output: 'COMPLAINT\nTheft of mobile phone and wallet on Banjara Hills Road No 4. Complainant: A. Venkat Rao',
        step2Output: 'COMPLAINT\nTheft of mobile phone and wallet on Banjara Hills Road No 4. Complainant: A. Venkat Rao',
        step3Output: { valid: false, missing_fields: ["Missing Complainant Relative reference (Father/Husband's name)", "Missing Complainant Mobile phone number contact"] },
        metadata: { complainant: 'A. Venkat Rao', accused: 'Unknown person', sections: ['BNS 303 (Theft)'] }
      },
      {
        id: 'PET-2026-102',
        petitionNo: 'PET/HYD/2026/102',
        date: 'Yesterday',
        complainant: 'M. Laxmi Devi',
        accused: 'K. Mohan Rao',
        sections: ['BNS 84 (Dowry Harassment)'],
        score: 95,
        status: 'FIR Filed',
        blockers: [],
        sourceFile: 'dowry_harassment_petition.pdf',
        firNo: 'FIR/HYD/2026/102',
        filedAt: '2026-06-11, 15:45:00',
        district: 'Hyderabad',
        policeStation: 'PS/HYD/04',
        gdNumber: 'GD-2026-1022',
        incidentDate: '2026-06-10',
        incidentTime: '10:30',
        occurrencePlace: 'Banjara Hills, Hyderabad',
        complainantRelative: 'K. Mohan Rao',
        complainantPhone: '9876543220',
        complainantAddress: 'Banjara Hills Road No 12, Hyderabad',
        incidentFacts: 'The complainant alleged harassment for dowry by her husband K. Mohan Rao since their marriage. AI mapped BNS Section 84 for dowry harassment.',
        step1Output: 'COMPLAINT PETITION\nHarassment for dowry by husband Mohan Rao. Complainant: M. Laxmi Devi.',
        step2Output: 'COMPLAINT PETITION\nHarassment for dowry by husband Mohan Rao. Complainant: M. Laxmi Devi.',
        step3Output: { valid: true, missing_fields: [] },
        metadata: { complainant: 'M. Laxmi Devi', accused: 'K. Mohan Rao', sections: ['BNS 84 (Dowry Harassment)'] }
      }
    ];

    await Petition.create(petitions);
    console.log('📄 Petitions seeded successfully.');

    // 3. Seed matching FIR
    const firs = [
      {
        firNo: 'FIR/HYD/2026/102',
        petitionId: 'PET-2026-102',
        complainant: 'M. Laxmi Devi',
        accused: 'K. Mohan Rao',
        sections: ['BNS 84 (Dowry Harassment)'],
        filedAt: '2026-06-11, 15:45:00',
        district: 'Hyderabad',
        policeStation: 'PS/HYD/04',
        gdNumber: 'GD-2026-1022',
        incidentDate: '2026-06-10',
        incidentTime: '10:30',
        occurrencePlace: 'Banjara Hills, Hyderabad',
        complainantRelative: 'K. Mohan Rao',
        complainantPhone: '9876543220',
        complainantAddress: 'Banjara Hills Road No 12, Hyderabad',
        incidentFacts: 'The complainant alleged harassment for dowry by her husband K. Mohan Rao since their marriage. AI mapped BNS Section 84 for dowry harassment.'
      }
    ];

    await FIR.create(firs);
    console.log('🚔 Filed FIRs seeded successfully.');

    console.log('✅ Seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

seedData();
