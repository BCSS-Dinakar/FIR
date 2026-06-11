import FIRButton from '../components/reusable/FIRButton';
import { useState, useEffect } from 'react';

export default function Header({ dark, setDark, mobileOpen, setMobileOpen, T }) {
  const [showNotifications, setShowNotifications] = useState(false);

  const [officer, setOfficer] = useState(() => {
    const saved = localStorage.getItem('logged_in_officer');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // fallback
      }
    }
    return {
      name: 'Insp. K. Shiva Kumar',
      badge: 'TS-9923',
      rank: 'Inspector',
      station: 'PS/HYD/04'
    };
  });

  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem('logged_in_officer');
      if (saved) {
        try {
          setOfficer(JSON.parse(saved));
        } catch (e) {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const getInitials = (name) => {
    if (!name) return 'KS';
    const parts = name.replace(/^(Insp\.|Sub-Insp\.|Asst\.|Insp|SI|ASI|DSP|Constable)\.?\s+/i, '').split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0] ? parts[0].substring(0, 2).toUpperCase() : 'KS';
  };

  const formatRankName = (rank, name) => {
    if (name.includes('Insp.') || name.includes('Sub-Insp.') || name.includes('SI ') || name.includes('ASI ') || name.includes('DSP ')) {
      return name;
    }
    const rankPrefixes = {
      'Inspector': 'Insp. ',
      'Sub-Inspector': 'SI ',
      'Assistant Sub-Inspector': 'ASI ',
      'DSP': 'DSP ',
      'Constable': 'PC '
    };
    return (rankPrefixes[rank] || '') + name;
  };

  const initials = getInitials(officer.name);
  const displayName = formatRankName(officer.rank, officer.name);
  return (
    <header className={`sticky top-0 z-30 border-b flex items-center justify-between px-5 py-3 transition-colors duration-300 ${T.header(dark)}`}>

      {/* ── LEFT: Hamburger + FIR Search ── */}
      <div className="flex items-center gap-3">

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className={`p-2 rounded-lg border lg:hidden transition-all ${T.border(dark)} ${
            dark ? 'bg-white/[0.03] hover:bg-white/[0.07]' : 'bg-white shadow-sm hover:bg-black/[0.02]'
          }`}
        >
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* FIR Number / Section Search */}
        <div className={`hidden md:flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-xs w-48 lg:w-80 transition-all duration-200 focus-within:ring-1 focus-within:ring-blue-500/40 ${
          dark
            ? 'bg-white/[0.03] border-white/[0.07] focus-within:border-blue-500/50'
            : 'bg-black/[0.015] border-black/[0.07] focus-within:border-blue-600/50 shadow-sm'
        }`}>
          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search FIR No., BNS section, complainant..."
            className="bg-transparent border-none outline-none text-[11px] font-medium w-full placeholder-gray-400"
          />
          <kbd className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded border font-mono ${
            dark ? 'border-white/10 text-white/30 bg-white/[0.03]' : 'border-black/10 text-black/30 bg-black/[0.03]'
          }`}>⌘K</kbd>
        </div>
      </div>

      {/* ── RIGHT: Status indicators + Controls + Officer ── */}
      <div className="flex items-center gap-2.5">

        {/* Active Blocker Alerts — most critical indicator */}
        <div className="hidden xl:block">
          <FIRButton
            variant="danger"
            dark={dark}
            title="View Mistakes / Errors"
            className="font-black"
            icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            }
          >
            3 Mistakes
          </FIRButton>
        </div>

        {/* Pending Audit Queue count */}
        <div className="hidden lg:block">
          <FIRButton
            variant="warning"
            dark={dark}
            title="Open Pending Cases"
            className="font-black"
            icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          >
            5 Pending Cases
          </FIRButton>
        </div>

        {/* Divider */}
        <div className={`hidden lg:block h-5 w-px mx-0.5 ${dark ? 'bg-white/10' : 'bg-black/10'}`} />

        {/* Theme toggle */}
        <button
          onClick={() => setDark(!dark)}
          title="Toggle theme"
          className={`w-8.5 h-8.5 rounded-lg border flex items-center justify-center transition-all ${
            dark
              ? 'bg-white/[0.03] border-white/10 text-yellow-300 hover:bg-white/[0.08]'
              : 'bg-white border-black/10 text-indigo-600 hover:bg-black/[0.02] shadow-sm'
          }`}
        >
          {dark ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 3v1m0 16v1m8.66-9H21M3 12H2m15.36-6.36l-.71.71M6.34 17.66l-.71.71M17.66 17.66l-.71-.71M6.34 6.34l-.71-.71M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {/* Notification bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            title="System notifications"
            className={`relative w-8.5 h-8.5 rounded-lg border flex items-center justify-center transition-all ${
              dark
                ? 'bg-white/[0.03] border-white/10 text-white/70 hover:bg-white/[0.08]'
                : 'bg-white border-black/10 text-black/60 hover:bg-black/[0.02] shadow-sm'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {/* Live pulse dot */}
            <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-blue-500">
              <span className="absolute inset-0 rounded-full bg-blue-500 animate-ping opacity-75" />
            </span>
          </button>

          {showNotifications && (
            <div className={`absolute right-0 mt-2 w-72 rounded-xl border shadow-2xl overflow-hidden z-50 animate-in slide-in-from-top-2 duration-200 ${
              dark ? 'bg-brand-navy-900 border-white/10' : 'bg-white border-black/10'
            }`}>
              <div className={`px-4 py-3 border-b flex justify-between items-center ${dark ? 'border-white/10' : 'border-black/10'}`}>
                <span className="text-xs font-bold">Notifications</span>
                <span className="text-[10px] text-blue-500 font-bold cursor-pointer hover:underline">Mark all read</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <div className={`px-4 py-3 border-b transition-colors cursor-pointer ${dark ? 'border-white/5 hover:bg-white/5' : 'border-black/5 hover:bg-black/5'}`}>
                  <div className="text-[10px] font-bold text-red-500 mb-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    Critical Mistake
                  </div>
                  <div className="text-xs font-medium">FIR/HYD/226/103 missing Forensic ID.</div>
                  <div className={`text-[9px] mt-1 ${dark ? 'text-white/40' : 'text-black/40'}`}>2 mins ago</div>
                </div>
                <div className={`px-4 py-3 border-b transition-colors cursor-pointer ${dark ? 'border-white/5 hover:bg-white/5' : 'border-black/5 hover:bg-black/5'}`}>
                  <div className="text-[10px] font-bold text-emerald-500 mb-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    FIR Checked
                  </div>
                  <div className="text-xs font-medium">FIR/HYD/226/095 scored 95% (Ready to File).</div>
                  <div className={`text-[9px] mt-1 ${dark ? 'text-white/40' : 'text-black/40'}`}>1 hour ago</div>
                </div>
                <div className={`px-4 py-3 transition-colors cursor-pointer ${dark ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}>
                  <div className="text-[10px] font-bold text-amber-500 mb-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    System Update
                  </div>
                  <div className="text-xs font-medium">BNSS Section database updated.</div>
                  <div className={`text-[9px] mt-1 ${dark ? 'text-white/40' : 'text-black/40'}`}>Yesterday</div>
                </div>
                <div className={`px-4 py-3 border-b transition-colors cursor-pointer ${dark ? 'border-white/5 hover:bg-white/5' : 'border-black/5 hover:bg-black/5'}`}>
                  <div className="text-[10px] font-bold text-red-500 mb-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    Critical Mistake
                  </div>
                  <div className="text-xs font-medium">FIR/HYD/226/088 weight mismatch.</div>
                  <div className={`text-[9px] mt-1 ${dark ? 'text-white/40' : 'text-black/40'}`}>Yesterday</div>
                </div>
                <div className={`px-4 py-3 border-b transition-colors cursor-pointer ${dark ? 'border-white/5 hover:bg-white/5' : 'border-black/5 hover:bg-black/5'}`}>
                  <div className="text-[10px] font-bold text-emerald-500 mb-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    FIR Checked
                  </div>
                  <div className="text-xs font-medium">FIR/HYD/226/092 scored 98% (Ready to File).</div>
                  <div className={`text-[9px] mt-1 ${dark ? 'text-white/40' : 'text-black/40'}`}>2 days ago</div>
                </div>
                <div className={`px-4 py-3 transition-colors cursor-pointer ${dark ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}>
                  <div className="text-[10px] font-bold text-blue-500 mb-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Weekly Report
                  </div>
                  <div className="text-xs font-medium">Your weekly station report is ready.</div>
                  <div className={`text-[9px] mt-1 ${dark ? 'text-white/40' : 'text-black/40'}`}>3 days ago</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className={`h-5 w-px mx-0.5 ${dark ? 'bg-white/10' : 'bg-black/10'}`} />

        {/* Officer identity + shift status */}
        <div className="flex items-center gap-2.5 cursor-pointer group">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-white font-black text-[10px] shadow-sm shadow-blue-500/20 shrink-0 group-hover:shadow-blue-500/40 transition-all">
            {initials}
          </div>

          {/* Name + shift */}
          <div className="hidden sm:block leading-none">
            <div className="text-[11px] font-black group-hover:text-blue-500 transition-colors">
              {displayName}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${
                dark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
              }`}>
                Day Shift
              </span>
              <span className={`text-[9px] ${dark ? 'text-white/30' : 'text-black/30'}`}>· {officer.station}</span>
            </div>
          </div>

          {/* Chevron */}
          <svg className={`w-3 h-3 hidden sm:block transition-transform group-hover:translate-y-0.5 ${dark ? 'text-white/30' : 'text-black/30'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

    </header>
  );
}
