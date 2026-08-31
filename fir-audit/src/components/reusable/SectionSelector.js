import { useState, useEffect, useRef } from 'react';
import { getAllBnsSections } from '../../api/petition';

const PAGE_SIZE = 50;
// RAG can return any number of genuinely-supported sections (no backend cap) — the
// Suggested tab shows this many by default and lets the user expand for the rest,
// so a compact display doesn't require limiting what the RAG is allowed to find.
const SUGGESTED_PREVIEW_COUNT = 2;

// Petition.sections may hold either a bare code ("BNS 115") or the legacy combined
// display format ("BNS 115 (Voluntarily causing hurt)"). Match/dedupe by the act +
// section number rather than exact string equality — mirrors backend
// bnsCatalogService's parseIdentifier. The act must be compared too: BNS 1, BNSS 1,
// and BSA 1 are three different sections that happen to share a number. A bare
// number with no recognizable act prefix defaults to BNS, matching all pre-existing
// (BNS-only) Petition.sections data.
const LAW_NAMES = ['BNSS', 'BNS', 'BSA'];

const parseIdentifier = (value) => {
  const str = String(value || '').toUpperCase();
  const law = LAW_NAMES.find((code) => new RegExp(`\\b${code}\\b`).test(str)) || null;
  const match = str.match(/(\d+[A-Za-z]?)/);
  return { law, number: match ? match[1] : null };
};

const isSameSection = (a, b) => {
  const idA = parseIdentifier(a);
  const idB = parseIdentifier(b);
  if (!idA.number || idA.number !== idB.number) return false;
  return (idA.law || 'BNS') === (idB.law || 'BNS');
};

export default function SectionSelector({
  dark,
  sections = [],
  onChange,
  recommendedSections = [],
  petitionId,
  blockers = []
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('suggested');
  const [searchQuery, setSearchQuery] = useState('');
  const [recommended, setRecommended] = useState([]);
  const [allResults, setAllResults] = useState([]);
  const [allTotal, setAllTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showAllSuggested, setShowAllSuggested] = useState(false);
  const listRef = useRef(null);

  const fetchPage = async (search, offset) => {
    const res = await getAllBnsSections(search, recommendedSections, petitionId, { limit: PAGE_SIZE, offset });
    if (!res.success) throw new Error('Failed to fetch BNS sections');
    return res;
  };

  const fetchInitial = async (search = '') => {
    setLoading(true);
    try {
      const res = await fetchPage(search, 0);
      setRecommended(res.recommended);
      setAllResults(res.all);
      setAllTotal(res.total);
    } catch (err) {
      console.error('Failed to fetch BNS sections:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMore = async () => {
    if (loadingMore || allResults.length >= allTotal) return;
    setLoadingMore(true);
    try {
      const res = await fetchPage(searchQuery, allResults.length);
      setAllResults((prev) => [...prev, ...res.all]);
    } catch (err) {
      console.error('Failed to fetch more BNS sections:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleOpenDropdown = () => {
    if (!dropdownOpen) {
      setDropdownOpen(true);
      setActiveTab(recommendedSections.length > 0 ? 'suggested' : 'all');
      setShowAllSuggested(false);
      fetchInitial(searchQuery);
    } else {
      setDropdownOpen(false);
    }
  };

  const toggleSection = (sec) => {
    if (sections.some((x) => isSameSection(x, sec.code))) {
      onChange(sections.filter((x) => !isSameSection(x, sec.code)));
    } else {
      // Persist the combined "CODE (Title)" display string — Petition.sections is
      // printed as-is elsewhere (generated FIR document text, list views).
      onChange([...sections, sec.title ? `${sec.code} (${sec.title})` : sec.code]);
    }
  };

  const handleListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) {
      fetchMore();
    }
  };

  useEffect(() => {
    if (!dropdownOpen || activeTab !== 'all') return;
    const timeoutId = setTimeout(() => {
      fetchInitial(searchQuery);
    }, 300);
    return () => clearTimeout(timeoutId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, dropdownOpen, activeTab]);

  const T = {
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
  };

  const LAW_BADGE_STYLE = {
    BNS: dark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-100 text-blue-700',
    BNSS: dark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700',
    BSA: dark ? 'bg-violet-500/15 text-violet-400' : 'bg-violet-100 text-violet-700'
  };

  const CONFIDENCE_BADGE_STYLE = (pct) =>
    pct >= 80
      ? (dark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700')
      : (dark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700');

  const renderSectionRow = (sec) => {
    const isSelected = sections.some((x) => isSameSection(x, sec.code));
    const hasConfidence = typeof sec.confidence === 'number';
    const confidencePct = hasConfidence ? Math.round(sec.confidence * 100) : null;
    return (
      <div
        key={sec.code}
        onClick={() => toggleSection(sec)}
        className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-colors text-[11px] ${
          isSelected
            ? dark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'
            : dark ? 'hover:bg-white/[0.03]' : 'hover:bg-black/[0.02]'
        }`}
      >
        <input
          type="checkbox"
          checked={isSelected}
          readOnly
          className="mt-0.5 accent-blue-600"
        />
        <div className="text-left">
          <span className="font-bold flex items-center gap-1.5 flex-wrap">
            {sec.law && (
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-wide ${LAW_BADGE_STYLE[sec.law] || ''}`}>
                {sec.law}
              </span>
            )}
            {sec.code}{sec.title ? ` - ${sec.title}` : ''}
            {hasConfidence && (
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-wide ${CONFIDENCE_BADGE_STYLE(confidencePct)}`}>
                {confidencePct}% match
              </span>
            )}
          </span>
          {sec.desc && <span className="text-[9px] opacity-60 block mt-0.5">{sec.desc}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="relative">
      <label className="text-[10px] font-bold uppercase tracking-wider block mb-1.5 opacity-55">
        Applied Sections (Classification)
      </label>

      {/* Clickable box displaying active sections */}
      <div
        onClick={handleOpenDropdown}
        className={`w-full min-h-[38px] p-2.5 rounded-lg border text-xs font-semibold flex flex-wrap gap-1.5 items-center cursor-pointer transition-all ${
          dark
            ? 'bg-white/[0.03] border-white/10 hover:border-blue-500/50'
            : 'bg-black/[0.02] border-black/10 hover:border-blue-500'
        }`}
      >
        {sections.length === 0 ? (
          <span className="text-gray-400">Click to add BNS sections...</span>
        ) : (
          sections.map(s => (
            <span key={s} className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 text-[10px] font-black flex items-center gap-1">
              {s}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(sections.filter(x => x !== s));
                }}
                className="hover:text-red-500 font-bold ml-0.5"
              >
                ✕
              </button>
            </span>
          ))
        )}
        <span className="ml-auto text-gray-400 text-[10px]">▼</span>
      </div>

      {/* Dropdown Menu overlay */}
      {dropdownOpen && (
        <>
          {/* Invisible backdrop to close the dropdown */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setDropdownOpen(false)}
          />

          <div className={`absolute left-0 right-0 mt-1 rounded-xl border z-20 shadow-2xl overflow-hidden ${
            dark ? 'bg-brand-navy-950 border-white/10 text-white' : 'bg-white border-black/10 text-brand-charcoal'
          }`}>
            {/* Tabs */}
            <div className={`flex border-b ${dark ? 'border-white/10' : 'border-black/10'}`}>
              {['suggested', 'all'].map((tab) => (
                <button
                  type="button"
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider transition-colors ${
                    activeTab === tab
                      ? 'text-blue-500 border-b-2 border-blue-500'
                      : `${T.muted(dark)} hover:text-blue-400`
                  }`}
                >
                  {tab === 'suggested' ? `Suggested${recommended.length ? ` (${recommended.length})` : ''}` : `All${allTotal ? ` (${allTotal})` : ''}`}
                </button>
              ))}
            </div>

            <div className="p-3 space-y-3">
              {/* Search input — only meaningful for the ALL tab */}
              {activeTab === 'all' && (
                <input
                  type="text"
                  placeholder="Search BNS, BNSS, BSA sections (e.g. theft, hurt, 323, BNSS 45)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full text-[11px] font-semibold px-3 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all ${
                    dark ? 'bg-white/[0.03] border-white/10 text-white' : 'bg-black/[0.02] border-black/10 text-brand-charcoal'
                  }`}
                />
              )}

              {loading && (
                <div className="p-4 text-center text-[10px] font-bold text-gray-400 flex flex-col items-center justify-center gap-2">
                  <span className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                  Loading BNS Sections...
                </div>
              )}

              {!loading && activeTab === 'suggested' && (
                recommended.length > 0 ? (
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {(showAllSuggested ? recommended : recommended.slice(0, SUGGESTED_PREVIEW_COUNT)).map(renderSectionRow)}
                    {!showAllSuggested && recommended.length > SUGGESTED_PREVIEW_COUNT && (
                      <button
                        type="button"
                        onClick={() => setShowAllSuggested(true)}
                        className="w-full py-1.5 text-center text-[9px] font-black uppercase tracking-wider text-blue-500 hover:text-blue-400"
                      >
                        Show {recommended.length - SUGGESTED_PREVIEW_COUNT} more
                      </button>
                    )}
                  </div>
                ) : blockers.length > 0 ? (
                  <div className={`p-4 text-center text-[10px] font-semibold ${T.muted(dark)}`}>
                    <span className={`block font-black uppercase tracking-wider mb-1 ${dark ? 'text-amber-400' : 'text-amber-600'}`}>Section suggestions unavailable</span>
                    This petition is missing required details ({blockers.join(', ')}), so AI section suggestions were skipped. Fix these in Mistakes / Warnings first, or use the ALL tab to add sections manually.
                  </div>
                ) : (
                  <div className={`p-4 text-center text-[10px] font-semibold ${T.muted(dark)}`}>
                    No AI-recommended sections found for this petition. Use the ALL tab to add sections manually.
                  </div>
                )
              )}

              {!loading && activeTab === 'all' && (
                <div
                  ref={listRef}
                  onScroll={handleListScroll}
                  className="space-y-1 max-h-60 overflow-y-auto"
                >
                  {allResults.length === 0 ? (
                    <div className={`p-4 text-center text-[10px] font-semibold ${T.muted(dark)}`}>
                      No matching BNS sections.
                    </div>
                  ) : (
                    <>
                      {allResults.map(renderSectionRow)}
                      {loadingMore && (
                        <div className="py-2 text-center text-[9px] font-bold text-gray-400">Loading more...</div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
