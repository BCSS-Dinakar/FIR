import { useState } from 'react';
import FIRCard from '../reusable/FIRCard';
import FIRButton from '../reusable/FIRButton';
import { updateProfile } from '../../api/auth';
import { useGlobals } from '../../context/GlobalsContext';

export default function ProfileSettings() {
  const { dark, officer, setOfficer } = useGlobals();

  const [stationName, setStationName] = useState(
    officer?.station === 'PS/HYD/04'
      ? 'Hyderabad Central Police Station'
      : `${officer?.district || ''} Station (${officer?.station || ''})`
  );
  const [stationCode, setStationCode] = useState(officer?.station || '');
  const [chiefOfficer, setChiefOfficer] = useState(
    officer?.rank === 'Inspector' && officer?.name.includes('Shiva')
      ? 'ACP M. Srinivas'
      : officer?.name || ''
  );
  const [zone, setZone] = useState('Central Zone');
  const [success, setSuccess] = useState(false);

  const T = {
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
    input: (d) => d ? 'bg-white/[0.03] border-white/10 text-white focus:border-blue-500' : 'bg-black/[0.02] border-black/10 text-brand-charcoal focus:border-blue-600',
  };

  const handleSave = async () => {
    try {
      const data = await updateProfile({
        station: stationCode
      });
      if (data && data.success && data.user) {
        setOfficer(data.user);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save profile changes:', err);
      alert('Failed to save profile changes: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <FIRCard dark={dark} className="space-y-6">
      <div>
        <h3 className="font-bold text-sm">Station Profile</h3>
        <p className={`text-[11px] mt-0.5 ${T.muted(dark)}`}>Manage your police station's metadata and jurisdiction details</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className={`block text-[10px] font-bold uppercase tracking-wider mb-2 ${T.muted(dark)}`}>Station Name</label>
          <input 
            type="text" 
            value={stationName} 
            onChange={(e) => setStationName(e.target.value)} 
            className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 ${T.input(dark)}`} 
          />
        </div>
        <div>
          <label className={`block text-[10px] font-bold uppercase tracking-wider mb-2 ${T.muted(dark)}`}>Station ID Code</label>
          <input 
            type="text" 
            value={stationCode} 
            onChange={(e) => setStationCode(e.target.value)} 
            className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 ${T.input(dark)}`} 
          />
        </div>
        <div>
          <label className={`block text-[10px] font-bold uppercase tracking-wider mb-2 ${T.muted(dark)}`}>Jurisdiction Zone</label>
          <select 
            value={zone} 
            onChange={(e) => setZone(e.target.value)} 
            className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 ${T.input(dark)}`}
          >
            <option>Central Zone</option>
            <option>North Zone</option>
            <option>South Zone</option>
          </select>
        </div>
        <div>
          <label className={`block text-[10px] font-bold uppercase tracking-wider mb-2 ${T.muted(dark)}`}>Chief Officer</label>
          <input 
            type="text" 
            value={chiefOfficer} 
            onChange={(e) => setChiefOfficer(e.target.value)} 
            className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 ${T.input(dark)}`} 
          />
        </div>
      </div>
      
      <div className="pt-2 border-t border-gray-400/10 flex justify-between items-center">
        <div>
          {success && (
            <span className="text-[11px] text-emerald-500 font-bold flex items-center gap-1.5 animate-in fade-in duration-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0" />
              </svg>
              Changes saved successfully!
            </span>
          )}
        </div>
        <FIRButton variant="primary" onClick={handleSave}>Save Changes</FIRButton>
      </div>
    </FIRCard>
  );
}
