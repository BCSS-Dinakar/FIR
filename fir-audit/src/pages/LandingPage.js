import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import FIRButton from '../components/reusable/FIRButton';

const TYPING_LINES = [
  'Extracting text from handwritten petition...',
  'Identifying IPC Sections: 420, 120B ✓',
  'Validating BNSS procedural compliance...',
  'Forensic Lab ID missing — flagging blocker ⚠',
  'Compliance Score: 91 / 100',
  'Generating FIR PDF... locked until resolved.',
];

function TypingTerminal({ dark = true }) {
  const [lines, setLines] = useState([]);
  const [currentLine, setCurrentLine] = useState(0);
  const [currentChar, setCurrentChar] = useState(0);
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    if (currentLine >= TYPING_LINES.length) return;
    const target = TYPING_LINES[currentLine];
    if (currentChar < target.length) {
      const t = setTimeout(() => {
        setDisplayed((p) => p + target[currentChar]);
        setCurrentChar((c) => c + 1);
      }, 28);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => {
        setLines((prev) => [...prev, target]);
        setDisplayed('');
        setCurrentChar(0);
        setCurrentLine((l) => l + 1);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [currentChar, currentLine]);

  const lineColor = (line) => {
    if (line.includes('⚠')) return 'text-yellow-400 font-bold';
    if (line.includes('✓')) return 'text-emerald-400 font-bold';
    if (line.includes('locked')) return 'text-red-400 font-bold';
    return dark ? 'text-white/70' : 'text-black/70';
  };

  return (
    <div className={`p-6 font-mono text-sm space-y-3 min-h-[250px]`}>
      {lines.map((line, i) => (
        <div key={i} className="flex gap-3 items-start animate-in fade-in slide-in-from-bottom-2 duration-300">
          <span className="text-blue-500 shrink-0">›</span>
          <span className={lineColor(line)}>{line}</span>
        </div>
      ))}
      {currentLine < TYPING_LINES.length && (
        <div className="flex gap-3 items-start">
          <span className="text-blue-500 shrink-0">›</span>
          <span className={dark ? 'text-white/90' : 'text-black/90'}>
            {displayed}
            <span className="inline-block w-[8px] h-[14px] bg-blue-400 ml-1 animate-pulse align-middle shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
          </span>
        </div>
      )}
    </div>
  );
}

const STEPS = [
  {
    num: '01',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    ),
    title: 'Upload Complaint',
    desc: 'Officer uploads a handwritten or typed petition — PDF or image, in Telugu or English.',
    color: 'from-blue-600 to-cyan-400',
    shadow: 'shadow-blue-500/40',
  },
  {
    num: '02',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    title: 'AI Extraction',
    desc: 'Gemini Vision AI reads handwriting. Tesseract OCR handles typed documents seamlessly.',
    color: 'from-violet-600 to-fuchsia-400',
    shadow: 'shadow-violet-500/40',
  },
  {
    num: '03',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: 'Auto-Draft FIR',
    desc: 'AI fills all 15 official FIR sections — complainant, accused, location, legal sections, witnesses.',
    color: 'from-indigo-600 to-blue-400',
    shadow: 'shadow-indigo-500/40',
  },
  {
    num: '04',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: 'Legal Audit',
    desc: 'AI checks IPC / BNS / NDPS sections. Scores compliance. Flags every single error.',
    color: 'from-emerald-500 to-teal-400',
    shadow: 'shadow-emerald-500/40',
  },
  {
    num: '05',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: 'Generate PDF',
    desc: 'Once blockers are cleared, the final court-ready FIR PDF is unlocked and generated.',
    color: 'from-orange-500 to-yellow-400',
    shadow: 'shadow-orange-500/40',
  },
];

const FEATURES = [
  { icon: '✍️', title: 'Handwriting Recognition', desc: 'Gemini Vision reads handwritten petitions in Telugu & English with near-perfect accuracy.' },
  { icon: '⚖️', title: 'Smart Legal Validation', desc: 'Auto-maps facts to IPC / BNS / NDPS sections. Flags wrong or missing sections instantly.' },
  { icon: '🔒', title: 'Gatekeeper System', desc: 'PDF is locked until every procedural blocker is resolved. Zero court-invalid FIRs.' },
  { icon: '📊', title: 'Command Dashboard', desc: 'Station supervisors see audit history, compliance trends, and blocked error counts in real time.' },
  { icon: '🧾', title: '15-Section Auto Fill', desc: 'All official FIR fields auto-populated — complainant, accused, occurrence details, witnesses.' },
  { icon: '🔁', title: 'Full Audit Trail', desc: 'Every extraction and audit is saved. Review, re-audit, or generate PDFs anytime.' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved !== null ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    localStorage.setItem('theme', JSON.stringify(dark));
  }, [dark]);

  const T = {
    bg: (d) => d ? 'bg-brand-navy-950 text-white' : 'bg-brand-slate-50 text-brand-charcoal',
    text: (d) => d ? 'text-white' : 'text-brand-charcoal',
    muted: (d) => d ? 'text-white/60' : 'text-black/60',
    border: (d) => d ? 'border-white/[0.08]' : 'border-black/[0.08]',
    glass: (d) => d ? 'bg-white/[0.03] border-white/[0.08] shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-2xl hover:bg-white/[0.05] hover:border-white/[0.15]' : 'bg-white/60 border-black/[0.05] shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl hover:bg-white hover:border-black/[0.1]',
    accent: 'text-blue-400',
  };

  return (
    <div className={`min-h-screen overflow-x-hidden font-sans transition-colors duration-500 ${T.bg(dark)}`}>

      {/* Immersive Background Glows */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] rounded-full blur-[150px] transition-all duration-1000 ${dark ? 'bg-blue-700/15' : 'bg-blue-400/20'}`} />
        <div className={`absolute top-[60%] right-[-10%] w-[600px] h-[600px] rounded-full blur-[130px] transition-all duration-1000 ${dark ? 'bg-violet-700/15' : 'bg-violet-300/25'}`} />
        <div className={`absolute top-[30%] left-[-10%] w-[500px] h-[500px] rounded-full blur-[120px] transition-all duration-1000 ${dark ? 'bg-cyan-700/10' : 'bg-cyan-300/20'}`} />
        <div className={`absolute inset-0 ${dark ? 'opacity-[0.03]' : 'opacity-[0.06]'}`} style={{ backgroundImage: `radial-gradient(circle, ${dark ? '#ffffff' : '#0d1117'} 1.5px, transparent 1.5px)`, backgroundSize: '32px 32px' }} />
      </div>

      {/* Glassmorphic Sticky Header */}
      <header className={`fixed top-0 w-full z-50 flex items-center justify-between px-6 lg:px-16 py-4 border-b backdrop-blur-xl transition-all duration-300 ${T.border(dark)} ${dark ? 'bg-brand-navy-950/70' : 'bg-white/70'}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          </div>
          <span className="text-xl font-bold tracking-tight">
            FIR<span className={T.accent}>Audit</span>
            <span className={dark ? 'text-white/30' : 'text-black/30'}>.ai</span>
          </span>
        </div>

        <nav className={`hidden md:flex items-center gap-8 font-medium text-sm ${T.muted(dark)}`}>
          {['Features', 'How it Works', 'Stats'].map((item) => (
            <a key={item} href={`#${item.toLowerCase().replace(/ /g, '-')}`} className={`transition-colors duration-200 hover:${dark ? 'text-white' : 'text-blue-600'}`}>{item}</a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <button onClick={() => setDark(!dark)} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 border ${dark ? 'bg-white/[0.04] border-white/10 text-yellow-300 hover:bg-white/[0.08]' : 'bg-white border-black/10 text-indigo-600 shadow-sm hover:bg-gray-50'}`}>
            {dark ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m8.66-9H21M3 12H2m15.36-6.36l-.71.71M6.34 17.66l-.71.71M17.66 17.66l-.71-.71M6.34 6.34l-.71-.71M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>}
          </button>
          <FIRButton variant="secondary" dark={dark} className="px-5 font-bold" onClick={() => navigate('/login')}>Sign In</FIRButton>
          <button onClick={() => navigate('/register')} className="relative group overflow-hidden rounded-xl bg-blue-600 text-white font-bold px-6 py-2.5 text-sm shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-500 group-hover:scale-105 transition-transform duration-500" />
            <span className="relative">Start Free Audit</span>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16 pt-40 pb-20 grid lg:grid-cols-2 gap-16 items-center">
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="inline-flex items-center gap-2.5 bg-blue-500/10 border border-blue-500/25 text-blue-500 text-xs font-black uppercase tracking-widest px-4 py-2 rounded-full mb-8 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shadow-[0_0_8px_rgba(96,165,250,0.8)]" /> AI · Legal Intelligence
          </div>
          <h1 className="text-4xl lg:text-5xl xl:text-6xl font-black leading-[1.1] tracking-tight mb-8">
            FIRs that hold up <span className="bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500 bg-[length:200%_auto] animate-gradient-x bg-clip-text text-transparent">in court.</span>
          </h1>
          <p className={`text-lg lg:text-xl leading-relaxed mb-10 max-w-lg font-medium ${T.muted(dark)}`}>
            Upload a complaint. AI reads it, fills the official FIR, audits every legal section under BNS & BNSS, and blocks errors before they cost you the case.
          </p>
          <div className="flex flex-wrap gap-4 mb-14">
            <button onClick={() => navigate('/register')} className="relative group overflow-hidden rounded-2xl bg-blue-600 text-white font-bold px-8 py-4 text-base shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_30px_rgba(37,99,235,0.6)] transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-500 group-hover:scale-105 transition-transform duration-500" />
              <div className="relative flex items-center justify-center gap-2">
                Start Free Audit
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </div>
            </button>
          </div>
          <div className="flex flex-wrap gap-10">
            {[{ val: '14,289+', label: 'FIRs Audited' }, { val: '94.8%', label: 'Compliance Rate' }, { val: '3,402', label: 'Errors Caught' }].map((b) => (
              <div key={b.label} className="flex flex-col group">
                <span className={`text-3xl font-black bg-gradient-to-r bg-clip-text text-transparent ${dark ? 'from-white to-white/60' : 'from-slate-900 to-slate-500'}`}>{b.val}</span>
                <span className={`text-[11px] font-bold uppercase tracking-widest mt-1 group-hover:text-blue-500 transition-colors ${T.muted(dark)}`}>{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Hero Graphic: Ultra Premium Glass Terminal */}
        <div className="relative animate-in fade-in slide-in-from-right-8 duration-1000 delay-150">
          <div className="absolute -inset-8 bg-blue-600/20 rounded-[3rem] blur-3xl opacity-70" />
          <div className={`relative border rounded-[2rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-2xl ${dark ? 'bg-brand-navy-900/60 border-white/10' : 'bg-white/80 border-white/40'}`}>
            {/* Terminal Header */}
            <div className={`flex items-center gap-2 px-5 py-4 border-b ${dark ? 'bg-white/[0.04] border-white/10' : 'bg-black/[0.03] border-black/5'}`}>
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/90 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                <div className="w-3 h-3 rounded-full bg-yellow-400/90 shadow-[0_0_8px_rgba(250,204,21,0.5)]" />
                <div className="w-3 h-3 rounded-full bg-green-500/90 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
              </div>
              <span className={`ml-4 text-xs font-mono tracking-widest font-medium ${dark ? 'text-white/40' : 'text-black/40'}`}>FIRAudit · Deep_Legal_Engine</span>
            </div>
            {/* Terminal Body */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
              <TypingTerminal dark={dark} />
            </div>
          </div>

          {/* Floating Accents */}
          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-cyan-500/20 rounded-full blur-2xl animate-pulse" />
          <div className="absolute -left-6 -top-6 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl animate-pulse delay-700" />
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className={`relative z-10 py-32 border-t mt-12 ${T.border(dark)}`}>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-500/5 to-transparent opacity-50" />
        <div className="max-w-7xl mx-auto px-6 lg:px-16 relative">
          <div className="text-center max-w-2xl mx-auto mb-20">
            <h2 className="text-xs font-black text-blue-500 uppercase tracking-widest mb-4">Pipeline</h2>
            <h3 className="text-4xl md:text-5xl font-black tracking-tight">From handwritten petition to court-ready FIR.</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-6">
            {STEPS.map((step) => (
              <div key={step.num} className={`group p-6 rounded-3xl transition-all duration-300 border ${T.glass(dark)} hover:-translate-y-2`}>
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center mb-6 text-white shadow-lg ${step.shadow} group-hover:scale-110 transition-transform duration-300`}>
                  {step.icon}
                </div>
                <div className={`text-xs font-black uppercase tracking-wider mb-2 ${T.muted(dark)}`}>Step {step.num}</div>
                <h4 className="text-base font-bold mb-3">{step.title}</h4>
                <p className={`text-sm font-medium leading-relaxed ${T.muted(dark)}`}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className={`relative z-10 py-32 border-t ${T.border(dark)}`}>
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="text-center max-w-2xl mx-auto mb-20">
            <h2 className="text-xs font-black text-blue-500 uppercase tracking-widest mb-4">Capabilities</h2>
            <h3 className="text-4xl md:text-5xl font-black tracking-tight">Built specifically for Indian Law Enforcement.</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className={`p-8 border rounded-[2rem] transition-all duration-300 ${T.glass(dark)} hover:-translate-y-1`}>
                <span className={`text-4xl mb-6 flex items-center justify-center w-16 h-16 rounded-2xl border shadow-inner ${dark ? 'bg-white/[0.04] border-white/5' : 'bg-black/[0.03] border-black/5'}`}>{f.icon}</span>
                <h4 className="text-lg font-bold mb-3 tracking-tight">{f.title}</h4>
                <p className={`text-sm font-medium leading-relaxed ${T.muted(dark)}`}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="relative z-10 py-32 overflow-hidden">
        <div className="absolute inset-0 bg-blue-600/10" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[300px] bg-blue-500/20 blur-[150px] pointer-events-none rounded-full" />
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <h2 className="text-5xl md:text-6xl font-black tracking-tight mb-8">Ready to secure your FIRs?</h2>
          <p className={`text-xl font-medium mb-12 max-w-2xl mx-auto ${T.muted(dark)}`}>
            Join thousands of officers ensuring absolute procedural compliance before court submission.
          </p>
          <button onClick={() => navigate('/register')} className="relative group overflow-hidden rounded-2xl bg-blue-600 text-white font-bold px-10 py-5 text-lg shadow-[0_0_30px_rgba(37,99,235,0.4)] hover:shadow-[0_0_50px_rgba(37,99,235,0.6)] transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-500 group-hover:scale-105 transition-transform duration-500" />
            <div className="relative flex items-center justify-center gap-2">
              Create Officer Account
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>
          </button>
        </div>
      </section>

      <footer className={`border-t py-12 text-center ${dark ? 'border-white/5' : 'border-black/5'} ${T.bg(dark)}`}>
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          </div>
          <span className="text-sm font-bold tracking-tight">FIRAudit.ai</span>
        </div>
        <p className={`text-xs font-medium uppercase tracking-widest ${T.muted(dark)}`}>
          © 2025 · Built with Neural Intelligence for Indian Law Enforcement
        </p>
      </footer>
    </div>
  );
}
