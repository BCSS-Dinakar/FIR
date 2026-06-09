import FIRCard from '../reusable/FIRCard';
import FIRButton from '../reusable/FIRButton';

export default function ProfileSettings({ dark }) {
  const T = {
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
    input: (d) => d ? 'bg-white/[0.03] border-white/10 text-white focus:border-blue-500' : 'bg-black/[0.02] border-black/10 text-brand-charcoal focus:border-blue-600',
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
          <input type="text" defaultValue="Hyderabad Central Police Station" className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 ${T.input(dark)}`} />
        </div>
        <div>
          <label className={`block text-[10px] font-bold uppercase tracking-wider mb-2 ${T.muted(dark)}`}>Station ID Code</label>
          <input type="text" defaultValue="PS/HYD/04" disabled className={`w-full px-4 py-2.5 rounded-xl border text-xs opacity-50 cursor-not-allowed ${T.input(dark)}`} />
        </div>
        <div>
          <label className={`block text-[10px] font-bold uppercase tracking-wider mb-2 ${T.muted(dark)}`}>Jurisdiction Zone</label>
          <select className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 ${T.input(dark)}`}>
            <option>Central Zone</option>
            <option>North Zone</option>
            <option>South Zone</option>
          </select>
        </div>
        <div>
          <label className={`block text-[10px] font-bold uppercase tracking-wider mb-2 ${T.muted(dark)}`}>Chief Officer</label>
          <input type="text" defaultValue="ACP M. Srinivas" className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 ${T.input(dark)}`} />
        </div>
      </div>
      
      <div className="pt-2 border-t border-gray-400/10 flex justify-end">
        <FIRButton variant="primary">Save Changes</FIRButton>
      </div>
    </FIRCard>
  );
}
