import FIRCard from '../reusable/FIRCard';

export default function OfficerPerformance({ dark }) {
  const T = {
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
    border: (d) => d ? 'border-white/[0.06]' : 'border-black/[0.08]',
  };

  const officers = [
    { name: 'Insp. K. Shiva Kumar', rank: '1', score: 98, trend: '+2', initials: 'KS', color: 'from-blue-600 to-cyan-500' },
    { name: 'SI R. Venkatesh', rank: '2', score: 95, trend: '+4', initials: 'RV', color: 'from-emerald-600 to-teal-500' },
    { name: 'Insp. P. Lakshmi', rank: '3', score: 92, trend: '-1', initials: 'PL', color: 'from-purple-600 to-pink-500' },
    { name: 'SI M. Rajesh', rank: '4', score: 88, trend: '+1', initials: 'MR', color: 'from-amber-600 to-orange-500' },
  ];

  return (
    <FIRCard dark={dark} className="space-y-4">
      <div>
        <h3 className="font-bold text-sm">Top Performing Officers</h3>
        <p className={`text-[11px] mt-0.5 ${T.muted(dark)}`}>Ranked by avg compliance score</p>
      </div>

      <div className="divide-y divide-gray-400/10">
        {officers.map((officer) => (
          <div key={officer.rank} className="py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-[10px] font-black opacity-30 w-3">{officer.rank}</div>
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${officer.color} flex items-center justify-center text-white font-black text-[10px] shadow-sm`}>
                {officer.initials}
              </div>
              <div>
                <div className="text-xs font-bold">{officer.name}</div>
                <div className={`text-[9px] ${T.muted(dark)}`}>Score: {officer.score}%</div>
              </div>
            </div>
            
            <div className={`text-[10px] font-bold px-2 py-1 rounded-md ${
              officer.trend.startsWith('+') 
                ? 'bg-emerald-500/10 text-emerald-500' 
                : 'bg-red-500/10 text-red-500'
            }`}>
              {officer.trend}
            </div>
          </div>
        ))}
      </div>
    </FIRCard>
  );
}
