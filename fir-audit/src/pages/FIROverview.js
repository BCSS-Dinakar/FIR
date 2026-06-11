import { useOutletContext, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import FIRButton from '../components/reusable/FIRButton';
import FIRCard from '../components/reusable/FIRCard';
import { getPetitions, getFirs } from '../api/petition';

export default function FIROverview() {
  const { dark } = useOutletContext();
  const navigate = useNavigate();

  const [petitions, setPetitions] = useState([]);
  const [firs, setFirs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(3);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const petsData = await getPetitions();
        const firsData = await getFirs();
        setPetitions(petsData);
        setFirs(firsData);
        // Keep local cache synced
        localStorage.setItem('scanned_petitions', JSON.stringify(petsData));
      } catch (err) {
        console.error('Failed to load overview data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    const handleStorageChange = () => {
      const saved = localStorage.getItem('scanned_petitions');
      if (saved) {
        try {
          setPetitions(JSON.parse(saved));
        } catch (e) {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const totalPages = Math.max(1, Math.ceil(petitions.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentAudits = petitions.slice(startIndex, startIndex + itemsPerPage);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  const T = {
    card: (d) => d ? 'bg-brand-navy-900 border-white/[0.06] shadow-2xl' : 'bg-white border-black/[0.08] shadow-sm',
    text: (d) => d ? 'text-white' : 'text-brand-charcoal',
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
    border: (d) => d ? 'border-white/[0.06]' : 'border-black/[0.08]',
    tableHeader: (d) => d ? 'bg-white/[0.02]' : 'bg-black/[0.01]',
    tableRowHover: (d) => d ? 'hover:bg-white/[0.01]' : 'hover:bg-black/[0.01]',
  };

  const scoreBadgeColor = (score) => {
    if (score >= 90) return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    if (score >= 75) return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    return 'bg-red-500/10 text-red-500 border-red-500/20';
  };

  const statusBadgeColor = (status) => {
    if (status === 'Checked' || status === 'FIR Filed') return 'bg-emerald-500/10 text-emerald-500';
    if (status === 'Needs Review') return 'bg-amber-500/10 text-amber-500';
    return 'bg-red-500/10 text-red-500 animate-pulse';
  };

  // Compute live statistics
  const totalChecked = petitions.length;
  const pendingReview = petitions.filter(p => p.status === 'Pending Filing' && (!p.blockers || p.blockers.length === 0)).length;
  const avgAccuracy = petitions.length > 0 
    ? (petitions.reduce((acc, p) => acc + p.score, 0) / petitions.length).toFixed(1) + '%' 
    : '0%';
  const unresolvedMistakes = petitions.reduce((acc, p) => acc + (p.status !== 'FIR Filed' ? (p.blockers?.length || 0) : 0), 0);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Page Title Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight mb-1">
            FIR Status Board
          </h1>
          <p className={`text-xs ${T.muted(dark)}`}>
            Check petitions for errors and verify BNS sections before drafting FIRs.
          </p>
        </div>
        <FIRButton 
          onClick={() => navigate('/dashboard/audits')}
          variant="primary"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
            </svg>
          }
        >
          Upload New Petition
        </FIRButton>
      </div>

      {/* Grid Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { 
            title: 'Petitions Checked', 
            val: totalChecked, 
            change: 'From live station database',
            icon: (
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            )
          },
          { 
            title: 'Pending Review', 
            val: pendingReview, 
            change: 'Ready for draft filing',
            icon: (
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )
          },
          { 
            title: 'Average Accuracy Score', 
            val: avgAccuracy, 
            change: 'Target strictness: High',
            icon: (
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            )
          },
          { 
            title: 'Unresolved Mistakes', 
            val: unresolvedMistakes, 
            change: 'Must be resolved',
            icon: (
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )
          }
        ].map((item, idx) => (
          <FIRCard key={idx} dark={dark} noPadding className="p-5 flex items-start justify-between">
            <div className="space-y-2.5">
              <span className={`text-[10px] uppercase font-bold tracking-wider ${T.muted(dark)}`}>
                {item.title}
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black">{item.val}</span>
              </div>
              <span className={`text-[10px] font-semibold block ${
                idx === 3 && unresolvedMistakes > 0 ? 'text-red-500 animate-pulse' : idx === 1 ? 'text-amber-500' : 'text-emerald-500'
              }`}>
                {item.change}
              </span>
            </div>
            <div className={`w-9.5 h-9.5 rounded-lg border ${T.border(dark)} flex items-center justify-center bg-gray-400/5`}>
              {item.icon}
            </div>
          </FIRCard>
        ))}
      </div>

      {/* Banner / Interactive Dropzone */}
      <FIRCard dark={dark} noPadding className="p-6 flex flex-col md:flex-row items-center justify-between gap-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-blue-500/5 rounded-full blur-[80px] pointer-events-none" />
        
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div className="text-left">
            <h3 className="font-bold text-sm">Drag and drop petitions to check for errors</h3>
            <p className={`text-xs mt-0.5 ${T.muted(dark)}`}>Supports Telugu/English handwritten petitions, printed PDFs, or images (JPG, PNG).</p>
          </div>
        </div>

        <FIRButton 
          onClick={() => navigate('/dashboard/audits')}
          variant="secondary"
          dark={dark}
          className="relative z-10 shrink-0"
        >
          Select Petition File
        </FIRButton>
      </FIRCard>

      {/* Queue Table */}
      <FIRCard dark={dark} noPadding className="overflow-hidden">
        <div className={`px-6 py-4 border-b ${T.border(dark)} flex items-center justify-between`}>
          <div>
            <h3 className="font-bold text-sm">Recent Scanned Cases</h3>
            <p className={`text-[11px] mt-0.5 ${T.muted(dark)}`}>A timeline of petitions processed in the last 24 hours.</p>
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto h-[320px] relative">
          <table className="w-full text-left border-collapse">
            <thead className={`sticky top-0 z-10 shadow-sm ${dark ? 'bg-brand-navy-900' : 'bg-white'}`}>
              <tr className={`text-[10px] uppercase font-bold tracking-wider border-b ${T.border(dark)} ${T.tableHeader(dark)}`}>
                <th className="px-6 py-3">FIR Reference</th>
                <th className="px-6 py-3">Complainant</th>
                <th className="px-6 py-3">Legal Classification</th>
                <th className="px-6 py-3 text-center">Accuracy</th>
                <th className="px-6 py-3">Check Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-400/10">
              {currentAudits.map((item) => (
                <tr key={item.id} className={`text-xs transition-colors ${T.tableRowHover(dark)}`}>
                  <td className="px-6 py-4 font-mono font-bold">
                    <div className="flex flex-col">
                      <span>{item.status === 'FIR Filed' ? (item.firNo || item.petitionNo) : item.petitionNo}</span>
                      <span className="text-[10px] opacity-40 font-normal mt-0.5">{item.date}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium">{item.complainant}</td>
                  <td className="px-6 py-4 font-mono text-[11px] text-blue-500 font-bold">
                    {item.sections && item.sections.length > 0 ? item.sections[0] : 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${scoreBadgeColor(item.score)}`}>
                      {item.score}%
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${statusBadgeColor(item.status)}`}>
                      {item.status !== 'Checked' && item.status !== 'FIR Filed' && <span className="w-1 h-1 rounded-full bg-current" />}
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <FIRButton 
                      onClick={() => alert(`Opening details for ${item.petitionNo}...`)}
                      variant="secondary"
                      dark={dark}
                      className="px-3 py-1.5 text-[11px]"
                    >
                      View Report
                    </FIRButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className={`px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t ${T.border(dark)}`}>
          <div className="flex items-center gap-3">
            <span className={`text-[11px] ${T.muted(dark)}`}>Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, petitions.length)} of {petitions.length} entries</span>
            <select 
              value={itemsPerPage} 
              onChange={handleItemsPerPageChange}
              className={`text-[10px] font-bold px-2 py-1 rounded-md border focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all ${
                dark ? 'bg-brand-navy-950 border-white/10 text-white' : 'bg-white border-black/10 text-brand-charcoal'
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
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold transition-colors ${
                  currentPage === i + 1 
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
    </div>
  );
}
