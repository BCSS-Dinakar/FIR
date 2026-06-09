import { useState } from 'react';
import FIRCard from '../reusable/FIRCard';

export default function AIEngineConfig({ dark }) {
  const T = {
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
    border: (d) => d ? 'border-white/[0.06]' : 'border-black/[0.08]',
    input: (d) => d ? 'bg-white/[0.03] border-white/10 text-white' : 'bg-black/[0.02] border-black/10 text-brand-charcoal',
  };

  const [toggles, setToggles] = useState({
    ocr: true,
    regional: true,
    strictness: 'High',
    autoFlag: true,
  });

  const toggle = (key) => setToggles(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <FIRCard dark={dark} className="space-y-6">
      <div>
        <h3 className="font-bold text-sm">AI Auditor Configuration</h3>
        <p className={`text-[11px] mt-0.5 ${T.muted(dark)}`}>Tune the Gemini Vision engine and procedural strictness</p>
      </div>

      <div className="space-y-5">
        
        {/* Strictness Dropdown */}
        <div>
          <label className={`block text-[10px] font-bold uppercase tracking-wider mb-2 ${T.muted(dark)}`}>BNSS Strictness Threshold</label>
          <select 
            value={toggles.strictness}
            onChange={(e) => setToggles(prev => ({...prev, strictness: e.target.value}))}
            className={`w-full max-w-xs px-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 ${T.input(dark)}`}
          >
            <option value="High">High (Flags all minor BNSS deviations)</option>
            <option value="Medium">Medium (Flags only critical blockers)</option>
            <option value="Low">Low (Permissive mode)</option>
          </select>
        </div>

        <div className={`pt-4 border-t ${T.border(dark)} space-y-4`}>
          
          {/* Toggle item */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold">Gemini Vision OCR</div>
              <div className={`text-[10px] mt-0.5 ${T.muted(dark)}`}>Extract text from handwritten FIR images</div>
            </div>
            <button 
              onClick={() => toggle('ocr')}
              className={`w-10 h-5 rounded-full relative transition-colors ${toggles.ocr ? 'bg-blue-500' : 'bg-gray-400/30'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${toggles.ocr ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold">Regional Language Translation</div>
              <div className={`text-[10px] mt-0.5 ${T.muted(dark)}`}>Automatically translate Telugu FIRs to English</div>
            </div>
            <button 
              onClick={() => toggle('regional')}
              className={`w-10 h-5 rounded-full relative transition-colors ${toggles.regional ? 'bg-blue-500' : 'bg-gray-400/30'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${toggles.regional ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold">Auto-Flag Critical Blockers</div>
              <div className={`text-[10px] mt-0.5 ${T.muted(dark)}`}>Prevent FIR PDF generation if score drops below 70%</div>
            </div>
            <button 
              onClick={() => toggle('autoFlag')}
              className={`w-10 h-5 rounded-full relative transition-colors ${toggles.autoFlag ? 'bg-blue-500' : 'bg-gray-400/30'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${toggles.autoFlag ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

        </div>
      </div>
    </FIRCard>
  );
}
