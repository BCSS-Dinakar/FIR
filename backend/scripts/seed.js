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

    // 2. Seed 50 Dummy Petitions & FIRs
    const petitions = [];
    const firs = [];
    const firstNames = ['Ravi', 'Suresh', 'Ramesh', 'Laxmi', 'Venkat', 'Mohan', 'Arun', 'Priya', 'Kavitha', 'Srinivas'];
    const lastNames = ['Kumar', 'Sharma', 'Reddy', 'Rao', 'Devi', 'Goud', 'Yadav', 'Patil', 'Naidu', 'Chary'];
    const bnsSections = [
      'BNS 318 (Cheating)', 'BNS 120B (Criminal Conspiracy)', 'BNS 336 (Forgery)',
      'BNS 84 (Dowry Harassment)', 'BNS 303 (Theft)', 'BNS 331 (House-trespass)',
      'BNS 115 (Hurt)', 'BNS 103 (Murder)', 'BNS 351 (Assault)', 'BNS 304 (Extortion)'
    ];

    for (let i = 1; i <= 50; i++) {
      const cFirst = firstNames[Math.floor(Math.random() * firstNames.length)];
      const cLast = lastNames[Math.floor(Math.random() * lastNames.length)];
      const aFirst = firstNames[Math.floor(Math.random() * firstNames.length)];
      const aLast = lastNames[Math.floor(Math.random() * lastNames.length)];
      
      const complainantName = `${cFirst} ${cLast}`;
      const accusedName = `${aFirst} ${aLast}`;
      
      const numSections = Math.floor(Math.random() * 3) + 1;
      const selectedSections = [];
      for (let j = 0; j < numSections; j++) {
        const sec = bnsSections[Math.floor(Math.random() * bnsSections.length)];
        if (!selectedSections.includes(sec)) selectedSections.push(sec);
      }

      const score = Math.floor(Math.random() * 41) + 60; // 60 to 100
      let status = 'Pending Filing';
      const blockers = [];
      let step3Valid = true;

      if (score < 80) {
        blockers.push("Missing Complainant Relative reference (Father/Husband's name)");
        step3Valid = false;
      }
      
      let firNo = '';
      let filedAt = '';
      if (score >= 90 && Math.random() > 0.5) {
        status = 'FIR Filed';
        firNo = `FIR/HYD/2026/${1000 + i}`;
        filedAt = new Date().toISOString();
      }

      const petitionData = {
        id: `PET-2026-${1000 + i}`,
        petitionNo: `PET/HYD/2026/${1000 + i}`,
        date: i % 3 === 0 ? 'Yesterday' : (i % 2 === 0 ? 'Just now' : '1 hour ago'),
        complainant: complainantName,
        accused: accusedName,
        sections: selectedSections,
        score: score,
        status: status,
        blockers: blockers,
        sourceFile: `complaint_doc_${i}.pdf`,
        firNo: firNo,
        filedAt: filedAt,
        district: firNo ? 'Hyderabad' : '',
        policeStation: firNo ? 'PS/HYD/04' : '',
        gdNumber: firNo ? `GD-2026-${2000 + i}` : '',
        incidentDate: firNo ? '2026-06-10' : '',
        incidentTime: firNo ? '10:30' : '',
        occurrencePlace: firNo ? 'Banjara Hills, Hyderabad' : '',
        complainantRelative: firNo ? aLast : '',
        complainantPhone: firNo ? `9876543${100 + i}` : '',
        complainantAddress: firNo ? 'Banjara Hills, Hyderabad' : '',
        incidentFacts: `Complaint by ${complainantName} against ${accusedName} regarding ${selectedSections.join(', ')}`,
        step1Output: `COMPLAINT\nComplainant: ${complainantName}\nAccused: ${accusedName}\nSections: ${selectedSections.join(', ')}`,
        step2Output: `COMPLAINT\nComplainant: ${complainantName}\nAccused: ${accusedName}\nSections: ${selectedSections.join(', ')}`,
        step3Output: { valid: step3Valid, missing_fields: blockers },
        metadata: { complainant: complainantName, accused: accusedName, sections: selectedSections }
      };

      petitions.push(petitionData);

      if (status === 'FIR Filed') {
        firs.push({
          firNo: petitionData.firNo,
          petitionId: petitionData.id,
          complainant: petitionData.complainant,
          accused: petitionData.accused,
          sections: petitionData.sections,
          filedAt: petitionData.filedAt,
          district: petitionData.district,
          policeStation: petitionData.policeStation,
          gdNumber: petitionData.gdNumber,
          incidentDate: petitionData.incidentDate,
          incidentTime: petitionData.incidentTime,
          occurrencePlace: petitionData.occurrencePlace,
          complainantRelative: petitionData.complainantRelative,
          complainantPhone: petitionData.complainantPhone,
          complainantAddress: petitionData.complainantAddress,
          incidentFacts: petitionData.incidentFacts
        });
      }
    }

    await Petition.create(petitions);
    console.log('📄 Petitions seeded successfully.');

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
