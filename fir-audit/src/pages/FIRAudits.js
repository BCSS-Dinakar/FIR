import { useOutletContext } from 'react-router-dom';
import { useState, useRef } from 'react';
import FIRButton from '../components/reusable/FIRButton';
import FIRCard from '../components/reusable/FIRCard';

const SAMPLE_FILES = [
  {
    name:  'sample_fir_complaint.txt',
    label: 'Cheating & Forgery Case',
    desc:  'BNS 318 · BNS 120B · BNS 336',
    icon:  '📄',
    url:   '/samples/sample_fir_complaint.txt',
  },
];

const PROCESSING_STEPS = [
  { id: 1, label: 'Reading document via Gemini Vision OCR',       icon: '👁️' },
  { id: 2, label: 'Extracting complainant & accused details',      icon: '📋' },
  { id: 3, label: 'Mapping facts to BNS / IPC sections',          icon: '⚖️' },
  { id: 4, label: 'Running BNSS procedural compliance check',     icon: '🔍' },
  { id: 5, label: 'Scoring compliance & generating blocker list', icon: '📊' },
];

const MOCK_RESULT = {
  firNo:       'FIR/HYD/226/107',
  complainant: 'Ravi Kumar Sharma',
  accused:     'Unknown (2 persons)',
  sections:    ['BNS 318 (Cheating)', 'BNS 120B (Criminal Conspiracy)'],
  score:       87,
  blockers: [
    'Forensic Lab ID not attached to evidence log',
    'Date of occurrence not in DD/MM/YYYY format',
  ],
  status: 'Needs Review',
};

export default function FIRAudits() {
  const { dark } = useOutletContext();
  const fileInputRef = useRef(null);

  const [dragActive, setDragActive]     = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [stage, setStage]               = useState('idle'); // idle | processing | done
  const [doneStep, setDoneStep]         = useState(0);

  const T = {
    card:    (d) => d ? 'bg-brand-navy-900 border-white/[0.06]' : 'bg-white border-black/[0.08] shadow-sm',
    muted:   (d) => d ? 'text-white/50' : 'text-black/50',
    border:  (d) => d ? 'border-white/[0.06]' : 'border-black/[0.08]',
    input:   (d) => d ? 'bg-white/[0.03] border-white/10 text-white' : 'bg-black/[0.02] border-black/10 text-brand-charcoal',
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

  const formatBytes = (b) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(1)} MB`;

  /* ── Simulate audit pipeline ──────────────── */
  const runAudit = () => {
    if (!selectedFile) return;
    setStage('processing');
    setDoneStep(0);
    PROCESSING_STEPS.forEach((_, i) => {
      setTimeout(() => {
        setDoneStep(i + 1);
        if (i === PROCESSING_STEPS.length - 1) {
          setTimeout(() => setStage('done'), 500);
        }
      }, (i + 1) * 900);
    });
  };

  const reset = () => {
    setSelectedFile(null); setStage('idle'); setDoneStep(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadReport = () => {
    if (!selectedFile) return;

    // Create a hidden iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Audit Report - ${MOCK_RESULT.firNo}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            padding: 40px;
            color: #0f172a;
            background: #ffffff;
            line-height: 1.5;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 20px;
            margin-bottom: 24px;
          }
          .title {
            font-size: 24px;
            font-weight: 800;
            color: #1e3a8a;
            margin: 0;
          }
          .subtitle {
            font-size: 11px;
            color: #64748b;
            margin-top: 4px;
            font-family: monospace;
          }
          .score-container {
            text-align: right;
          }
          .score {
            font-size: 32px;
            font-weight: 900;
            color: #d97706;
          }
          .score.good {
            color: #059669;
          }
          .score.bad {
            color: #dc2626;
          }
          .score-label {
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            color: #64748b;
            letter-spacing: 0.05em;
          }
          .section-title {
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #475569;
            margin-top: 32px;
            margin-bottom: 12px;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 6px;
          }
          .grid {
            display: grid;
            grid-template-cols: 1fr 1fr;
            gap: 20px;
          }
          .field {
            border-bottom: 1px solid #f1f5f9;
            padding: 8px 0;
            display: flex;
            justify-content: space-between;
            font-size: 13px;
          }
          .field-label {
            color: #64748b;
          }
          .field-value {
            font-weight: 700;
          }
          .badge-container {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 8px;
          }
          .badge {
            display: inline-block;
            padding: 4px 10px;
            font-size: 11px;
            font-weight: 700;
            background: #eff6ff;
            color: #1d4ed8;
            border: 1px solid #dbeafe;
            border-radius: 8px;
          }
          .blockers-list {
            margin-top: 8px;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .blocker {
            display: flex;
            gap: 12px;
            background: #fef2f2;
            border: 1px solid #fee2e2;
            border-radius: 8px;
            padding: 12px;
            color: #991b1b;
            font-size: 12px;
            font-weight: 600;
            align-items: flex-start;
          }
          .blocker-icon {
            font-size: 14px;
            margin-top: -1px;
          }
          .checklist {
            margin-top: 8px;
            font-size: 12px;
            color: #475569;
            padding-left: 20px;
          }
          .checklist li {
            margin-bottom: 6px;
          }
          .footer {
            text-align: center;
            margin-top: 60px;
            font-size: 10px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
            padding-top: 16px;
          }
        </style>
      </head>
      <body>
        <div>
          <div class="header">
            <div>
              <h1 class="title">POLICE COMPLAINT COMPLIANCE AUDIT</h1>
              <div class="subtitle">REF: ${MOCK_RESULT.firNo} &bull; DOC: ${selectedFile.name}</div>
            </div>
            <div class="score-container">
              <div class="score ${MOCK_RESULT.score >= 90 ? 'good' : MOCK_RESULT.score >= 70 ? '' : 'bad'}">${MOCK_RESULT.score}/100</div>
              <div class="score-label">${MOCK_RESULT.status}</div>
            </div>
          </div>

          <div class="section-title">Audit Metadata</div>
          <div class="grid">
            <div>
              <div class="field"><span class="field-label">FIR Reference Number</span><span class="field-value">${MOCK_RESULT.firNo}</span></div>
              <div class="field"><span class="field-label">Complainant Name</span><span class="field-value">${MOCK_RESULT.complainant}</span></div>
            </div>
            <div>
              <div class="field"><span class="field-label">Accused Details</span><span class="field-value">${MOCK_RESULT.accused}</span></div>
              <div class="field"><span class="field-label">Audit Timestamp</span><span class="field-value">${new Date().toLocaleString()}</span></div>
            </div>
          </div>

          <div class="section-title">Applied Legal Sections</div>
          <div class="badge-container">
            ${MOCK_RESULT.sections.map(s => `<span class="badge">${s}</span>`).join('')}
          </div>

          <div class="section-title">Procedural Blockers (${MOCK_RESULT.blockers.length})</div>
          <div class="blockers-list">
            ${MOCK_RESULT.blockers.length === 0 ? `
              <div style="color: #059669; font-weight: 700; font-size: 13px;">No procedural blockers found. FIR is court-ready under BNSS guidelines.</div>
            ` : MOCK_RESULT.blockers.map(b => `
              <div class="blocker">
                <span class="blocker-icon">⚠️</span>
                <span>${b}</span>
              </div>
            `).join('')}
          </div>

          <div class="section-title">Standard BNSS Procedural Verification</div>
          <ul class="checklist">
            <li>Verify Sec 173 BNSS — FIR registration parameters (Status: Verified)</li>
            <li>Complainant signature / thumb impression validation (Status: Completed)</li>
            <li>Date of occurrence format validation (Status: Checked)</li>
            <li>Forensic Lab ID linking for critical evidence attachments (Status: Flagged)</li>
          </ul>

          <div class="footer">
            Generated by AI Audit Command Center. Confidential document for internal police verification.
          </div>
        </div>
      </body>
      </html>
    `);
    doc.close();

    // Trigger printing once loaded
    iframe.contentWindow.focus();
    iframe.contentWindow.print();

    // Remove the iframe after a short delay
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
  };

  /* ── Score colour ─────────────────────────── */
  const scoreColor = (s) => {
    if (s >= 90) return { ring: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Compliant' };
    if (s >= 70) return { ring: 'text-amber-500',   bg: 'bg-amber-500/10',   label: 'Needs Review' };
    return              { ring: 'text-red-500',      bg: 'bg-red-500/10',     label: 'Non-Compliant' };
  };

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight mb-1">Scan New FIR Document</h1>
        <p className={`text-xs ${T.muted(dark)}`}>
          Upload a complaint document — AI will extract details, map BNS/IPC sections, and score procedural compliance.
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
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
              dragActive ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-500/10 text-blue-500'
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
                  <p className={`text-[10px] ${T.muted(dark)}`}>{formatBytes(selectedFile.size)} · ready to audit</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <FIRButton
                  onClick={runAudit}
                  variant="primary"
                >
                  Run Audit →
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
                      const res  = await fetch(s.url);
                      const blob = await res.blob();
                      const file = new File([blob], s.name, { type: blob.type || 'text/plain' });
                      setSelectedFile(file);
                      setStage('idle');
                      setDoneStep(0);
                    } catch (err) {
                      alert('Could not load sample file.');
                    }
                  }}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition-all group ${
                    dark
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
            <h3 className="font-black text-base">AI Audit in Progress</h3>
            <p className={`text-[11px] mt-1 ${T.muted(dark)}`}>{selectedFile?.name}</p>
          </div>

          <div className="space-y-3 max-w-md mx-auto">
            {PROCESSING_STEPS.map((step, i) => {
              const done    = doneStep > i;
              const current = doneStep === i;
              return (
                <div key={step.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  done    ? dark ? 'bg-emerald-500/10' : 'bg-emerald-50'    :
                  current ? dark ? 'bg-blue-500/10'   : 'bg-blue-50'       :
                            dark ? 'bg-white/[0.02]'  : 'bg-black/[0.015]'
                }`}>
                  <span className="text-base shrink-0">
                    {done ? '✅' : current ? (
                      <span className="inline-block w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                    ) : step.icon}
                  </span>
                  <span className={`text-xs font-semibold ${
                    done    ? 'text-emerald-500' :
                    current ? 'text-blue-500'   :
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
        const sc = scoreColor(MOCK_RESULT.score);
        return (
          <FIRCard dark={dark} noPadding className="overflow-hidden">
            {/* Result header bar */}
            <div className={`px-6 py-4 border-b flex items-center justify-between gap-4 ${T.border(dark)}`}>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-black text-sm">Audit Complete</h3>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${sc.bg} ${sc.ring}`}>
                    {sc.label}
                  </span>
                </div>
                <p className={`text-[10px] font-mono ${T.muted(dark)}`}>{MOCK_RESULT.firNo} · {selectedFile?.name}</p>
              </div>
              {/* Score ring */}
              <div className={`text-3xl font-black ${sc.ring}`}>
                {MOCK_RESULT.score}
                <span className={`text-sm font-bold ${T.muted(dark)}`}>/100</span>
              </div>
            </div>

            {/* Details grid */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">

              {/* Extracted fields */}
              <div className="space-y-3">
                <p className={`text-[9px] font-black uppercase tracking-widest ${T.muted(dark)}`}>Extracted Details</p>
                {[
                  { label: 'FIR Reference',  val: MOCK_RESULT.firNo },
                  { label: 'Complainant',    val: MOCK_RESULT.complainant },
                  { label: 'Accused',        val: MOCK_RESULT.accused },
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
                    {MOCK_RESULT.sections.map((s) => (
                      <span key={s} className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-500 font-bold text-[10px]">{s}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Blockers */}
              <div>
                <p className={`text-[9px] font-black uppercase tracking-widest mb-3 ${T.muted(dark)}`}>
                  Procedural Blockers ({MOCK_RESULT.blockers.length})
                </p>
                {MOCK_RESULT.blockers.length === 0 ? (
                  <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    No blockers — FIR is court-ready
                  </div>
                ) : (
                  <div className="space-y-2">
                    {MOCK_RESULT.blockers.map((b, i) => (
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
                  <FIRButton
                    onClick={downloadReport}
                    variant="primary"
                    className="flex-1"
                  >
                    Download PDF Report
                  </FIRButton>
                  <FIRButton
                    onClick={reset}
                    variant="secondary"
                    dark={dark}
                  >
                    New Audit
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
              ['Gemini Vision OCR',     'Online'],
              ['BNS / IPC Mapper',      'Active'],
              ['BNSS Compliance Check', 'Active'],
              ['ICJS Database Sync',    'Configured'],
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
