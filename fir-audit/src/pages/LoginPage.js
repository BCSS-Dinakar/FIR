import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import FIRButton from '../components/reusable/FIRButton';
import { registerUser, loginUser, checkMe } from '../api/auth';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved !== null ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    localStorage.setItem('theme', JSON.stringify(dark));
  }, [dark]);

  // Check if session is already active on mount
  useEffect(() => {
    const verifySession = async () => {
      try {
        const data = await checkMe();
        if (data && data.success && data.user) {
          navigate('/dashboard');
        }
      } catch (err) {
        // session invalid
      }
    };
    verifySession();
  }, [navigate]);

  const [email, setEmail] = useState('shiva@firaudit.gov.in');
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [activeForm, setActiveForm] = useState(() => {
    return location.state?.tab === 'register' ? 'register' : 'login';
  });

  // Registration States
  const [regName, setRegName] = useState('');
  const [regBadge, setRegBadge] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [regMobile, setRegMobile] = useState('');
  const [regStation, setRegStation] = useState('');

  // Status/Validation States
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const T = {
    bg: (d) => d ? 'bg-brand-navy-950 text-white' : 'bg-brand-slate-50 text-brand-charcoal',
    text: (d) => d ? 'text-white' : 'text-brand-charcoal',
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
    input: (d) => d ? 'bg-white/[0.04] border-white/10 text-white focus:border-blue-500 focus:bg-white/[0.08] focus:ring-4 focus:ring-blue-500/20 shadow-inner' : 'bg-black/[0.03] border-black/10 text-brand-charcoal focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/20 shadow-inner',
    accent: 'text-blue-400 hover:text-blue-300 transition-colors',
    accentLight: 'text-blue-600 hover:text-blue-700 transition-colors',
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const data = await loginUser({ email, password });

      if (data && data.success) {
        navigate('/dashboard');
        return;
      } else {
        setErrorMsg((data && data.message) || 'Authentication failed');
      }
    } catch (err) {
      console.error('Login connection error:', err);
      const apiMessage = err.response?.data?.message || err.response?.data?.error || err.message || 'Authentication error';
      setErrorMsg(apiMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!regEmail.toLowerCase().endsWith('.gov.in')) {
      setErrorMsg('Only secure government emails ending in .gov.in are allowed.');
      return;
    }

    if (!/^\d{10}$/.test(regMobile)) {
      setErrorMsg('Please enter a valid 10-digit mobile number.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMsg('Passwords do not match. Please verify.');
      return;
    }

    setLoading(true);
    try {
      const data = await registerUser({
        name: regName,
        badge: regBadge,
        email: regEmail,
        password: regPassword,
        mobile: regMobile,
        station: regStation
      });

      if (data && data.success) {
        // Fill sign-in fields automatically
        setEmail(regEmail);
        setPassword(regPassword);

        // Reset fields
        setRegName('');
        setRegBadge('');
        setRegEmail('');
        setRegPassword('');
        setRegConfirmPassword('');
        setShowRegPassword(false);
        setShowRegConfirmPassword(false);
        setRegMobile('');
        setRegStation('');

        setSuccessMsg(data.message || `Officer Account for ${regName} created successfully! Please login below.`);
        setActiveForm('login');
      } else {
        setErrorMsg((data && data.message) || 'Registration failed');
      }
    } catch (err) {
      console.error('Registration connection error:', err);
      const apiMessage = err.response?.data?.message || err.response?.data?.error || err.message || 'Registration error';
      setErrorMsg(apiMessage);
    } finally {
      setLoading(false);
    }
  };

  const renderError = () => {
    if (!errorMsg) return null;
    return (
      <div className={`p-4 mb-6 rounded-2xl border flex items-start gap-3 animate-shake backdrop-blur-md shadow-lg transition-all ${dark
        ? 'bg-rose-500/10 border-rose-500/30 text-rose-200 shadow-rose-500/5'
        : 'bg-rose-50/80 border-rose-200/80 text-rose-900 shadow-rose-900/5'
        }`}>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${dark ? 'bg-rose-500/20 text-rose-300' : 'bg-rose-100 text-rose-600'
          }`}>
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="flex-1 pt-0.5">
          <span className="block text-xs font-bold uppercase tracking-wider mb-0.5">
            Error Alert
          </span>
          <p className="text-xs font-medium opacity-90 leading-relaxed">
            {errorMsg}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setErrorMsg('')}
          className="text-gray-400 hover:text-gray-500 transition-colors p-1 shrink-0"
        >
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  };

  const renderSuccess = () => {
    if (!successMsg) return null;
    return (
      <div className={`p-4 mb-6 rounded-2xl border flex items-start gap-3 animate-in fade-in duration-300 backdrop-blur-md shadow-lg transition-all ${dark
        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200 shadow-emerald-500/5'
        : 'bg-emerald-50/80 border-emerald-200/80 text-emerald-900 shadow-emerald-900/5'
        }`}>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${dark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-600'
          }`}>
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0" />
          </svg>
        </div>
        <div className="flex-1 pt-0.5">
          <span className="block text-xs font-bold uppercase tracking-wider mb-0.5">
            Success Confirmation
          </span>
          <p className="text-xs font-medium opacity-90 leading-relaxed">
            {successMsg}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSuccessMsg('')}
          className="text-gray-400 hover:text-gray-500 transition-colors p-1 shrink-0"
        >
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  };

  return (
    <div className={`min-h-screen flex transition-colors duration-500 ${T.bg(dark)}`}>
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>

      {/* Dynamic Background Glows */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className={`absolute top-0 left-1/3 w-[600px] h-[600px] rounded-full blur-[130px] ${dark ? 'bg-blue-700/5' : 'bg-blue-400/10'}`} />
        <div className={`absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full blur-[130px] ${dark ? 'bg-violet-700/5' : 'bg-violet-300/10'}`} />
      </div>

      {/* Theme toggle & Back button in floating bar */}
      <div className="absolute top-6 right-6 z-30 flex items-center gap-3">
        <FIRButton
          variant="secondary"
          dark={dark}
          onClick={() => navigate('/')}
          icon={
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          }
        >
          Back to Home
        </FIRButton>
        <button
          onClick={() => setDark(!dark)}
          className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${dark ? 'bg-white/[0.04] border-white/10 text-yellow-300 hover:bg-white/[0.08]' : 'bg-white border-black/10 text-indigo-600 hover:bg-black/[0.02] shadow-sm'}`}
        >
          {dark ? (
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m8.66-9H21M3 12H2m15.36-6.36l-.71.71M6.34 17.66l-.71.71M17.66 17.66l-.71-.71M6.34 6.34l-.71-.71M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
          ) : (
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
      </div>

      {/* LEFT COLUMN: Beautiful Image & Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-16 border-r border-white/5 bg-brand-navy-950">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center opacity-85 transition-transform duration-10000 hover:scale-105"
          style={{ backgroundImage: `url('/login_banner.png')` }}
        />
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-brand-navy-950 via-brand-navy-950/40 to-brand-navy-950/70" />

        <div className="relative z-20 flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            FIR<span className="text-blue-400">Audit</span>
            <span className="text-white/20">.ai</span>
          </span>
        </div>

        <div className="relative z-20 max-w-md bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
            <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400">AI Legal Intelligence Active</span>
          </div>
          <h2 className="text-3xl font-black text-white leading-tight mb-3">
            Ensuring procedural compliance before court submission.
          </h2>
          <p className="text-sm text-white/60 leading-relaxed font-medium">
            Our neural auditor cross-checks case details with standard IPC/BNS requirements, removing roadblocks and generating court-ready documentation instantly.
          </p>
        </div>

        <div className="relative z-20 text-[11px] text-white/30 tracking-wider font-mono font-medium">
          SECURED GOVERNMENT & LAW ENFORCEMENT PORTAL
        </div>
      </div>

      {/* RIGHT COLUMN: Premium Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 md:p-16 relative z-10 overflow-hidden">

        {/* Glow behind form */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-blue-500/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="w-full max-w-md relative z-10">

          <div key={activeForm} className="animate-in slide-in-from-right-8 fade-in duration-500 fill-mode-both">

            {/* ── SIGN IN FORM ── */}
            {activeForm === 'login' && (
              <>
                <div className="mb-10 text-center">
                  <h1 className="text-3xl font-black tracking-tight mb-2">
                    Welcome Back
                  </h1>
                  <p className={`text-sm ${T.muted(dark)}`}>
                    Access the compliance dashboard
                  </p>
                </div>

                {renderSuccess()}
                {renderError()}

                <form onSubmit={handleLogin} className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2 ml-1" htmlFor="email">
                      Government Email / ID
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                        </svg>
                      </span>
                      <input
                        id="email"
                        type="text"
                        required
                        placeholder="e.g., officer.name@policestate.gov.in"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={`w-full pl-12 pr-5 py-4 rounded-2xl border text-sm transition-all focus:outline-none ${T.input(dark)}`}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2 ml-1">
                      <label className="text-xs font-bold uppercase tracking-wider" htmlFor="password">
                        Password
                      </label>
                    </div>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </span>
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        required
                        placeholder="Enter secure password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`w-full pl-12 pr-12 py-4 rounded-2xl border text-sm transition-all focus:outline-none ${T.input(dark)}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-500 transition-colors p-1"
                      >
                        {showPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.025 10.025 0 012.25-3.65m3.431-1.393A9.903 9.903 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-2.25 3.65m-3.431 1.393M9 11l5 5M12 12l.01-.01" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 px-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="rounded border-gray-400/30 text-blue-500 focus:ring-blue-500/50 bg-transparent"
                      />
                      <span className={`font-medium ${T.muted(dark)}`}>Remember me</span>
                    </label>

                    <div className="flex flex-col text-right gap-1.5 font-bold">
                      <button type="button" onClick={() => setActiveForm('forgot')} className={dark ? T.accent : T.accentLight}>
                        Forgot password?
                      </button>
                      <button type="button" onClick={() => setActiveForm('find')} className={dark ? T.accent : T.accentLight}>
                        Find account
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full relative group overflow-hidden rounded-2xl bg-blue-600 text-white font-bold tracking-wide py-4 text-sm shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-all duration-300 mt-4 ${loading ? 'opacity-75 cursor-not-allowed' : ''}`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-500 group-hover:scale-105 transition-transform duration-500" />
                    <div className="relative flex items-center justify-center gap-2">
                      {loading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Signing In...
                        </>
                      ) : (
                        <>
                          Sign In Securely
                          <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </>
                      )}
                    </div>
                  </button>
                </form>

                <div className="mt-8 text-center text-sm font-medium pt-2">
                  <span className={T.muted(dark)}>New to FIRAudit.ai? </span>
                  <button
                    onClick={() => setActiveForm('register')}
                    className={`font-bold transition-all hover:underline ${dark ? 'text-blue-400' : 'text-blue-600'}`}
                  >
                    Create Account
                  </button>
                </div>
              </>
            )}

            {/* ── CREATE ACCOUNT FORM ── */}
            {activeForm === 'register' && (
              <>
                <div className="mb-4 text-center">
                  <h1 className="text-2xl font-black tracking-tight mb-1">
                    Register Officer
                  </h1>
                  <p className={`text-xs ${T.muted(dark)}`}>
                    Create your secure credentials
                  </p>
                </div>

                {renderError()}

                <form onSubmit={handleRegister} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1 ml-1">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Insp. Shiva Kumar"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className={`w-full px-5 py-2.5 rounded-2xl border text-sm focus:outline-none ${T.input(dark)}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1 ml-1">Badge Number</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. TS-9923"
                      value={regBadge}
                      onChange={(e) => setRegBadge(e.target.value)}
                      className={`w-full px-5 py-2.5 rounded-2xl border text-sm focus:outline-none ${T.input(dark)}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1 ml-1">Gov Email</label>
                    <input
                      type="email"
                      required
                      placeholder="name@policestate.gov.in"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className={`w-full px-5 py-2.5 rounded-2xl border text-sm focus:outline-none ${T.input(dark)}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1 ml-1">Mobile No</label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 9876543210"
                      value={regMobile}
                      onChange={(e) => setRegMobile(e.target.value)}
                      className={`w-full px-5 py-2.5 rounded-2xl border text-sm focus:outline-none ${T.input(dark)}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1 ml-1">Police Station / PS Code</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. PS/HYD/04"
                      value={regStation}
                      onChange={(e) => setRegStation(e.target.value)}
                      className={`w-full px-5 py-2.5 rounded-2xl border text-sm focus:outline-none ${T.input(dark)}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1 ml-1">Password</label>
                    <div className="relative">
                      <input
                        type={showRegPassword ? "text" : "password"}
                        required
                        placeholder="Create secure password"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className={`w-full pl-5 pr-12 py-2.5 rounded-2xl border text-sm focus:outline-none ${T.input(dark)}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-500 transition-colors p-1"
                      >
                        {showRegPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.025 10.025 0 01-2.25 3.65m3.431-1.393A9.903 9.903 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-2.25 3.65m-3.431 1.393M9 11l5 5M12 12l.01-.01" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1 ml-1">Confirm Password</label>
                    <div className="relative">
                      <input
                        type={showRegConfirmPassword ? "text" : "password"}
                        required
                        placeholder="Verify secure password"
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        className={`w-full pl-5 pr-12 py-2.5 rounded-2xl border text-sm focus:outline-none ${T.input(dark)}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-500 transition-colors p-1"
                      >
                        {showRegConfirmPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.025 10.025 0 01-2.25 3.65m3.431-1.393A9.903 9.903 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-2.25 3.65m-3.431 1.393M9 11l5 5M12 12l.01-.01" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full relative group overflow-hidden rounded-2xl bg-blue-600 text-white font-bold tracking-wide py-3 text-sm shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-all duration-300 mt-4 ${loading ? 'opacity-75 cursor-not-allowed' : ''}`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-500 group-hover:scale-105 transition-transform duration-500" />
                    <div className="relative flex items-center justify-center gap-2">
                      {loading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Creating Account...
                        </>
                      ) : (
                        <span>Create Account</span>
                      )}
                    </div>
                  </button>
                </form>

                <div className="mt-8 text-center text-sm font-medium pt-2">
                  <span className={T.muted(dark)}>Already registered? </span>
                  <button onClick={() => setActiveForm('login')} className={`font-bold transition-all hover:underline ${dark ? 'text-blue-400' : 'text-blue-600'}`}>
                    Sign In
                  </button>
                </div>
              </>
            )}

            {/* ── FORGOT PASSWORD FORM ── */}
            {activeForm === 'forgot' && (
              <>
                <div className="mb-10 text-center">
                  <h1 className="text-3xl font-black tracking-tight mb-2">
                    Reset Password
                  </h1>
                  <p className={`text-sm ${T.muted(dark)}`}>
                    We will send a reset link to your gov email
                  </p>
                </div>

                {renderError()}

                <form onSubmit={(e) => { e.preventDefault(); alert('Reset link sent!'); setActiveForm('login'); }} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2 ml-1">Government Email</label>
                    <input type="email" required placeholder="name@policestate.gov.in" className={`w-full px-5 py-4 rounded-2xl border text-sm focus:outline-none ${T.input(dark)}`} />
                  </div>

                  <button type="submit" className="w-full relative group overflow-hidden rounded-2xl bg-blue-600 text-white font-bold tracking-wide py-4 text-sm shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-all duration-300 mt-6">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-500 group-hover:scale-105 transition-transform duration-500" />
                    <span className="relative">Send Reset Link</span>
                  </button>
                </form>

                <div className="mt-8 text-center text-sm font-medium pt-2">
                  <button onClick={() => setActiveForm('login')} className={`font-bold transition-all hover:underline ${dark ? 'text-blue-400' : 'text-blue-600'}`}>
                    ← Back to Sign In
                  </button>
                </div>
              </>
            )}

            {/* ── FIND ACCOUNT FORM ── */}
            {activeForm === 'find' && (
              <>
                <div className="mb-10 text-center">
                  <h1 className="text-3xl font-black tracking-tight mb-2">
                    Find Account
                  </h1>
                  <p className={`text-sm ${T.muted(dark)}`}>
                    Enter your badge number to locate your ID
                  </p>
                </div>

                {renderError()}

                <form onSubmit={(e) => { e.preventDefault(); alert('Account found: officer.shiva@...'); setActiveForm('login'); }} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2 ml-1">Badge Number</label>
                    <input type="text" required placeholder="e.g. TS-9923" className={`w-full px-5 py-4 rounded-2xl border text-sm focus:outline-none ${T.input(dark)}`} />
                  </div>

                  <button type="submit" className="w-full relative group overflow-hidden rounded-2xl bg-blue-600 text-white font-bold tracking-wide py-4 text-sm shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-all duration-300 mt-6">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-500 group-hover:scale-105 transition-transform duration-500" />
                    <span className="relative">Locate Account</span>
                  </button>
                </form>

                <div className="mt-8 text-center text-sm font-medium pt-2">
                  <button onClick={() => setActiveForm('login')} className={`font-bold transition-all hover:underline ${dark ? 'text-blue-400' : 'text-blue-600'}`}>
                    ← Back to Sign In
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
