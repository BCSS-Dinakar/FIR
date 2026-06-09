import { useState } from 'react';
import FIRCard from '../reusable/FIRCard';

export default function NotificationPreferences({ dark }) {
  const T = {
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
    border: (d) => d ? 'border-white/[0.06]' : 'border-black/[0.08]',
  };

  const [toggles, setToggles] = useState({
    sms: true,
    email: false,
    dailyReport: true,
  });

  const toggle = (key) => setToggles(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <FIRCard dark={dark} className="space-y-6">
      <div>
        <h3 className="font-bold text-sm">Notification Preferences</h3>
        <p className={`text-[11px] mt-0.5 ${T.muted(dark)}`}>Manage alerts for critical compliance blockers</p>
      </div>

      <div className="space-y-4">
        
        <div className={`p-4 rounded-xl border ${T.border(dark)} flex items-center justify-between`}>
          <div>
            <div className="text-xs font-bold flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              SMS Alerts
            </div>
            <div className={`text-[10px] mt-0.5 ${T.muted(dark)}`}>Immediate SMS to Chief Officer when score falls below 70%</div>
          </div>
          <button 
            onClick={() => toggle('sms')}
            className={`w-10 h-5 rounded-full relative transition-colors ${toggles.sms ? 'bg-blue-500' : 'bg-gray-400/30'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${toggles.sms ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>

        <div className={`p-4 rounded-xl border ${T.border(dark)} flex items-center justify-between`}>
          <div>
            <div className="text-xs font-bold flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email Alerts
            </div>
            <div className={`text-[10px] mt-0.5 ${T.muted(dark)}`}>Email notifications for manual overrides and blocker resolutions</div>
          </div>
          <button 
            onClick={() => toggle('email')}
            className={`w-10 h-5 rounded-full relative transition-colors ${toggles.email ? 'bg-blue-500' : 'bg-gray-400/30'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${toggles.email ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>

        <div className={`p-4 rounded-xl border ${T.border(dark)} flex items-center justify-between`}>
          <div>
            <div className="text-xs font-bold flex items-center gap-2">
              <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Daily PDF Report
            </div>
            <div className={`text-[10px] mt-0.5 ${T.muted(dark)}`}>Automated end-of-day summary report sent to DGP's office</div>
          </div>
          <button 
            onClick={() => toggle('dailyReport')}
            className={`w-10 h-5 rounded-full relative transition-colors ${toggles.dailyReport ? 'bg-blue-500' : 'bg-gray-400/30'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${toggles.dailyReport ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>

      </div>
    </FIRCard>
  );
}
