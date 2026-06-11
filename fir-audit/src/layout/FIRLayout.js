import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { checkMe } from '../api/auth';

export default function FIRLayout() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Sidebar collapsed state persisted in localStorage
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved !== null ? JSON.parse(saved) : false;
  });

  // Theme state synced with localStorage
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved !== null ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    const verifyUser = async () => {
      try {
        const data = await checkMe();
        if (data && data.success && data.user) {
          localStorage.setItem('logged_in_officer', JSON.stringify(data.user));
          // Dispatch storage event so Header and Sidebar update dynamically on load
          window.dispatchEvent(new Event('storage'));
        } else {
          localStorage.removeItem('logged_in_officer');
          navigate('/login');
        }
      } catch (err) {
        localStorage.removeItem('logged_in_officer');
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };
    verifyUser();
  }, [navigate]);

  useEffect(() => {
    localStorage.setItem('theme', JSON.stringify(dark));
  }, [dark]);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', JSON.stringify(collapsed));
  }, [collapsed]);

  const T = {
    bg:      (d) => d ? 'bg-brand-navy-950 text-white' : 'bg-brand-slate-50 text-brand-charcoal',
    sidebar: (d) => d ? 'bg-brand-navy-900 border-white/[0.06]' : 'bg-white border-black/[0.08] shadow-md',
    header:  (d) => d ? 'bg-brand-navy-950/70 border-white/[0.06] backdrop-blur-md' : 'bg-white/70 border-black/[0.08] backdrop-blur-md shadow-sm',
    border:  (d) => d ? 'border-white/[0.06]' : 'border-black/[0.08]',
    muted:   (d) => d ? 'text-white/50' : 'text-black/50',
    navActive: (d) => d ? 'bg-gradient-to-r from-blue-500/15 to-transparent text-blue-400 border-blue-500 shadow-[inset_3px_0_0_0_#3b82f6]' : 'bg-gradient-to-r from-blue-50 to-transparent text-blue-600 border-blue-600 shadow-[inset_3px_0_0_0_#2563eb]',
    navHover:  (d) => d ? 'hover:bg-white/[0.015] text-white/60 hover:text-white' : 'hover:bg-black/[0.015] text-black/60 hover:text-black',
  };

  if (loading) {
    return (
      <div className={`h-screen w-screen flex flex-col items-center justify-center transition-colors duration-300 ${dark ? 'bg-brand-navy-950 text-white' : 'bg-brand-slate-50 text-brand-charcoal'}`}>
        <div className="relative">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 flex items-center justify-center animate-pulse shadow-lg shadow-blue-500/25">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin pointer-events-none" />
        </div>
        <p className="text-xs font-mono tracking-widest uppercase mt-5 opacity-60">Verifying session...</p>
      </div>
    );
  }

  return (
    <div className={`h-screen overflow-hidden flex transition-colors duration-300 ${T.bg(dark)}`}>
      {/* Background grids and shapes */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className={`absolute top-0 right-0 w-[450px] h-[450px] rounded-full blur-[130px] ${dark ? 'bg-blue-600/5' : 'bg-blue-400/8'}`} />
        <div className={`absolute bottom-0 left-1/4 w-[450px] h-[450px] rounded-full blur-[130px] ${dark ? 'bg-violet-600/5' : 'bg-violet-300/8'}`} />
      </div>

      {/* Sidebar for Desktop - Width adjusts based on collapsed state */}
      <aside className={`hidden lg:block border-r shrink-0 relative z-40 h-screen transition-all duration-300 ${
        collapsed ? 'w-20' : 'w-64'
      } ${T.sidebar(dark)}`}>
        
        {/* Collapse toggle button — floats on the right edge */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand panel' : 'Collapse panel'}
          className={`hidden lg:flex absolute top-7 -right-3.5 w-7 h-7 rounded-full border-2 items-center justify-center z-50 shadow-md transition-all duration-300 ${
            dark
              ? 'bg-brand-navy-900 border-white/10 hover:border-blue-500 text-white/50 hover:text-blue-400'
              : 'bg-white border-black/10 hover:border-blue-500 text-black/40 hover:text-blue-600'
          }`}
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="h-full overflow-y-auto overflow-x-hidden">
          <Sidebar 
            dark={dark} 
            collapsed={collapsed} 
            setCollapsed={setCollapsed} 
            setMobileOpen={setMobileOpen} 
            T={T} 
          />
        </div>
      </aside>

      {/* Mobile Sidebar overlay */}
      {mobileOpen && (
        <div 
          onClick={() => setMobileOpen(false)} 
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar for Mobile - Always full width when toggled */}
      <aside className={`fixed inset-y-0 left-0 w-64 z-50 overflow-y-auto overflow-x-hidden transform transition-transform duration-300 ease-in-out lg:hidden ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      } ${T.sidebar(dark)}`}>
        <Sidebar 
          dark={dark} 
          collapsed={false} 
          setCollapsed={() => {}} 
          setMobileOpen={setMobileOpen} 
          T={T} 
        />
      </aside>

      {/* Main Content Area — header is sticky, main scrolls */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 z-10 relative">
        <Header 
          dark={dark} 
          setDark={setDark} 
          mobileOpen={mobileOpen} 
          setMobileOpen={setMobileOpen} 
          T={T} 
        />

        {/* Only this scrolls */}
        <main className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8">
          <Outlet context={{ dark }} />
        </main>
      </div>
    </div>
  );
}
