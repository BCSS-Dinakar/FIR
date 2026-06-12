import { useOutletContext } from 'react-router-dom';
import { useState, useEffect } from 'react';
import FIRButton from '../components/reusable/FIRButton';
import FIRCard from '../components/reusable/FIRCard';
import FIRBadge from '../components/reusable/FIRBadge';
import FileFIRForm from '../components/reusable/FileFIRForm';
import { updatePetition, getMistakesAndWarnings, getPetitionById } from '../api/petition';

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

export default function FIRBlockers() {
  const { dark } = useOutletContext();

  const [petitions, setPetitions] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(2);
  const [resolvingBlocker, setResolvingBlocker] = useState(null); // Tracks which blocker is being resolved
  const [selectedPetition, setSelectedPetition] = useState(null);
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

  const [stats, setStats] = useState({
    activeMistakes: 0,
    avgResolutionTime: "47 min",
    resolvedToday: "11"
  });

  // Load from backend on mount
  useEffect(() => {
    const loadPetitions = async () => {
      try {
        const data = await getMistakesAndWarnings();
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

  // Compute active blockers dynamically from scanned petitions
  const activeBlockers = [];
  petitions.forEach(p => {
    if (p.blockers && p.blockers.length > 0) {
      p.blockers.forEach((blocker, index) => {
        activeBlockers.push({
          id: `${p.id}-BLK-${index}`,
          petitionId: p.id,
          fir: p.petitionNo,
          section: p.sections[0] || 'N/A',
          issue: blocker,
          severity: index === 0 ? 'Critical' : 'High',
          since: p.date
        });
      });
    }
  });

  const totalPages = Math.max(1, Math.ceil(activeBlockers.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentBlockers = activeBlockers.slice(startIndex, startIndex + itemsPerPage);

  const handleOpenResolve = async (blocker) => {
    try {
      const fullPetition = await getPetitionById(blocker.petitionId);
      setSelectedPetition(fullPetition);
      setModalSections(fullPetition.sections || []);
      setFormData({
        district: fullPetition.district || 'Hyderabad',
        policeStation: fullPetition.policeStation || 'PS/HYD/04',
        gdNumber: fullPetition.gdNumber || `GD-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        incidentDate: fullPetition.incidentDate || new Date().toISOString().substring(0, 10),
        incidentTime: fullPetition.incidentTime || '12:00',
        distanceDirection: fullPetition.distanceDirection || '3 km South',
        beatNumber: fullPetition.beatNumber || 'Beat No. 4',
        occurrencePlace: fullPetition.occurrencePlace || 'Banjara Hills Road No 4, Hyderabad',
        complainant: fullPetition.complainant || '',
        complainantRelative: fullPetition.complainantRelative || '',
        nationality: fullPetition.nationality || 'Indian',
        complainantPhone: fullPetition.complainantPhone || '',
        complainantAddress: fullPetition.complainantAddress || '',
        accused: fullPetition.accused || '',
        accusedCount: fullPetition.accusedCount || 1,
        accusedDescription: fullPetition.accusedDescription || '',
        incidentFacts: fullPetition.incidentFacts || `A formal complaint petition was uploaded regarding BNS sections: ${(fullPetition.sections || []).join(', ')} alleging misconduct/offence by ${fullPetition.accused || 'Unknown'} as reported by ${fullPetition.complainant || 'Unknown'}. Compliance checks completed with a score of ${fullPetition.score || 0}/100.`
      });
      setResolvingBlocker(blocker);
    } catch (err) {
      console.error('Failed to load petition details for resolution:', err);
      alert('Failed to load petition details. Please try again.');
    }
  };

  const confirmResolve = async (e) => {
    e.preventDefault();
    if (!resolvingBlocker || !selectedPetition) return;

    const updatedPetitionData = {
      ...selectedPetition,
      complainant: formData.complainant,
      complainantRelative: formData.complainantRelative,
      complainantPhone: formData.complainantPhone,
      complainantAddress: formData.complainantAddress,
      accused: formData.accused,
      nationality: formData.nationality,
      district: formData.district,
      policeStation: formData.policeStation,
      gdNumber: formData.gdNumber,
      incidentDate: formData.incidentDate,
      incidentTime: formData.incidentTime,
      occurrencePlace: formData.occurrencePlace,
      distanceDirection: formData.distanceDirection,
      beatNumber: formData.beatNumber,
      accusedCount: formData.accusedCount,
      accusedDescription: formData.accusedDescription,
      incidentFacts: formData.incidentFacts,
      sections: modalSections,
      status: 'Pending Filing',
      blockers: [], // Clear all blockers since they resolved the errors
      score: 95 // Boost the score
    };

    try {
      // 1. Update backend database
      await updatePetition(selectedPetition.id, updatedPetitionData);

      // 2. Fetch updated list and stats
      const data = await getMistakesAndWarnings();
      if (data && data.success) {
        setPetitions(data.petitions || []);
        if (data.stats) {
          setStats(data.stats);
        }
      }

      setResolvingBlocker(null);
      setSelectedPetition(null);
    } catch (err) {
      console.error('Failed to update petition blocker in database:', err);
      alert('Failed to resolve mistake: ' + err.message);
    }
  };

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  const T = {
    card: (d) => d ? 'bg-brand-navy-900 border-white/[0.06]' : 'bg-white border-black/[0.08] shadow-sm',
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
    border: (d) => d ? 'border-white/[0.06]' : 'border-black/[0.08]',
    rowHover: (d) => d ? 'hover:bg-white/[0.015]' : 'hover:bg-black/[0.015]',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight mb-1">Mistakes / Warnings</h1>
        <p className={`text-xs ${T.muted(dark)}`}>
          Procedural errors and mistakes blocking FIR registration. Fix all mistakes before filing.
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Active Mistakes', val: stats.activeMistakes.toString(), color: 'text-red-500', sub: 'Filing locked until fixed' },
          { label: 'Avg. Resolution Time', val: stats.avgResolutionTime, color: 'text-amber-500', sub: 'This week' },
          { label: 'Resolved Today', val: stats.resolvedToday, color: 'text-emerald-500', sub: 'Since 08:00 hrs' },
        ].map((s) => (
          <FIRCard key={s.label} dark={dark} noPadding className="p-4">
            <div className={`text-xl font-black ${s.color}`}>{s.val}</div>
            <div className="text-[11px] font-bold mt-0.5">{s.label}</div>
            <div className={`text-[10px] mt-0.5 ${T.muted(dark)}`}>{s.sub}</div>
          </FIRCard>
        ))}
      </div>

      {/* Blocker list */}
      <FIRCard dark={dark} noPadding className="overflow-hidden">
        <div className={`px-5 py-3.5 border-b ${T.border(dark)} flex items-center justify-between`}>
          <h3 className="text-xs font-black uppercase tracking-wider">Active Mistakes Requiring Correction</h3>
          {activeBlockers.length > 0 ? (
            <span className="text-[10px] text-red-500 font-bold animate-pulse">● {activeBlockers.length} Unresolved</span>
          ) : (
            <span className="text-[10px] text-emerald-500 font-bold">All Resolved</span>
          )}
        </div>

        <div className="divide-y divide-gray-400/10 overflow-y-auto h-[320px]">
          {currentBlockers.map((b) => (
            <div key={b.id} className={`px-5 py-4 flex items-start justify-between gap-4 transition-colors ${T.rowHover(dark)}`}>
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[10px] font-black font-mono text-blue-500">{b.fir}</span>
                    <FIRBadge variant={b.severity.toLowerCase()} dark={dark}>
                      {b.severity}
                    </FIRBadge>
                    <span className={`text-[9px] font-mono ${T.muted(dark)}`}>{b.section}</span>
                  </div>
                  <p className="text-xs font-semibold leading-relaxed">{b.issue}</p>
                  <p className={`text-[10px] mt-1 ${T.muted(dark)}`}>Flagged {b.since} · ID: {b.id}</p>
                </div>
              </div>
              <FIRButton onClick={() => handleOpenResolve(b)} variant="action" dark={dark}>
                Resolve →
              </FIRButton>
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className={`px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t ${T.border(dark)}`}>
          <div className="flex items-center gap-3">
            <span className={`text-[11px] ${T.muted(dark)}`}>Showing {activeBlockers.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + itemsPerPage, activeBlockers.length)} of {activeBlockers.length} mistakes</span>
            <select
              value={itemsPerPage}
              onChange={handleItemsPerPageChange}
              className={`text-[10px] font-bold px-2 py-1 rounded-md border focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all ${dark ? 'bg-brand-navy-950 border-white/10 text-white' : 'bg-white border-black/10 text-brand-charcoal'
                }`}
            >
              <option value={1}>1 per page</option>
              <option value={2}>2 per page</option>
              <option value={3}>3 per page</option>
              <option value={5}>5 per page</option>
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

      {/* ── Resolution Modal Overlay ── */}
      {resolvingBlocker && selectedPetition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl border overflow-hidden ${dark ? 'bg-brand-navy-900 border-white/10' : 'bg-white border-black/10'}`}>

            <div className={`px-5 py-4 border-b flex items-center justify-between ${T.border(dark)}`}>
              <h3 className="font-black text-sm">Resolve Mistakes & Edit Fields</h3>
              <button onClick={() => { setResolvingBlocker(null); setSelectedPetition(null); }} className={`text-xs font-bold transition-colors ${dark ? 'text-white/40 hover:text-white' : 'text-black/40 hover:text-black'}`}>
                ✕ Close
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Warnings and Blockers banner */}
              {selectedPetition.blockers && selectedPetition.blockers.length > 0 && (
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

              {/* Scrollable File FIR Form */}
              <form onSubmit={confirmResolve} className="space-y-4">
                <FileFIRForm
                  dark={dark}
                  formData={formData}
                  setFormData={setFormData}
                  modalSections={modalSections}
                  setModalSections={setModalSections}
                  selectedPetition={selectedPetition}
                  allBnsSections={ALL_BNS_SECTIONS}
                />

                <div className={`pt-4 border-t flex items-center gap-2.5 ${T.border(dark)}`}>
                  <FIRButton type="button" onClick={() => { setResolvingBlocker(null); setSelectedPetition(null); }} variant="secondary" dark={dark} className="flex-1">
                    Cancel
                  </FIRButton>
                  <FIRButton type="submit" variant="primary" className="flex-1">
                    Save
                  </FIRButton>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
