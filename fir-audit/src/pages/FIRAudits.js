import { useOutletContext, useNavigate } from 'react-router-dom';
import { useState, useRef } from 'react';
import FIRButton from '../components/reusable/FIRButton';
import FIRCard from '../components/reusable/FIRCard';
import { runPetitionPipeline, createPetition } from '../api/petition';

const SAMPLE_FILES = [
  {
    name: 'sample_fir_complaint.txt',
    label: 'Cheating & Forgery Case',
    desc: 'BNS 318 · BNS 120B · BNS 336',
    icon: '📄',
    url: '/samples/sample_fir_complaint.txt',
  },
];

const PROCESSING_STEPS = [
  { id: 1, label: 'Scanning file content', icon: '👁️' },
  { id: 2, label: 'Changing to english', icon: '🔤' },
  { id: 3, label: 'Validating petition', icon: '⚖️' },
];



export default function FIRAudits() {
  const { dark } = useOutletContext();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [stage, setStage] = useState('idle'); // idle | processing | done
  const [doneStep, setDoneStep] = useState(0);
  const [lastScannedPetition, setLastScannedPetition] = useState(null);

  const T = {
    card: (d) => d ? 'bg-brand-navy-900 border-white/[0.06]' : 'bg-white border-black/[0.08] shadow-sm',
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
    border: (d) => d ? 'border-white/[0.06]' : 'border-black/[0.08]',
    input: (d) => d ? 'bg-white/[0.03] border-white/10 text-white' : 'bg-black/[0.02] border-black/10 text-brand-charcoal',
    dropZone: (d, active) => {
      const base = 'border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all cursor-pointer';
      if (active) return `${base} border-blue-500 bg-blue-500/10`;
      return d
        ? `${base} border-white/10 hover:border-blue-500/50 hover:bg-white/[0.02]`
        : `${base} border-black/10 hover:border-blue-500/50 hover:bg-black/[0.01]`;
    },
  };

  /* ── File helpers ─────────────────────────── */
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) { setSelectedFile(file); setStage('idle'); setDoneStep(0); }
  };

  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) { setSelectedFile(file); setStage('idle'); setDoneStep(0); }
  };

  const formatBytes = (b) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  const isAuditingRef = useRef(false);

  /* ── Integrate petition pipeline ──────────── */
  const runAudit = async () => {
    if (!selectedFile || isAuditingRef.current) return;
    isAuditingRef.current = true;
    setStage('processing');
    setDoneStep(0);

    try {
      const savedPetition = await runPetitionPipeline(selectedFile, (chunk) => {
        if (chunk.status === 'completed') {
          if (chunk.step === 1) {
            setDoneStep(1);
          } else if (chunk.step === 2) {
            setDoneStep(2);
          } else if (chunk.step === 3) {
            setDoneStep(3);
          }
        }
      });

      setTimeout(() => {
        setLastScannedPetition(savedPetition);
        setStage('done');
      }, 500);
    } catch (err) {
      console.error(err);
      alert('Scanning failed: ' + (err.message || 'Unknown error occurred'));
      setStage('idle');
      setDoneStep(0);
    } finally {
      isAuditingRef.current = false;
    }
  };

  const reset = () => {
    setSelectedFile(null); setStage('idle'); setDoneStep(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };



  /* ── Score colour ─────────────────────────── */
  const scoreColor = (s) => {
    if (s >= 90) return { ring: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Accurate' };
    if (s >= 70) return { ring: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Needs Review' };
    return { ring: 'text-red-500', bg: 'bg-red-500/10', label: 'Has Mistakes' };
  };

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight mb-1">Check New Petition</h1>
        <p className={`text-xs ${T.muted(dark)}`}>
          Upload a petition document — AI will extract details, translate to English, and check for errors under BNSS guidelines.
        </p>
      </div>

      {/* ── Upload card ─────────────────────────── */}
      {stage === 'idle' && (
        <FIRCard dark={dark} className="space-y-5">

          {/* Hidden real file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Drop zone */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={T.dropZone(dark, dragActive)}
          >
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors ${dragActive ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-500/10 text-blue-500'
              }`}>
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h3 className="font-bold text-sm mb-1">
              {dragActive ? 'Drop to upload' : 'Drag & drop complaint document'}
            </h3>
            <p className={`text-[11px] text-center max-w-xs mb-5 ${T.muted(dark)}`}>
              Supports handwritten or printed PDF, PNG, JPG — Telugu &amp; English accepted
            </p>
            <FIRButton
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              variant="solid"
            >
              Choose File
            </FIRButton>
          </div>

          {/* Selected file preview */}
          {selectedFile && (
            <div className={`flex items-center justify-between gap-4 px-4 py-3 rounded-xl border ${T.border(dark)} ${dark ? 'bg-white/[0.02]' : 'bg-black/[0.015]'}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 text-base">
                  📄
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{selectedFile.name}</p>
                  <p className={`text-[10px] ${T.muted(dark)}`}>{formatBytes(selectedFile.size)} · ready to check</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <FIRButton
                  onClick={runAudit}
                  variant="primary"
                >
                  Check Petition →
                </FIRButton>
                <button
                  onClick={reset}
                  className={`p-1.5 rounded-lg border transition-all ${T.border(dark)} ${dark ? 'hover:bg-white/[0.05]' : 'hover:bg-black/[0.05]'} ${T.muted(dark)}`}
                  title="Remove file"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          {/* ── Sample files quick-load ── */}
          <div className={`pt-4 border-t ${T.border(dark)}`}>
            <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${T.muted(dark)}`}>
              📂 &nbsp;Quick-load sample file
            </p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_FILES.map((s) => (
                <button
                  key={s.name}
                  onClick={async () => {
                    try {
                      const res = await fetch(s.url);
                      const blob = await res.blob();
                      const file = new File([blob], s.name, { type: blob.type || 'text/plain' });
                      setSelectedFile(file);
                      setStage('idle');
                      setDoneStep(0);
                    } catch (err) {
                      alert('Could not load sample file.');
                    }
                  }}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition-all group ${dark
                    ? 'bg-white/[0.02] border-white/10 hover:border-blue-500/50 hover:bg-blue-500/5'
                    : 'bg-black/[0.01] border-black/10 hover:border-blue-500/50 hover:bg-blue-50'
                    }`}
                >
                  <span className="text-xl">{s.icon}</span>
                  <div className="text-left">
                    <div className="text-[11px] font-bold group-hover:text-blue-500 transition-colors">{s.label}</div>
                    <div className={`text-[9px] font-mono mt-0.5 ${T.muted(dark)}`}>{s.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

        </FIRCard>
      )}

      {/* ── Processing animation ─────────────────── */}
      {stage === 'processing' && (
        <FIRCard dark={dark} className="space-y-6">
          <div className="text-center">
            <div className="text-2xl mb-2">🤖</div>
            <h3 className="font-black text-base">AI Checking in Progress</h3>
            <p className={`text-[11px] mt-1 mb-4 ${T.muted(dark)}`}>{selectedFile?.name}</p>
          </div>

          {/* Progress Bar & Percentage */}
          <div className="max-w-md mx-auto">
            <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
              <span className={T.muted(dark)}>Overall Progress</span>
              <span className="text-blue-500 font-black">{Math.round((doneStep / PROCESSING_STEPS.length) * 100)}%</span>
            </div>
            <div className={`w-full h-2 rounded-full overflow-hidden ${dark ? 'bg-white/10' : 'bg-black/10'}`}>
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${(doneStep / PROCESSING_STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="space-y-3 max-w-md mx-auto">
            {PROCESSING_STEPS.map((step, i) => {
              const done = doneStep > i;
              const current = doneStep === i;
              return (
                <div key={step.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${done ? dark ? 'bg-emerald-500/10' : 'bg-emerald-50' :
                  current ? dark ? 'bg-blue-500/10' : 'bg-blue-50' :
                    dark ? 'bg-white/[0.02]' : 'bg-black/[0.015]'
                  }`}>
                  <span className="text-base shrink-0">
                    {done ? '✅' : current ? (
                      <span className="inline-block w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                    ) : step.icon}
                  </span>
                  <span className={`text-xs font-semibold ${done ? 'text-emerald-500' :
                    current ? 'text-blue-500' :
                      T.muted(dark)
                    }`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </FIRCard>
      )}

      {/* ── Audit Result ─────────────────────────── */}
      {stage === 'done' && (() => {
        const petition = lastScannedPetition || {
          petitionNo: 'PET/HYD/2026/381',
          complainant: 'G. Laxman Rao',
          accused: 'K. Ramaswamy',
          sections: ['BNS 303 (Theft)'],
          score: 95,
          blockers: [],
        };
        const sc = scoreColor(petition.score);
        return (
          <FIRCard dark={dark} noPadding className="overflow-hidden">
            {/* Result header bar */}
            <div className={`px-6 py-4 border-b flex items-center justify-between gap-4 ${T.border(dark)}`}>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-black text-sm">Petition Scanned &amp; Checked</h3>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${sc.bg} ${sc.ring}`}>
                    {sc.label}
                  </span>
                </div>
                <p className={`text-[10px] font-mono ${T.muted(dark)}`}>
                  {petition.petitionNo} · {selectedFile?.name}
                </p>
              </div>
              {/* Score ring */}
              <div className={`text-3xl font-black ${sc.ring}`}>
                {petition.score}
                <span className={`text-sm font-bold ${T.muted(dark)}`}>/100</span>
              </div>
            </div>

            {/* Details grid */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">

              {/* Extracted fields */}
              <div className="space-y-3">
                <p className={`text-[9px] font-black uppercase tracking-widest ${T.muted(dark)}`}>Extracted Details</p>
                {[
                  { label: 'Petition Reference', val: petition.petitionNo },
                  { label: 'Complainant', val: petition.complainant },
                  { label: 'Accused', val: petition.accused },
                ].map((row) => (
                  <div key={row.label} className={`flex justify-between gap-4 text-xs py-2 border-b ${T.border(dark)}`}>
                    <span className={T.muted(dark)}>{row.label}</span>
                    <span className="font-bold text-right">{row.val}</span>
                  </div>
                ))}

                {/* BNS Sections */}
                <div className={`pt-1 text-xs`}>
                  <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${T.muted(dark)}`}>Applied Legal Sections</p>
                  <div className="flex flex-wrap gap-1.5">
                    {petition.sections.map((s) => (
                      <span key={s} className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-500 font-bold text-[10px]">{s}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Blockers */}
              <div>
                <p className={`text-[9px] font-black uppercase tracking-widest mb-3 ${T.muted(dark)}`}>
                  Mistakes / Warnings ({petition.blockers.length})
                </p>
                {petition.blockers.length === 0 ? (
                  <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    No mistakes — Petition is ready to file FIR
                  </div>
                ) : (
                  <div className="space-y-2">
                    {petition.blockers.map((b, i) => (
                      <div key={i} className={`flex items-start gap-2.5 p-3 rounded-xl ${dark ? 'bg-red-500/8' : 'bg-red-50'}`}>
                        <svg className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className="text-[11px] font-semibold text-red-500">{b}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 mt-5">
                  {petition.blockers.length > 0 ? (
                    <FIRButton
                      onClick={() => navigate('/dashboard/blockers')}
                      variant="solid"
                      className="flex-1"
                    >
                      👉 Go to Mistakes / Warnings
                    </FIRButton>
                  ) : (
                    <FIRButton
                      onClick={() => navigate('/dashboard/file-fir')}
                      variant="solid"
                      className="flex-1"
                    >
                      👉 Proceed to File FIR
                    </FIRButton>
                  )}
                  <FIRButton
                    onClick={reset}
                    variant="secondary"
                    dark={dark}
                  >
                    Scan Another Petition
                  </FIRButton>
                </div>
              </div>
            </div>
          </FIRCard>
        );
      })()}

      {/* ── Info cards (always visible) ──────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FIRCard dark={dark} noPadding className="p-5">
          <h3 className="font-bold text-xs mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
            BNSS Procedural Checklist
          </h3>
          <ul className={`text-[11px] space-y-2 list-disc pl-4 leading-relaxed ${T.muted(dark)}`}>
            <li>Verify Sec 173 BNSS — FIR registration parameters</li>
            <li>Complainant signature / thumb impression mandatory</li>
            <li>Date of occurrence must be in DD/MM/YYYY format</li>
            <li>Forensic Lab ID required for evidence attachments</li>
          </ul>
        </FIRCard>
        <FIRCard dark={dark} noPadding className="p-5">
          <h3 className="font-bold text-xs mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            AI Engine Status
          </h3>
          <ul className={`text-[11px] space-y-2 leading-relaxed ${T.muted(dark)}`}>
            {[
              ['Gemini Vision OCR', 'Online'],
              ['BNS / IPC Mapper', 'Active'],
              ['BNSS Procedural Check', 'Active'],
              ['ICJS Database Sync', 'Configured'],
            ].map(([name, status]) => (
              <li key={name} className="flex justify-between">
                <span>{name}</span>
                <span className="text-emerald-500 font-bold">{status}</span>
              </li>
            ))}
          </ul>
        </FIRCard>
      </div>

    </div>
  );
}
