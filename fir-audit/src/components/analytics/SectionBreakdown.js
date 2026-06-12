import FIRCard from '../reusable/FIRCard';

export default function SectionBreakdown({ dark, blockerCounts = {} }) {
  const T = {
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
    border: (d) => d ? 'border-white/[0.06]' : 'border-black/[0.08]',
  };

  const totalBlockerCount = Object.values(blockerCounts).reduce((a, b) => a + b, 0);

  let data = [];
  if (totalBlockerCount > 0) {
    data = Object.entries(blockerCounts)
      .map(([section, count], idx) => {
        const colors = ['bg-red-500', 'bg-amber-500', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500'];
        return {
          section,
          count,
          color: colors[idx % colors.length]
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  } else {
    data = [
      { section: 'Missing Sec 173 Signatures', count: 0, color: 'bg-red-500' },
      { section: 'Invalid Date Format', count: 0, color: 'bg-amber-500' },
      { section: 'Missing Forensic ID', count: 0, color: 'bg-orange-500' },
      { section: 'Incorrect BNS Mapping', count: 0, color: 'bg-yellow-500' },
      { section: 'Unclear Accused Details', count: 0, color: 'bg-blue-500' },
    ];
  }

  const max = Math.max(...data.map(d => d.count), 1);

  return (
    <FIRCard dark={dark} className="space-y-5">
      <div>
        <h3 className="font-bold text-sm">Common Procedural Failures</h3>
        <p className={`text-[11px] mt-0.5 ${T.muted(dark)}`}>Top blockers flagged by AI this month</p>
      </div>

      <div className="space-y-4">
        {data.map((item, idx) => {
          const width = `${(item.count / max) * 100}%`;
          return (
            <div key={idx} className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-bold">
                <span>{item.section}</span>
                <span className={T.muted(dark)}>{item.count}</span>
              </div>
              <div className={`h-2 w-full rounded-full overflow-hidden ${dark ? 'bg-white/5' : 'bg-black/5'}`}>
                <div 
                  className={`h-full rounded-full ${item.color} transition-all duration-1000 ease-out`}
                  style={{ width }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </FIRCard>
  );
}
