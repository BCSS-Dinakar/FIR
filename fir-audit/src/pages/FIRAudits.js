import { useOutletContext, useNavigate } from 'react-router-dom';
import { useState, useRef } from 'react';
import FIRButton from '../components/reusable/FIRButton';
import FIRCard from '../components/reusable/FIRCard';
import {
  runPipelineStep1,
  runPipelineStep2,
  runPipelineStep3,
  finalizePetitionPipeline
} from '../api/petition';

const SAMPLE_FILES = [
  {
    name: 'sample_fir_complaint.txt',
    label: 'Cheating & Forgery Case',
    desc: 'BNS 318 · BNS 120B · BNS 336',
    icon: '📄',
    url: '/samples/sample_fir_complaint.txt',
  },
  {
    name: 'valid_01_english_typed_cyberfraud.txt',
    label: 'Valid: Cyberfraud (English)',
    desc: 'Typed · Cybercrime',
    icon: '✅',
    url: '/samples/valid_01_english_typed_cyberfraud.txt',
  },
  {
    name: 'valid_02_telugu_typed_domestic_violence.txt',
    label: 'Valid: Domestic Violence (Telugu)',
    desc: 'Typed · Telugu',
    icon: '✅',
    url: '/samples/valid_02_telugu_typed_domestic_violence.txt',
  },
  {
    name: 'invalid_01_english_too_vague.txt',
    label: 'Invalid: Vague Complaint',
    desc: 'Too vague · Missing Details',
    icon: '❌',
    url: '/samples/invalid_01_english_too_vague.txt',
  },
  {
    name: 'invalid_02_telugu_handwritten_missing_details.txt',
    label: 'Invalid: Missing Details (Telugu)',
    desc: 'Telugu · Missing Location',
    icon: '❌',
    url: '/samples/invalid_02_telugu_handwritten_missing_details.txt',
  }
];

const PIPELINE_STEPS = [
  { id: 1, label: 'Scanning file content', reviewTitle: 'Review extracted text (OCR)', icon: '👁️' },
  { id: 2, label: 'Changing to english', reviewTitle: 'Review English translation', icon: '🔤' },
  { id: 3, label: 'Validating petition', reviewTitle: 'Review 5W+1H validation', icon: '⚖️' },
  { id: 4, label: 'Recommending legal sections', reviewTitle: 'Saving petition', icon: '📚' },
];

const emptyDraft = () => ({
  step1Output: '',
  step2Output: '',
  step3Output: null,
  metadata: null
});

export default function FIRAudits() {
  const { dark } = useOutletContext();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [stage, setStage] = useState('idle'); // idle | processing | review | done
  const [activeStep, setActiveStep] = useState(1);
  const [approvedSteps, setApprovedSteps] = useState(0);
  const [draft, setDraft] = useState(emptyDraft());
  const [reviewText, setReviewText] = useState('');
  const [lastScannedPetition, setLastScannedPetition] = useState(null);

  const T = {
    card: (d) => d ? 'bg-brand-navy-900 border-white/[0.06]' : 'bg-white border-black/[0.08] shadow-sm',
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
    border: (d) => d ? 'border-white/[0.06]' : 'border-black/[0.08]',
    input: (d) => d ? 'bg-white/[0.03] border-white/10 text-white' : 'bg-black/[0.02] border-black/[0.10] text-brand-charcoal',
    dropZone: (d, active) => {
      const base = 'border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all cursor-pointer';
      if (active) return `${base} border-blue-500 bg-blue-500/10`;
      return d
        ? `${base} border-white/10 hover:border-blue-500/50 hover:bg-white/[0.02]`
        : `${base} border-black/10 hover:border-blue-500/50 hover:bg-black/[0.01]`;
    },
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) resetForNewFile(file);
  };

  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) resetForNewFile(file);
  };

  const resetForNewFile = (file) => {
    setSelectedFile(file);
    setStage('idle');
    setActiveStep(1);
    setApprovedSteps(0);
    setDraft(emptyDraft());
    setReviewText('');
    setLastScannedPetition(null);
  };

  const formatBytes = (b) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  const isBusyRef = useRef(false);

  const fail = (err) => {
    console.error(err);
    alert('Scanning failed: ' + (err.message || 'Unknown error occurred'));
    setStage('idle');
    setActiveStep(1);
    setApprovedSteps(0);
  };

  const beginStep1 = async () => {
    if (!selectedFile || isBusyRef.current) return;
    isBusyRef.current = true;
    setStage('processing');
    setActiveStep(1);
    setApprovedSteps(0);

    try {
      const result = await runPipelineStep1(selectedFile);
      setDraft((d) => ({ ...d, step1Output: result.step1Output }));
      setReviewText(result.step1Output);
      setStage('review');
    } catch (err) {
      fail(err);
    } finally {
      isBusyRef.current = false;
    }
  };

  const approveAndContinue = async () => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    setStage('processing');

    try {
      if (activeStep === 1) {
        const step1Output = reviewText.trim();
        if (!step1Output) throw new Error('Extracted text is empty.');
        setDraft((d) => ({ ...d, step1Output }));
        setActiveStep(2);
        const result = await runPipelineStep2(step1Output);
        setDraft((d) => ({ ...d, step2Output: result.step2Output }));
        setReviewText(result.step2Output);
        setApprovedSteps(1);
        setStage('review');
      } else if (activeStep === 2) {
        const step2Output = reviewText.trim();
        if (!step2Output) throw new Error('Translation is empty.');
        setDraft((d) => ({ ...d, step2Output }));
        setActiveStep(3);
        const result = await runPipelineStep3(step2Output);
        setDraft((d) => ({ ...d, step3Output: result.step3Output, metadata: result.metadata }));
        setReviewText('');
        setApprovedSteps(2);
        setStage('review');
      } else if (activeStep === 3) {
        setActiveStep(4);
        setApprovedSteps(3);
        const result = await finalizePetitionPipeline({
          step1Output: draft.step1Output,
          step2Output: draft.step2Output,
          step3Output: draft.step3Output,
          metadata: draft.metadata,
          sourceFile: selectedFile?.name
        });
        setLastScannedPetition(result.result);
        setApprovedSteps(4);
        setStage('done');
      }
    } catch (err) {
      fail(err);
    } finally {
      isBusyRef.current = false;
    }
  };

  const rerunCurrentStep = async () => {
    if (isBusyRef.current) return;
    if (activeStep === 1) {
      await beginStep1();
      return;
    }
    if (activeStep === 2) {
      isBusyRef.current = true;
      setStage('processing');
      try {
        const result = await runPipelineStep2(draft.step1Output);
        setDraft((d) => ({ ...d, step2Output: result.step2Output }));
        setReviewText(result.step2Output);
        setStage('review');
      } catch (err) {
        fail(err);
      } finally {
        isBusyRef.current = false;
      }
      return;
    }
    if (activeStep === 3) {
      isBusyRef.current = true;
      setStage('processing');
      try {
        const result = await runPipelineStep3(draft.step2Output);
        setDraft((d) => ({ ...d, step3Output: result.step3Output, metadata: result.metadata }));
        setStage('review');
      } catch (err) {
        fail(err);
      } finally {
        isBusyRef.current = false;
      }
    }
  };

  const reset = () => {
    setSelectedFile(null);
    setStage('idle');
    setActiveStep(1);
    setApprovedSteps(0);
    setDraft(emptyDraft());
    setReviewText('');
    setLastScannedPetition(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const scoreColor = (s) => {
    if (s >= 90) return { ring: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Accurate' };
    if (s >= 70) return { ring: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Needs Review' };
    return { ring: 'text-red-500', bg: 'bg-red-500/10', label: 'Has Mistakes' };
  };

  const currentStepMeta = PIPELINE_STEPS.find((s) => s.id === activeStep) || PIPELINE_STEPS[0];
  const step3 = draft.step3Output;

  const renderStep3Review = () => {
    if (!step3) return null;
    const fields = step3.fields || draft.metadata?.fiveW1H || {};
    return (
      <div className="space-y-4">
        <div className={`flex items-center gap-2 text-xs font-bold ${step3.valid ? 'text-emerald-500' : 'text-amber-500'}`}>
          {step3.valid ? '✅ All 5W+1H elements present' : `⚠ Missing: ${(step3.missing_fields || []).join(', ')}`}
        </div>
        <p className={`text-[11px] ${T.muted(dark)}`}>{step3.reason}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            ['Who', fields.who || fields.complainantName],
            ['What', fields.what],
            ['When', fields.when],
            ['Where', fields.where],
            ['Why', fields.why],
            ['How', fields.how],
          ].map(([label, val]) => (
            <div key={label} className={`p-3 rounded-xl border text-xs ${T.border(dark)} ${dark ? 'bg-white/[0.02]' : 'bg-black/[0.015]'}`}>
              <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${T.muted(dark)}`}>{label}</p>
              <p className="font-semibold whitespace-pre-wrap">{val || '—'}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-2xl font-black tracking-tight mb-1">Check New Petition</h1>
        <p className={`text-xs ${T.muted(dark)}`}>
          Upload a petition — each AI step (OCR → translation → 5W+1H) pauses for your review before continuing.
        </p>
      </div>

      {stage === 'idle' && (
        <FIRCard dark={dark} className="space-y-5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt"
            className="hidden"
            onChange={handleFileChange}
          />

          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={T.dropZone(dark, dragActive)}
          >
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors ${dragActive ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-500/10 text-blue-500'}`}>
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h3 className="font-bold text-sm mb-1">
              {dragActive ? 'Drop to upload' : 'Drag & drop complaint document'}
            </h3>
            <p className={`text-[11px] text-center max-w-xs mb-5 ${T.muted(dark)}`}>
              PDF, PNG, JPG, DOCX — Telugu, Hindi, Tamil, English &amp; mixed-language scans supported
            </p>
            <FIRButton onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} variant="solid">
              Choose File
            </FIRButton>
          </div>

          {selectedFile && (
            <div className={`flex items-center justify-between gap-4 px-4 py-3 rounded-xl border ${T.border(dark)} ${dark ? 'bg-white/[0.02]' : 'bg-black/[0.015]'}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 text-base">📄</div>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{selectedFile.name}</p>
                  <p className={`text-[10px] ${T.muted(dark)}`}>{formatBytes(selectedFile.size)} · ready to check</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <FIRButton onClick={beginStep1} variant="primary">Start Step 1 (Scan) →</FIRButton>
                <button onClick={reset} className={`p-1.5 rounded-lg border transition-all ${T.border(dark)} ${T.muted(dark)}`} title="Remove file">✕</button>
              </div>
            </div>
          )}

          <div className={`pt-4 border-t ${T.border(dark)}`}>
            <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${T.muted(dark)}`}>📂 Quick-load sample file</p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_FILES.map((s) => (
                <button
                  key={s.name}
                  onClick={async () => {
                    try {
                      const res = await fetch(s.url);
                      const blob = await res.blob();
                      const file = new File([blob], s.name, { type: blob.type || 'text/plain' });
                      resetForNewFile(file);
                    } catch {
                      alert('Could not load sample file.');
                    }
                  }}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition-all group ${dark ? 'bg-white/[0.02] border-white/10 hover:border-blue-500/50' : 'bg-black/[0.01] border-black/10 hover:border-blue-500/50'}`}
                >
                  <span className="text-xl">{s.icon}</span>
                  <div>
                    <div className="text-[11px] font-bold group-hover:text-blue-500">{s.label}</div>
                    <div className={`text-[9px] font-mono mt-0.5 ${T.muted(dark)}`}>{s.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </FIRCard>
      )}

      {(stage === 'processing' || stage === 'review') && (
        <FIRCard dark={dark} className="space-y-6">
          <div className="text-center">
            <div className="text-2xl mb-2">{stage === 'processing' ? '🤖' : '👮'}</div>
            <h3 className="font-black text-base">
              {stage === 'processing' ? `Running Step ${activeStep}…` : currentStepMeta.reviewTitle}
            </h3>
            <p className={`text-[11px] mt-1 ${T.muted(dark)}`}>{selectedFile?.name}</p>
          </div>

          <div className="max-w-md mx-auto">
            <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
              <span className={T.muted(dark)}>Pipeline progress</span>
              <span className="text-blue-500 font-black">{Math.round((approvedSteps / PIPELINE_STEPS.length) * 100)}%</span>
            </div>
            <div className={`w-full h-2 rounded-full overflow-hidden ${dark ? 'bg-white/10' : 'bg-black/10'}`}>
              <div className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full transition-all duration-500" style={{ width: `${(approvedSteps / PIPELINE_STEPS.length) * 100}%` }} />
            </div>
          </div>

          <div className="space-y-3 max-w-md mx-auto">
            {PIPELINE_STEPS.slice(0, 3).map((step, i) => {
              const done = approvedSteps > i;
              const current = activeStep === step.id && stage === 'processing';
              const awaiting = activeStep === step.id && stage === 'review';
              return (
                <div key={step.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl ${done ? (dark ? 'bg-emerald-500/10' : 'bg-emerald-50') : current ? (dark ? 'bg-blue-500/10' : 'bg-blue-50') : awaiting ? (dark ? 'bg-amber-500/10' : 'bg-amber-50') : (dark ? 'bg-white/[0.02]' : 'bg-black/[0.015]')}`}>
                  <span className="text-base shrink-0">
                    {done ? '✅' : current ? <span className="inline-block w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" /> : awaiting ? '⏸️' : step.icon}
                  </span>
                  <span className={`text-xs font-semibold ${done ? 'text-emerald-500' : current ? 'text-blue-500' : awaiting ? 'text-amber-500' : T.muted(dark)}`}>
                    {step.label}{awaiting ? ' — awaiting your approval' : ''}
                  </span>
                </div>
              );
            })}
          </div>

          {stage === 'review' && activeStep <= 2 && (
            <div className="space-y-3">
              <p className={`text-[10px] font-black uppercase tracking-widest ${T.muted(dark)}`}>
                Edit if needed, then approve to continue
              </p>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                rows={14}
                className={`w-full rounded-xl border p-4 text-xs font-mono leading-relaxed resize-y ${T.input(dark)}`}
              />
            </div>
          )}

          {stage === 'review' && activeStep === 3 && renderStep3Review()}

          {stage === 'review' && (
            <div className="flex flex-wrap gap-2 justify-center pt-2">
              <FIRButton onClick={approveAndContinue} variant="primary">
                {activeStep === 3 ? 'Approve & Save Petition →' : `Approve & Run Step ${activeStep + 1} →`}
              </FIRButton>
              {activeStep <= 3 && (
                <FIRButton onClick={rerunCurrentStep} variant="secondary" dark={dark}>Re-run this step</FIRButton>
              )}
              <FIRButton onClick={reset} variant="secondary" dark={dark}>Cancel</FIRButton>
            </div>
          )}
        </FIRCard>
      )}

      {stage === 'done' && (() => {
        const petition = lastScannedPetition || { petitionNo: '—', complainant: '—', accused: '—', sections: [], score: 0, blockers: [] };
        const sc = scoreColor(petition.score);
        return (
          <FIRCard dark={dark} noPadding className="overflow-hidden">
            <div className={`px-6 py-4 border-b flex items-center justify-between gap-4 ${T.border(dark)}`}>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-black text-sm">Petition Scanned &amp; Checked</h3>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${sc.bg} ${sc.ring}`}>{sc.label}</span>
                </div>
                <p className={`text-[10px] font-mono ${T.muted(dark)}`}>{petition.petitionNo} · {selectedFile?.name}</p>
              </div>
              <div className={`text-3xl font-black ${sc.ring}`}>{petition.score}<span className={`text-sm font-bold ${T.muted(dark)}`}>/100</span></div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
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
                <div className="pt-1 text-xs">
                  <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${T.muted(dark)}`}>Applied Legal Sections</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(petition.sections || []).map((s) => (
                      <span key={s} className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-500 font-bold text-[10px]">{s}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <p className={`text-[9px] font-black uppercase tracking-widest mb-3 ${T.muted(dark)}`}>
                  Mistakes / Warnings ({(petition.blockers || []).length})
                </p>
                {(petition.blockers || []).length === 0 ? (
                  <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold">✅ No mistakes — Petition is ready to file FIR</div>
                ) : (
                  <div className="space-y-2">
                    {petition.blockers.map((b, i) => (
                      <div key={i} className={`flex items-start gap-2.5 p-3 rounded-xl ${dark ? 'bg-red-500/8' : 'bg-red-50'}`}>
                        <span className="text-[11px] font-semibold text-red-500">{b}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-5">
                  {(petition.blockers || []).length > 0 ? (
                    <FIRButton onClick={() => navigate('/dashboard/blockers')} variant="solid" className="flex-1">👉 Go to Mistakes / Warnings</FIRButton>
                  ) : (
                    <FIRButton onClick={() => navigate('/dashboard/file-fir')} variant="solid" className="flex-1">👉 Proceed to File FIR</FIRButton>
                  )}
                  <FIRButton onClick={reset} variant="secondary" dark={dark}>Scan Another Petition</FIRButton>
                </div>
              </div>
            </div>
          </FIRCard>
        );
      })()}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FIRCard dark={dark} noPadding className="p-5">
          <h3 className="font-bold text-xs mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />BNSS Procedural Checklist
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
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />AI Engine Status
          </h3>
          <ul className={`text-[11px] space-y-2 leading-relaxed ${T.muted(dark)}`}>
            {[['PaddleOCR-VL (OCR)', 'Online'], ['vLLM Qwen (Translation)', 'Online'], ['5W+1H Extractor', 'Active'], ['BNS RAG Mapper', 'Active']].map(([name, status]) => (
              <li key={name} className="flex justify-between gap-4">
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
