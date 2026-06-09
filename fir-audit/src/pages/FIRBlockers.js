import { useOutletContext } from 'react-router-dom';
import { useState } from 'react';
import FIRButton from '../components/reusable/FIRButton';
import FIRCard from '../components/reusable/FIRCard';
import FIRBadge from '../components/reusable/FIRBadge';

const INITIAL_BLOCKERS = [
  { id: 'BLK-001', fir: 'FIR/HYD/226/103', section: 'BNS 115', issue: 'Forensic Lab ID missing from scene evidence log', severity: 'Critical', since: '2 hrs ago' },
  { id: 'BLK-002', fir: 'FIR/HYD/226/099', section: 'BNS 103', issue: 'Witness attestation signature absent — mandatory under BNSS Sec 173', severity: 'Critical', since: '4 hrs ago' },
  { id: 'BLK-003', fir: 'FIR/HYD/226/088', section: 'NDPS 20', issue: 'Narcotics seizure weight mismatch between complaint and panchnama', severity: 'High', since: '1 day ago' },
];


export default function FIRBlockers() {
  const { dark } = useOutletContext();

  const [blockers, setBlockers] = useState(INITIAL_BLOCKERS);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(2);
  const [resolvingBlocker, setResolvingBlocker] = useState(null); // Tracks which blocker is being resolved
  
  const totalPages = Math.max(1, Math.ceil(blockers.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentBlockers = blockers.slice(startIndex, startIndex + itemsPerPage);

  const confirmResolve = (e) => {
    e.preventDefault();
    if (!resolvingBlocker) return;
    
    setBlockers(prev => {
      const next = prev.filter(b => b.id !== resolvingBlocker.id);
      if (currentPage > Math.max(1, Math.ceil(next.length / itemsPerPage))) {
        setCurrentPage(Math.max(1, Math.ceil(next.length / itemsPerPage)));
      }
      return next;
    });
    
    setResolvingBlocker(null);
  };

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  const T = {
    card:  (d) => d ? 'bg-brand-navy-900 border-white/[0.06]' : 'bg-white border-black/[0.08] shadow-sm',
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
    border: (d) => d ? 'border-white/[0.06]' : 'border-black/[0.08]',
    rowHover: (d) => d ? 'hover:bg-white/[0.015]' : 'hover:bg-black/[0.015]',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight mb-1">Blocker Flags</h1>
        <p className={`text-xs ${T.muted(dark)}`}>
          Procedural errors and compliance failures blocking FIR PDF generation. Resolve all blockers before court submission.
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Active Blockers', val: '3', color: 'text-red-500', sub: 'PDF locked until resolved' },
          { label: 'Avg. Resolution Time', val: '47 min', color: 'text-amber-500', sub: 'This week' },
          { label: 'Resolved Today', val: '11', color: 'text-emerald-500', sub: 'Since 08:00 hrs' },
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
          <h3 className="text-xs font-black uppercase tracking-wider">Active Blockers Requiring Resolution</h3>
          {blockers.length > 0 ? (
            <span className="text-[10px] text-red-500 font-bold animate-pulse">● {blockers.length} Unresolved</span>
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
              <FIRButton onClick={() => setResolvingBlocker(b)} variant="action" dark={dark}>
                Resolve →
              </FIRButton>
            </div>
          ))}
        </div>
        
        {/* Pagination */}
        <div className={`px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t ${T.border(dark)}`}>
          <div className="flex items-center gap-3">
            <span className={`text-[11px] ${T.muted(dark)}`}>Showing {blockers.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + itemsPerPage, blockers.length)} of {blockers.length} blockers</span>
            <select 
              value={itemsPerPage} 
              onChange={handleItemsPerPageChange}
              className={`text-[10px] font-bold px-2 py-1 rounded-md border focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all ${
                dark ? 'bg-brand-navy-950 border-white/10 text-white' : 'bg-white border-black/10 text-brand-charcoal'
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

      {/* ── Resolution Modal Overlay ── */}
      {resolvingBlocker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl border overflow-hidden ${dark ? 'bg-brand-navy-900 border-white/10' : 'bg-white border-black/10'}`}>
            
            <div className={`px-5 py-4 border-b flex items-center justify-between ${T.border(dark)}`}>
              <h3 className="font-black text-sm">Resolve Procedural Blocker</h3>
              <button onClick={() => setResolvingBlocker(null)} className={`text-xs font-bold transition-colors ${dark ? 'text-white/40 hover:text-white' : 'text-black/40 hover:text-black'}`}>
                ✕ Close
              </button>
            </div>

            <div className="p-5">
              <div className={`p-4 rounded-xl mb-5 text-sm ${dark ? 'bg-white/[0.03] border border-white/5' : 'bg-black/[0.02] border border-black/5'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-mono font-bold text-blue-500">{resolvingBlocker.fir}</span>
                  <span className={`text-[10px] font-mono ${T.muted(dark)}`}>{resolvingBlocker.id}</span>
                </div>
                <p className="font-bold leading-relaxed">{resolvingBlocker.issue}</p>
              </div>

              <form onSubmit={confirmResolve} className="space-y-4">
                <div>
                  <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${T.muted(dark)}`}>
                    Provide Missing Data or Clarification
                  </label>
                  <textarea 
                    autoFocus
                    required
                    placeholder="e.g. Entering Forensic Lab ID: FL-9923..."
                    className={`w-full h-24 p-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none transition-all ${
                      dark ? 'bg-brand-navy-950 border-white/10 text-white placeholder-white/30' : 'bg-white border-black/10 text-brand-charcoal placeholder-black/30'
                    }`}
                  />
                </div>
                
                <div className={`pt-2 flex items-center gap-2`}>
                  <FIRButton type="button" onClick={() => setResolvingBlocker(null)} variant="secondary" dark={dark} className="flex-1">
                    Cancel
                  </FIRButton>
                  <FIRButton type="submit" variant="primary" className="flex-1">
                    Submit Resolution
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
