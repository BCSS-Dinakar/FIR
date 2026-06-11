import { useState } from 'react';

export default function SectionSelector({ 
  dark, 
  sections = [], 
  onChange, 
  recommendedSections = [], 
  allBnsSections = [] 
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleSection = (code) => {
    if (sections.includes(code)) {
      onChange(sections.filter(x => x !== code));
    } else {
      onChange([...sections, code]);
    }
  };

  const T = {
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
  };

  return (
    <div className="relative">
      <label className="text-[10px] font-bold uppercase tracking-wider block mb-1.5 opacity-55">
        Applied Sections (Classification)
      </label>
      
      {/* Clickable box displaying active sections */}
      <div 
        onClick={() => setDropdownOpen(!dropdownOpen)}
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
          
          <div className={`absolute left-0 right-0 mt-1 p-3 rounded-xl border z-20 shadow-2xl space-y-3 max-h-60 overflow-y-auto ${
            dark ? 'bg-brand-navy-950 border-white/10 text-white' : 'bg-white border-black/10 text-brand-charcoal'
          }`}>
            {/* Search input inside dropdown */}
            <div className="relative">
              <input 
                type="text"
                placeholder="Search sections (e.g. theft, hurt)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full text-[11px] font-semibold px-3 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all ${
                  dark ? 'bg-white/[0.03] border-white/10 text-white' : 'bg-black/[0.02] border-black/10 text-brand-charcoal'
                }`}
              />
            </div>

            {/* Section: Recommended Sections */}
            {searchQuery === '' && recommendedSections.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[9px] font-black uppercase tracking-wider text-blue-500 flex items-center gap-1">
                  <span>⭐</span> Recommended (Auto-detected)
                </div>
                <div className="space-y-1">
                  {recommendedSections.map(secCode => {
                    const match = allBnsSections.find(x => x.code === secCode) || { code: secCode, desc: '' };
                    const isSelected = sections.includes(secCode);
                    return (
                      <div 
                        key={secCode}
                        onClick={() => toggleSection(secCode)}
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
                          <span className="font-bold block">{match.code}</span>
                          {match.desc && <span className="text-[9px] opacity-60 block mt-0.5">{match.desc}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Section: General / Search Results List */}
            <div className="space-y-1.5 pt-1.5 border-t border-gray-400/10">
              <div className={`text-[9px] font-black uppercase tracking-wider ${T.muted(dark)}`}>
                {searchQuery === '' ? 'Other BNS Sections' : 'Search Results'}
              </div>
              <div className="space-y-1">
                {allBnsSections
                  .filter(x => {
                    if (searchQuery === '') {
                      return !recommendedSections.includes(x.code);
                    }
                    return x.code.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           x.desc.toLowerCase().includes(searchQuery.toLowerCase());
                  })
                  .map(sec => {
                    const isSelected = sections.includes(sec.code);
                    return (
                      <div 
                        key={sec.code}
                        onClick={() => toggleSection(sec.code)}
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
                          <span className="font-bold block">{sec.code}</span>
                          <span className="text-[9px] opacity-60 block mt-0.5">{sec.desc}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}
