import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const navGroups = [
  {
    groupLabel: 'Auditing',
    items: [
      {
        path: '/dashboard',
        label: 'Compliance Overview',
        sublabel: 'Scores & stats',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
      },
      {
        path: '/dashboard/audits',
        label: 'Scan New Petition',
        sublabel: 'Upload & AI Check',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        ),
      },
      {
        path: '/dashboard/file-fir',
        label: 'File FIR',
        sublabel: 'Draft & Register',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
      },
      {
        path: '/dashboard/blockers',
        label: 'Blocker Flags',
        sublabel: 'Procedural errors',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        ),
      },
    ],
  },
  {
    groupLabel: 'Reports',
    items: [
      {
        path: '/dashboard/analytics',
        label: 'Audit Reports',
        sublabel: 'History & exports',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
      },
    ],
  },
  {
    groupLabel: 'Station',
    items: [
      {
        path: '/dashboard/settings',
        label: 'Station Config',
        sublabel: 'PS settings & rules',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      },
    ],
  },
];

export default function Sidebar({ dark, collapsed, setCollapsed, setMobileOpen, T }) {
  const navigate = useNavigate();
  const location = useLocation();

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

  const isActive = (path) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  };

  return (
    <div className={`flex flex-col h-full justify-between py-5 relative transition-all duration-300 ${collapsed ? 'px-3' : 'px-4'}`}>



      {/* ── TOP: Brand ───────────────────────────────── */}
      <div className="space-y-7">

        {/* Brand logo */}
        <div className={`flex items-center gap-3 px-1 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          {!collapsed && (
            <div className="leading-none">
              <div className="text-sm font-black tracking-tight">
                FIR<span className="text-blue-500">Audit</span>
                <span className={dark ? 'text-white/20' : 'text-black/20'}>.ai</span>
              </div>
              <div className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 ${dark ? 'text-white/30' : 'text-black/30'}`}>
                AI Legal Compliance
              </div>
            </div>
          )}
        </div>

        {/* Nav groups */}
        <div className="space-y-5">
          {navGroups.map((group) => (
            <div key={group.groupLabel}>
              {/* Group label (hidden when collapsed) */}
              {!collapsed && (
                <p className={`text-[9px] font-black uppercase tracking-widest mb-2 px-3 ${dark ? 'text-white/25' : 'text-black/25'}`}>
                  {group.groupLabel}
                </p>
              )}

              <nav className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      title={collapsed ? item.label : undefined}
                      className={`flex items-center rounded-xl text-xs font-bold transition-all duration-200 relative group ${
                        collapsed ? 'justify-center p-3' : 'px-3 py-2.5 gap-3'
                      } ${active ? T.navActive(dark) : T.navHover(dark)}`}
                    >
                      {/* Icon */}
                      <span className={`shrink-0 transition-transform duration-200 group-hover:scale-110 ${active ? 'text-blue-500' : ''}`}>
                        {item.icon}
                      </span>

                      {/* Label + sublabel */}
                      {!collapsed && (
                        <div className="flex-1 min-w-0">
                          <div className="truncate">{item.label}</div>
                          {item.sublabel && !active && (
                            <div className={`text-[9px] font-semibold mt-0.5 truncate ${dark ? 'text-white/30' : 'text-black/30'}`}>
                              {item.sublabel}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Badge */}
                      {item.badge && !collapsed && (
                        <span className={`shrink-0 text-[9px] font-black text-white px-1.5 py-0.5 rounded-full ${item.badgeColor}`}>
                          {item.badge}
                        </span>
                      )}

                      {/* Badge dot when collapsed */}
                      {item.badge && collapsed && (
                        <span className={`absolute top-2 right-2 w-2 h-2 rounded-full ${item.badgeColor}`} />
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>
      </div>

      {/* ── BOTTOM: Officer card + Sign out ──────────── */}
      <div className={`border-t pt-4 space-y-1 ${dark ? 'border-white/[0.06]' : 'border-black/[0.06]'}`}>

        {/* Officer mini-card */}
        {!collapsed ? (
          /* Expanded: full card with name and duty info */
          <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl ${dark ? 'bg-white/[0.03]' : 'bg-black/[0.02]'}`}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 text-white flex items-center justify-center font-black text-[11px] shrink-0 shadow-sm shadow-blue-500/20">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-black truncate">{displayName}</div>
              <div className="text-[9px] text-emerald-500 font-bold flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                On Duty · {officer.station}
              </div>
            </div>
          </div>
        ) : (
          /* Collapsed: just the avatar centred */
          <div className="flex justify-center py-1">
            <div
              title={`${displayName} — On Duty · ${officer.station}`}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white flex items-center justify-center font-black text-[11px] shadow-sm shadow-blue-500/20"
            >
              {initials}
            </div>
          </div>
        )}

        {/* Sign Out button */}
        <button
          onClick={() => {
            localStorage.removeItem('logged_in_officer');
            navigate('/login');
          }}
          title={collapsed ? 'Sign Out' : undefined}
          className={`flex items-center w-full rounded-xl text-xs font-bold transition-all duration-200 ${
            collapsed ? 'justify-center p-3' : 'px-3 py-2.5 gap-3'
          } ${dark
            ? 'text-white/40 hover:bg-red-500/10 hover:text-red-400'
            : 'text-black/40 hover:bg-red-50 hover:text-red-600'
          }`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>

    </div>
  );
}
