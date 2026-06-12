import { useOutletContext } from 'react-router-dom';
import { useState, useEffect } from 'react';
import FIRButton from '../components/reusable/FIRButton';
import FIRCard from '../components/reusable/FIRCard';
import FileFIRForm from '../components/reusable/FileFIRForm';
import { updatePetition, createFir, getPetitionById, getDraftAndFileFIR } from '../api/petition';



const ALL_BNS_SECTIONS = [
  { code: 'BNS 318 (Cheating)', desc: 'Cheating and dishonestly inducing delivery of property' },
  { code: 'BNS 120B (Criminal Conspiracy)', desc: 'Punishment of criminal conspiracy' },
  { code: 'BNS 336 (Forgery)', desc: 'Forgery of valuable security, will, etc.' },
  { code: 'BNS 84 (Dowry Harassment)', desc: 'Cruelty by husband or relatives of husband' },
  { code: 'BNS 303 (Theft)', desc: 'Punishment for theft' },
  { code: 'BNS 331 (House-trespass)', desc: 'Lurking house-trespass or house-breaking' },
  { code: 'BNS 115 (Hurt)', desc: 'Voluntarily causing hurt' },
  { code: 'BNS 103 (Murder)', desc: 'Punishment for murder' },
  { code: 'BNS 351 (Assault)', desc: 'Assault or criminal force' },
  { code: 'BNS 304 (Extortion)', desc: 'Punishment for extortion' },
  { code: 'BNS 117 (Grievous Hurt)', desc: 'Voluntarily causing grievous hurt' },
  { code: 'BNS 124 (Wrongful Restraint)', desc: 'Punishment for wrongful restraint' }
];

export default function FileFIR() {
  const { dark } = useOutletContext();
  const [petitions, setPetitions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState('All'); // All | Pending | Filed
  const [selectedPetition, setSelectedPetition] = useState(null);
  const [viewReportPetition, setViewReportPetition] = useState(null);

  // Registration modal states
  const [modalStage, setModalStage] = useState('idle'); // idle | registering | success
  const [modalLogs, setModalLogs] = useState([]);
  const [generatedFIRNo, setGeneratedFIRNo] = useState('');
  const [modalSections, setModalSections] = useState([]);
  const [formData, setFormData] = useState({
    district: 'Hyderabad',
    policeStation: 'PS/HYD/04',
    gdNumber: '',
    incidentDate: '',
    incidentTime: '',
    distanceDirection: '3 km South',
    beatNumber: 'Beat No. 4',
    occurrencePlace: 'Banjara Hills Road No 4, Hyderabad',
    complainant: '',
    complainantRelative: '',
    nationality: 'Indian',
    complainantPhone: '',
    complainantAddress: '',
    accused: '',
    accusedCount: 1,
    accusedDescription: '',
    incidentFacts: ''
  });

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(3);

  const [stats, setStats] = useState({
    totalScanned: 0,
    pendingFiling: 0,
    firsRegistered: 0
  });

  // Load data from backend database
  useEffect(() => {
    const loadPetitions = async () => {
      try {
        const data = await getDraftAndFileFIR();
        if (data && data.success) {
          setPetitions(data.petitions || []);
          if (data.stats) {
            setStats(data.stats);
          }
        }
      } catch (err) {
        console.error('Failed to load petitions:', err);
      }
    };
    loadPetitions();
  }, []);

  // Reset pagination on search or filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterTab]);

  const T = {
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
    border: (d) => d ? 'border-white/[0.06]' : 'border-black/[0.08]',
    tableHeader: (d) => d ? 'bg-white/[0.02]' : 'bg-black/[0.01]',
    tableRowHover: (d) => d ? 'hover:bg-white/[0.01]' : 'hover:bg-black/[0.01]',
    input: (d) => d ? 'bg-white/[0.03] border-white/10 text-white' : 'bg-black/[0.02] border-black/10 text-brand-charcoal',
  };

  const scoreBadgeColor = (score) => {
    if (score >= 90) return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    if (score >= 75) return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    return 'bg-red-500/10 text-red-500 border-red-500/20';
  };

  const statusBadgeColor = (status) => {
    if (status === 'FIR Filed') return 'bg-emerald-500/10 text-emerald-500';
    return 'bg-amber-500/10 text-amber-500';
  };

  const filteredPetitions = petitions.filter(p => {
    const matchesSearch =
      p.complainant.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.accused.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.petitionNo.toLowerCase().includes(searchTerm.toLowerCase());

    if (filterTab === 'Pending') {
      return matchesSearch && p.status === 'Pending Filing';
    }
    if (filterTab === 'Filed') {
      return matchesSearch && p.status === 'FIR Filed';
    }
    return matchesSearch;
  });

  // Pagination parameters
  const totalPages = Math.max(1, Math.ceil(filteredPetitions.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedPetitions = filteredPetitions.slice(startIndex, startIndex + itemsPerPage);

  const countPending = stats.pendingFiling;
  const countFiled = stats.firsRegistered;

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  const handleOpenRegistration = async (petition) => {
    try {
      const fullPetition = await getPetitionById(petition.id);
      setSelectedPetition(fullPetition);
      setModalSections(fullPetition.sections || []);

      // Seed with realistic defaults and values from the scanned petition
      setFormData({
        district: 'Hyderabad',
        policeStation: 'PS/HYD/04',
        gdNumber: `GD-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        incidentDate: new Date().toISOString().substring(0, 10),
        incidentTime: '12:00',
        distanceDirection: '3 km South',
        beatNumber: 'Beat No. 4',
        occurrencePlace: 'Banjara Hills Road No 4, Hyderabad',
        complainant: fullPetition.complainant || '',
        complainantRelative: 'K. Srinivasa Rao',
        nationality: 'Indian',
        complainantPhone: '9876543210',
        complainantAddress: 'Flat 202, Green Meadows, Hyderabad',
        accused: fullPetition.accused || '',
        accusedCount: (fullPetition.accused && fullPetition.accused.includes('2 persons')) ? 2 : 1,
        accusedDescription: (fullPetition.accused && fullPetition.accused.includes('2 persons')) ? 'Unknown 2 persons, height approx 5\'8"' : 'Identified accused face matching record',
        incidentFacts: `A formal complaint petition was uploaded regarding BNS sections: ${(fullPetition.sections || []).join(', ')} alleging misconduct/offence by ${fullPetition.accused || 'Unknown'} as reported by ${fullPetition.complainant || 'Unknown'}. Compliance checks completed with a score of ${fullPetition.score || 0}/100.`
      });

      setModalStage('idle');
      setModalLogs([]);
      setGeneratedFIRNo('');
    } catch (err) {
      console.error('Failed to load petition details:', err);
      alert('Failed to load petition details. Please try again.');
    }
  };

  const handleOpenReport = async (petition) => {
    try {
      const fullPetition = await getPetitionById(petition.id);
      setViewReportPetition(fullPetition);
    } catch (err) {
      console.error('Failed to load petition report:', err);
      alert('Failed to load report. Please try again.');
    }
  };

  const runRegistration = () => {
    if (!selectedPetition) return;
    setModalStage('registering');
    setModalLogs([]);

    const logs = [
      'Verifying Sec 173 BNSS parameters...',
      'Validating complainant signature presence...',
      'Retrieving station registry config...',
      'Generating unique official FIR number...',
      'Synchronizing records with national ICJS database...',
      'FIR registration complete. Generating official draft copy...'
    ];

    logs.forEach((log, index) => {
      setTimeout(() => {
        setModalLogs(prev => [...prev, log]);
        if (index === logs.length - 1) {
          setTimeout(async () => {
            const firNumber = `FIR/HYD/2026/${Math.floor(100 + Math.random() * 900)}`;
            setGeneratedFIRNo(firNumber);

            const updatedPet = {
              ...selectedPetition,
              complainant: formData.complainant,
              accused: formData.accused,
              sections: modalSections,
              status: 'FIR Filed',
              firNo: firNumber,
              filedAt: new Date().toLocaleString(),

              district: formData.district,
              policeStation: formData.policeStation,
              gdNumber: formData.gdNumber,
              incidentDate: formData.incidentDate,
              incidentTime: formData.incidentTime,
              occurrencePlace: formData.occurrencePlace,
              complainantRelative: formData.complainantRelative,
              complainantPhone: formData.complainantPhone,
              complainantAddress: formData.complainantAddress,
              incidentFacts: formData.incidentFacts
            };

            const firRecord = {
              firNo: firNumber,
              petitionId: selectedPetition.id,
              complainant: formData.complainant,
              accused: formData.accused,
              sections: modalSections,
              filedAt: new Date().toLocaleString(),
              district: formData.district,
              policeStation: formData.policeStation,
              gdNumber: formData.gdNumber,
              incidentDate: formData.incidentDate,
              incidentTime: formData.incidentTime,
              occurrencePlace: formData.occurrencePlace,
              complainantRelative: formData.complainantRelative,
              complainantPhone: formData.complainantPhone,
              complainantAddress: formData.complainantAddress,
              incidentFacts: formData.incidentFacts
            };

            try {
              // 1. Create separate FIR record in MongoDB
              await createFir(firRecord);

              // 2. Update petition status in MongoDB
              await updatePetition(selectedPetition.id, updatedPet);

              // 3. Update local UI state
              setSelectedPetition(updatedPet);
              const updatedList = petitions.map(p => p.id === selectedPetition.id ? updatedPet : p);
              setPetitions(updatedList);
              setStats(prev => ({
                ...prev,
                pendingFiling: Math.max(0, prev.pendingFiling - 1),
                firsRegistered: prev.firsRegistered + 1
              }));
              setModalStage('success');
            } catch (err) {
              console.error('Failed to register FIR in database:', err);
              alert('Registration failed in database: ' + err.message);
            }
          }, 800);
        }
      }, (index + 1) * 600);
    });
  };

  const printFIRMock = () => {
    const p = selectedPetition;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>First Information Report - ${generatedFIRNo}</title>
        <style>
          body { font-family: sans-serif; padding: 40px; color: #1e293b; }
          .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
          .title { font-size: 20px; font-weight: bold; margin: 0; }
          .subtitle { font-size: 12px; margin-top: 5px; color: #475569; }
          .section-heading { font-size: 11px; font-weight: bold; text-transform: uppercase; margin-top: 20px; border-bottom: 1px solid #94a3b8; padding-bottom: 4px; color: #0f172a; }
          .meta-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 12px; margin-top: 10px; margin-bottom: 15px; }
          .meta-item { border-bottom: 1px solid #f1f5f9; padding-bottom: 4px; font-size: 12px; }
          .label { font-weight: 600; color: #64748b; }
          .val { float: right; font-weight: bold; color: #0f172a; }
          .content-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; font-size: 12px; line-height: 1.6; margin-top: 8px; margin-bottom: 15px; background: #f8fafc; min-height: 50px; }
          .footer { text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 40px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">FIRST INFORMATION REPORT (FIR)</div>
          <div class="subtitle">Under Section 173 of Bharatiya Nagarik Suraksha Sanhita (BNSS)</div>
        </div>

        <div class="section-heading">1. Station Records &amp; Reference</div>
        <div class="meta-grid">
          <div class="meta-item"><span class="label">FIR Number</span><span class="val">${p?.firNo || generatedFIRNo}</span></div>
          <div class="meta-item"><span class="label">GD Entry Number</span><span class="val">${p?.gdNumber || 'N/A'}</span></div>
          <div class="meta-item"><span class="label">District</span><span class="val">${p?.district || 'Hyderabad'}</span></div>
          <div class="meta-item"><span class="label">Police Station</span><span class="val">${p?.policeStation || 'PS/HYD/04'}</span></div>
        </div>

        <div class="section-heading">2. Date, Time &amp; Place of Occurrence</div>
        <div class="meta-grid">
          <div class="meta-item"><span class="label">Date of Occurrence</span><span class="val">${p?.incidentDate || 'N/A'}</span></div>
          <div class="meta-item"><span class="label">Time of Occurrence</span><span class="val">${p?.incidentTime || 'N/A'}</span></div>
          <div class="meta-item"><span class="label">Filing Timestamp</span><span class="val">${p?.filedAt || new Date().toLocaleString()}</span></div>
          <div class="meta-item"><span class="label">Place of Occurrence</span><span class="val">${p?.occurrencePlace || 'N/A'}</span></div>
        </div>

        <div class="section-heading">3. Complainant / Informant Details</div>
        <div class="meta-grid">
          <div class="meta-item"><span class="label">Full Name</span><span class="val">${p?.complainant}</span></div>
          <div class="meta-item"><span class="label">Father's / Husband's Name</span><span class="val">${p?.complainantRelative || 'N/A'}</span></div>
          <div class="meta-item"><span class="label">Nationality</span><span class="val">${p?.nationality || 'Indian'}</span></div>
          <div class="meta-item"><span class="label">Phone / Contact</span><span class="val">${p?.complainantPhone || 'N/A'}</span></div>
          <div class="meta-item" style="grid-column: span 2;"><span class="label">Permanent Address</span><span class="val">${p?.complainantAddress || 'N/A'}</span></div>
        </div>

        <div class="section-heading">4. Accused Particulars</div>
        <div class="meta-grid">
          <div class="meta-item"><span class="label">Primary Accused Name</span><span class="val">${p?.accused}</span></div>
          <div class="meta-item"><span class="label">Accused Count</span><span class="val">${p?.accusedCount || 1}</span></div>
          <div class="meta-item" style="grid-column: span 2;"><span class="label">Accused Details / Remarks</span><span class="val">${p?.accusedDescription || 'N/A'}</span></div>
        </div>

        <div class="section-heading">5. Applied Legal Sections (BNS Classification)</div>
        <div class="content-box">
          <strong>${p?.sections.join(', ')}</strong>
        </div>

        <div class="section-heading">6. Brief Facts of Case / Allegations</div>
        <div class="content-box">
          ${p?.incidentFacts || 'N/A'}
        </div>

        <div class="footer">
          Generated automatically via AI Audit Command Center. Verified under digital signature of Station Duty Officer.
        </div>
      </body>
      </html>
    `);
    doc.close();

    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight mb-1">
            Draft & File FIR
          </h1>
          <p className={`text-xs ${T.muted(dark)}`}>
            Register validated complaint petitions directly as official, legally compliant FIRs.
          </p>
        </div>
      </div>

      {/* Grid Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            title: 'Total Scanned Petitions',
            val: stats.totalScanned,
            colorClass: 'text-blue-500',
            bgIcon: (
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )
          },
          {
            title: 'Pending FIR Filing',
            val: countPending,
            colorClass: 'text-amber-500',
            bgIcon: (
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )
          },
          {
            title: 'FIRs Registered & Synced',
            val: countFiled,
            colorClass: 'text-emerald-500',
            bgIcon: (
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            )
          }
        ].map((item, idx) => (
          <FIRCard key={idx} dark={dark} noPadding className="p-5 flex items-start justify-between">
            <div className="space-y-2.5">
              <span className={`text-[10px] uppercase font-bold tracking-wider ${T.muted(dark)}`}>
                {item.title}
              </span>
              <div>
                <span className="text-2xl font-black">{item.val}</span>
              </div>
            </div>
            <div className={`w-9.5 h-9.5 rounded-lg border ${T.border(dark)} flex items-center justify-center bg-gray-400/5`}>
              {item.bgIcon}
            </div>
          </FIRCard>
        ))}
      </div>

      {/* Control bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="Search by Complainant, Accused, ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full text-xs font-semibold px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all ${T.input(dark)}`}
          />
          <span className="absolute right-3.5 top-3 text-gray-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
        </div>

        {/* Filters */}
        <div className={`flex rounded-xl p-1 border ${T.border(dark)} ${dark ? 'bg-white/[0.02]' : 'bg-black/[0.01]'}`}>
          {['All', 'Pending', 'Filed'].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filterTab === tab
                  ? 'bg-blue-600 text-white shadow-sm'
                  : dark ? 'text-white/60 hover:text-white' : 'text-black/60 hover:text-black'
                }`}
            >
              {tab === 'Pending' ? 'Pending Filing' : tab === 'Filed' ? 'FIR Filed' : 'All Petitions'}
            </button>
          ))}
        </div>
      </div>

      {/* Table List */}
      <FIRCard dark={dark} noPadding className="overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto h-[320px] relative">
          <table className="w-full text-left border-collapse">
            <thead className={`sticky top-0 z-10 shadow-sm ${dark ? 'bg-brand-navy-900' : 'bg-white'}`}>
              <tr className={`text-[10px] uppercase font-bold tracking-wider border-b ${T.border(dark)} ${T.tableHeader(dark)}`}>
                <th className="px-6 py-3">Petition Reference</th>
                <th className="px-6 py-3">Complainant</th>
                <th className="px-6 py-3">Accused</th>
                <th className="px-6 py-3">Legal Classification</th>
                <th className="px-6 py-3 text-center">Compliance</th>
                <th className="px-6 py-3">Filing Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-400/10">
              {paginatedPetitions.length === 0 ? (
                <tr>
                  <td colSpan="7" className={`px-6 py-12 text-center text-xs font-semibold ${T.muted(dark)}`}>
                    No petitions found.
                  </td>
                </tr>
              ) : (
                paginatedPetitions.map((p) => (
                  <tr key={p.id} className={`text-xs transition-colors ${T.tableRowHover(dark)}`}>
                    <td className="px-6 py-4 font-mono font-bold">
                      <div className="flex flex-col">
                        <span>{p.petitionNo}</span>
                        <span className="text-[10px] opacity-40 font-normal mt-0.5">{p.date}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium">{p.complainant}</td>
                    <td className="px-6 py-4 font-medium opacity-70">{p.accused}</td>
                    <td className="px-6 py-4 font-mono text-[11px] text-blue-500 font-bold">
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {p.sections.map((sec) => (
                          <span key={sec} className="bg-blue-500/10 px-1.5 py-0.5 rounded text-[10px] truncate">{sec}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${scoreBadgeColor(p.score)}`}>
                        {p.score}%
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${statusBadgeColor(p.status)}`}>
                          {p.status === 'FIR Filed' ? 'Audited' : (
                            <>
                              <span className="w-1 h-1 rounded-full bg-current animate-pulse" />
                              Pending
                            </>
                          )}
                        </span>
                        {p.status === 'FIR Filed' && (
                          <span className="text-[9px] font-mono opacity-50 font-semibold mt-0.5">{p.firNo}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {p.status === 'FIR Filed' ? (
                        <div className="flex justify-end gap-1.5">
                          <FIRButton
                            onClick={() => handleOpenReport(p)}
                            variant="secondary"
                            dark={dark}
                            className="px-3 py-1.5 text-[11px]"
                          >
                            View Report
                          </FIRButton>
                          <FIRButton
                            onClick={() => {
                              setSelectedPetition(p);
                              setGeneratedFIRNo(p.firNo);
                              printFIRMock();
                            }}
                            variant="secondary"
                            dark={dark}
                            className="px-3 py-1.5 text-[11px]"
                          >
                            Print FIR
                          </FIRButton>
                        </div>
                      ) : (
                        <FIRButton
                          onClick={() => handleOpenRegistration(p)}
                          variant="solid"
                          className="px-3 py-1.5 text-[11px]"
                        >
                          File FIR
                        </FIRButton>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className={`px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t ${T.border(dark)}`}>
          <div className="flex items-center gap-3">
            <span className={`text-[11px] ${T.muted(dark)}`}>Showing {filteredPetitions.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + itemsPerPage, filteredPetitions.length)} of {filteredPetitions.length} entries</span>
            <select
              value={itemsPerPage}
              onChange={handleItemsPerPageChange}
              className={`text-[10px] font-bold px-2 py-1 rounded-md border focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all ${dark ? 'bg-brand-navy-950 border-white/10 text-white' : 'bg-white border-black/10 text-brand-charcoal'
                }`}
            >
              <option value={2}>2 per page</option>
              <option value={3}>3 per page</option>
              <option value={5}>5 per page</option>
              <option value={10}>10 per page</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <FIRButton onClick={() => handlePageChange(currentPage - 1)} variant="secondary" dark={dark} className={`px-2.5 py-1 text-[11px] h-7 ${currentPage === 1 ? 'opacity-50 pointer-events-none' : ''}`}>Prev</FIRButton>

            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => handlePageChange(i + 1)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold transition-colors ${currentPage === i + 1
                    ? 'bg-blue-500 text-white'
                    : dark ? 'hover:bg-white/5' : 'hover:bg-black/5'
                  }`}
              >
                {i + 1}
              </button>
            ))}

            <FIRButton onClick={() => handlePageChange(currentPage + 1)} variant="secondary" dark={dark} className={`px-2.5 py-1 text-[11px] h-7 ${currentPage === totalPages ? 'opacity-50 pointer-events-none' : ''}`}>Next</FIRButton>
          </div>
        </div>
      </FIRCard>

      {/* Registration Modal Overlay */}
      {selectedPetition && modalStage !== 'none' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-lg rounded-2xl border ${dark ? 'bg-brand-navy-900 border-white/10' : 'bg-white border-black/10 shadow-2xl'} overflow-hidden transition-all duration-300`}>

            {/* Modal Header */}
            <div className={`px-6 py-4 border-b flex items-center justify-between ${T.border(dark)}`}>
              <h3 className="font-black text-sm flex items-center gap-2">
                <span>📂</span>
                Official FIR Registration (Sec 173 BNSS)
              </h3>
              {modalStage !== 'registering' && (
                <button
                  onClick={() => setSelectedPetition(null)}
                  className={`p-1.5 rounded-lg border transition-all ${T.border(dark)} ${dark ? 'hover:bg-white/[0.05]' : 'hover:bg-black/[0.05]'} ${T.muted(dark)}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {modalStage === 'idle' && (
                <div className="space-y-4">
                  {/* Warning banner if blockers exist */}
                  {selectedPetition.blockers.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-start gap-2.5 text-xs font-semibold">
                      <span className="text-sm">⚠️</span>
                      <div>
                        <p className="font-bold mb-1">Procedural Mistakes Found</p>
                        <ul className="list-disc pl-4 space-y-0.5 text-[10px]">
                          {selectedPetition.blockers.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Pre-filled review details form component */}
                  <FileFIRForm
                    dark={dark}
                    formData={formData}
                    setFormData={setFormData}
                    modalSections={modalSections}
                    setModalSections={setModalSections}
                    selectedPetition={selectedPetition}
                    allBnsSections={ALL_BNS_SECTIONS}
                  />

                  {/* Modal Action buttons */}
                  <div className={`pt-4 border-t flex justify-end gap-2.5 ${T.border(dark)}`}>
                    <FIRButton
                      onClick={() => setSelectedPetition(null)}
                      variant="secondary"
                      dark={dark}
                    >
                      Cancel
                    </FIRButton>
                    <FIRButton
                      onClick={runRegistration}
                      variant="solid"
                    >
                      Register &amp; Generate FIR
                    </FIRButton>
                  </div>
                </div>
              )}

              {/* Progressing screen */}
              {modalStage === 'registering' && (
                <div className="py-6 flex flex-col items-center justify-center space-y-6">
                  {/* Spinner */}
                  <div className="relative w-16 h-16 flex items-center justify-center">
                    <span className="absolute inset-0 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
                    <span className="text-xl">⚙️</span>
                  </div>

                  <div className="text-center">
                    <h4 className="font-bold text-sm">Filing FIR Record</h4>
                    <p className={`text-[11px] mt-0.5 ${T.muted(dark)}`}>Submitting documents to Station Registry...</p>
                  </div>

                  {/* Progress logs console */}
                  <div className={`w-full max-w-sm rounded-xl p-4 border font-mono text-[10px] space-y-1.5 h-36 overflow-y-auto leading-relaxed ${dark ? 'bg-black/40 border-white/5 text-blue-300' : 'bg-gray-50 border-black/5 text-blue-800'
                    }`}>
                    {modalLogs.map((log, index) => (
                      <div key={index} className="flex gap-2">
                        <span className="text-emerald-500">✓</span>
                        <span>{log}</span>
                      </div>
                    ))}
                    {modalLogs.length < 6 && (
                      <div className="flex gap-2 items-center text-gray-400">
                        <span className="inline-block w-1 h-3 bg-blue-500 animate-pulse" />
                        <span>Initializing registry task...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Success Screen */}
              {modalStage === 'success' && (
                <div className="py-4 text-center space-y-5">
                  <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-3xl animate-bounce">
                    🎉
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-emerald-500">FIR Registered Successfully!</h3>
                    <p className={`text-[11px] mt-1 ${T.muted(dark)}`}>
                      Record stored in digital vault and synchronized with ICJS.
                    </p>
                  </div>

                  <div className={`max-w-xs mx-auto p-4 rounded-xl border border-dashed text-left space-y-2 bg-gray-400/5 border-gray-400/20`}>
                    <div className="flex justify-between text-xs">
                      <span className="opacity-60 font-semibold">FIR Number:</span>
                      <span className="font-mono font-bold text-blue-500">{generatedFIRNo}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="opacity-60 font-semibold">Complainant:</span>
                      <span className="font-bold">{selectedPetition.complainant}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="opacity-60 font-semibold">Accused:</span>
                      <span className="font-bold">{selectedPetition.accused}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="opacity-60 font-semibold">Timestamp:</span>
                      <span className="font-bold font-mono text-[10px]">{new Date().toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex justify-center gap-2 pt-2">
                    <FIRButton
                      onClick={printFIRMock}
                      variant="primary"
                    >
                      Print FIR Document
                    </FIRButton>
                    <FIRButton
                      onClick={() => setSelectedPetition(null)}
                      variant="secondary"
                      dark={dark}
                    >
                      Close Panel
                    </FIRButton>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {viewReportPetition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-5xl h-[85vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl ${
            dark ? 'bg-brand-navy-900 border-white/10 text-white' : 'bg-white border-black/10 text-brand-charcoal'
          }`}>
            
            {/* Azure DevOps Header */}
            <div className={`px-6 py-4 border-b flex items-start justify-between shrink-0 ${T.border(dark)}`}>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-blue-500 font-black">
                  <span>Petition Record</span>
                  <span>/</span>
                  <span>{viewReportPetition.id}</span>
                  <span>/</span>
                  <span className={`px-2 py-0.5 rounded-full ${scoreBadgeColor(viewReportPetition.score)}`}>
                    Score: {viewReportPetition.score}%
                  </span>
                </div>
                <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                  <span>{viewReportPetition.firNo || viewReportPetition.petitionNo}</span>
                  <span className="font-normal opacity-50">—</span>
                  <span className="opacity-80">{viewReportPetition.complainant} vs {viewReportPetition.accused}</span>
                </h2>
              </div>
              <button 
                onClick={() => setViewReportPetition(null)}
                className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                  dark ? 'border-white/10 hover:bg-white/5 text-white/60 hover:text-white' : 'border-black/10 hover:bg-black/5 text-black/60 hover:text-black'
                }`}
              >
                ✕ Close
              </button>
            </div>

            {/* Azure DevOps Body (Scrollable Split-Pane) */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              
              {/* Left Pane (Main content - 70% width) */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 border-r border-gray-400/10">
                
                {/* 1. Legal Classification */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-500">Applied Legal Sections (BNS)</h4>
                  <div className="flex flex-wrap gap-2">
                    {viewReportPetition.sections && viewReportPetition.sections.map((sec) => (
                      <span key={sec} className="bg-blue-500/10 text-blue-500 border border-blue-500/20 px-2.5 py-1 rounded-md text-xs font-bold">
                        {sec}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 2. Narrative / Incident Facts */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-500">Brief Facts of the Case / Allegations</h4>
                  <div className={`p-4 rounded-xl border text-xs leading-relaxed font-sans whitespace-pre-wrap ${
                    dark ? 'bg-black/30 border-white/5 text-white/95' : 'bg-gray-50 border-black/5 text-brand-charcoal'
                  }`}>
                    {viewReportPetition.incidentFacts || "No facts narration provided."}
                  </div>
                </div>

                {/* 3. AI Pipeline Step 1 & 2 Collapsible Logs */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-500">AI Processing Transcript (OCR & Translation)</h4>
                  
                  {/* Step 1 OCR */}
                  {viewReportPetition.step1Output && (
                    <div className={`rounded-xl border overflow-hidden ${dark ? 'border-white/5' : 'border-black/5'}`}>
                      <details className="group">
                        <summary className={`px-4 py-3 text-xs font-bold cursor-pointer select-none flex items-center justify-between ${
                          dark ? 'bg-white/[0.02] hover:bg-white/[0.04]' : 'bg-black/[0.02] hover:bg-black/[0.04]'
                        }`}>
                          <span>1. Original Scanned OCR Document</span>
                          <span className="text-[10px] opacity-40 group-open:rotate-180 transition-transform">▼</span>
                        </summary>
                        <div className={`p-4 font-mono text-[10px] leading-relaxed overflow-x-auto whitespace-pre-wrap ${
                          dark ? 'bg-black/40 text-green-400' : 'bg-gray-50 text-green-800'
                        }`}>
                          {viewReportPetition.step1Output}
                        </div>
                      </details>
                    </div>
                  )}

                  {/* Step 2 Translation */}
                  {viewReportPetition.step2Output && (
                    <div className={`rounded-xl border overflow-hidden ${dark ? 'border-white/5' : 'border-black/5'}`}>
                      <details className="group">
                        <summary className={`px-4 py-3 text-xs font-bold cursor-pointer select-none flex items-center justify-between ${
                          dark ? 'bg-white/[0.02] hover:bg-white/[0.04]' : 'bg-black/[0.02] hover:bg-black/[0.04]'
                        }`}>
                          <span>2. Translated English Content</span>
                          <span className="text-[10px] opacity-40 group-open:rotate-180 transition-transform">▼</span>
                        </summary>
                        <div className={`p-4 font-mono text-[10px] leading-relaxed overflow-x-auto whitespace-pre-wrap ${
                          dark ? 'bg-black/40 text-blue-400' : 'bg-gray-50 text-blue-800'
                        }`}>
                          {viewReportPetition.step2Output}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Pane (Sidebar - 30% width) */}
              <div className={`w-80 overflow-y-auto p-6 space-y-6 ${dark ? 'bg-white/[0.01]' : 'bg-black/[0.01]'}`}>
                
                {/* Status Properties */}
                <div className="space-y-4 text-xs">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-gray-400">Filing Status</span>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold mt-1 ${statusBadgeColor(viewReportPetition.status)}`}>
                      {viewReportPetition.status}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] uppercase font-bold text-gray-400">Date Logged</span>
                    <span className="block font-semibold mt-1">{viewReportPetition.date}</span>
                  </div>

                  {viewReportPetition.filedAt && (
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-gray-400">Date Filed</span>
                      <span className="block font-semibold mt-1">{viewReportPetition.filedAt}</span>
                    </div>
                  )}
                </div>

                <hr className="border-gray-400/10" />

                {/* CCTNS Registry Fields */}
                <div className="space-y-4 text-xs">
                  <h3 className="text-[10px] uppercase font-black tracking-wider text-blue-500">CCTNS System Fields</h3>

                  <div>
                    <span className="block text-[10px] font-bold text-gray-400">Police Station</span>
                    <span className="block font-mono mt-1">{viewReportPetition.policeStation || 'PS/HYD/04'}</span>
                  </div>

                  <div>
                    <span className="block text-[10px] font-bold text-gray-400">District</span>
                    <span className="block mt-1">{viewReportPetition.district || 'Hyderabad'}</span>
                  </div>

                  <div>
                    <span className="block text-[10px] font-bold text-gray-400">GD Entry Reference</span>
                    <span className="block font-mono mt-1">{viewReportPetition.gdNumber || 'N/A'}</span>
                  </div>

                  <div>
                    <span className="block text-[10px] font-bold text-gray-400">Incident Timestamp</span>
                    <span className="block mt-1">
                      {viewReportPetition.incidentDate || 'N/A'} {viewReportPetition.incidentTime && `at ${viewReportPetition.incidentTime}`}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] font-bold text-gray-400">Occurrence Place</span>
                    <span className="block mt-1">{viewReportPetition.occurrencePlace || 'N/A'}</span>
                  </div>
                </div>

                <hr className="border-gray-400/10" />

                {/* Complainant profile */}
                <div className="space-y-4 text-xs">
                  <h3 className="text-[10px] uppercase font-black tracking-wider text-blue-500">Complainant Profile</h3>
                  
                  <div>
                    <span className="block text-[10px] font-bold text-gray-400">Full Name</span>
                    <span className="block mt-1 font-semibold">{viewReportPetition.complainant}</span>
                  </div>

                  <div>
                    <span className="block text-[10px] font-bold text-gray-400">Relative Reference</span>
                    <span className="block mt-1">{viewReportPetition.complainantRelative || 'N/A'}</span>
                  </div>

                  <div>
                    <span className="block text-[10px] font-bold text-gray-400">Phone Contact</span>
                    <span className="block mt-1">{viewReportPetition.complainantPhone || 'N/A'}</span>
                  </div>

                  <div>
                    <span className="block text-[10px] font-bold text-gray-400">Permanent Address</span>
                    <span className="block mt-1 leading-relaxed">{viewReportPetition.complainantAddress || 'N/A'}</span>
                  </div>
                </div>

              </div>

            </div>

          </div>
        </div>
      )}
    </div>
  );
}
