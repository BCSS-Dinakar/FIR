import FIRCard from '../reusable/FIRCard';

export default function ScoreTrendChart({ dark }) {
  const T = {
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
    border: (d) => d ? 'border-white/[0.06]' : 'border-black/[0.08]',
  };

  // Mock data points representing average score over the last 14 days
  const points = [65, 68, 72, 70, 75, 78, 80, 76, 82, 85, 84, 88, 90, 91];
  const max = 100;
  const min = 50;
  const range = max - min;
  
  // Create SVG path
  const width = 600;
  const height = 150;
  const dx = width / (points.length - 1);
  
  const pathData = points.map((p, i) => {
    const x = i * dx;
    const y = height - ((p - min) / range) * height;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  return (
    <FIRCard dark={dark} className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm">Compliance Score Trend</h3>
          <p className={`text-[11px] mt-0.5 ${T.muted(dark)}`}>14-day moving average</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black text-emerald-500">91.4%</div>
          <div className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full mt-1">
            +12.4% vs last week
          </div>
        </div>
      </div>

      <div className="relative w-full h-[150px] mt-6">
        {/* Y-axis labels */}
        <div className={`absolute -left-2 top-0 bottom-0 flex flex-col justify-between text-[9px] font-mono ${T.muted(dark)}`}>
          <span>100</span>
          <span>75</span>
          <span>50</span>
        </div>

        {/* Chart SVG */}
        <div className="ml-6 h-full relative">
          {/* Grid lines */}
          <div className={`absolute inset-0 flex flex-col justify-between ${dark ? 'opacity-10' : 'opacity-20'}`}>
            <div className={`border-t w-full ${T.border(dark)}`} />
            <div className={`border-t w-full ${T.border(dark)}`} />
            <div className={`border-t w-full ${T.border(dark)}`} />
          </div>

          <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </linearGradient>
            </defs>
            
            {/* Area under curve */}
            <path 
              d={`${pathData} L ${width} ${height} L 0 ${height} Z`} 
              fill="url(#trendGradient)" 
            />
            
            {/* Line */}
            <path 
              d={pathData} 
              fill="none" 
              stroke="#10b981" 
              strokeWidth="3" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              className="drop-shadow-sm"
            />

            {/* End dot */}
            <circle 
              cx={width} 
              cy={height - ((points[points.length - 1] - min) / range) * height} 
              r="4" 
              fill="#10b981" 
              stroke={dark ? '#0f172a' : '#ffffff'}
              strokeWidth="2"
            />
          </svg>
        </div>
      </div>
      
      {/* X-axis labels */}
      <div className={`ml-6 flex justify-between text-[9px] font-bold uppercase tracking-wider pt-2 ${T.muted(dark)}`}>
        <span>2 Weeks Ago</span>
        <span>Last Week</span>
        <span>Today</span>
      </div>
    </FIRCard>
  );
}
