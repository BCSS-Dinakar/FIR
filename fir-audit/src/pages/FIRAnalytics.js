import { useOutletContext } from 'react-router-dom';
import ScoreTrendChart from '../components/analytics/ScoreTrendChart';
import SectionBreakdown from '../components/analytics/SectionBreakdown';
import OfficerPerformance from '../components/analytics/OfficerPerformance';

export default function FIRAnalytics() {
  const { dark } = useOutletContext();

  const T = {
    card: (d) => d ? 'bg-brand-navy-900 border-white/[0.06] shadow-2xl' : 'bg-white border-black/[0.08] shadow-sm',
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
    border: (d) => d ? 'border-white/[0.06]' : 'border-black/[0.08]',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight mb-1">
          Analytics & Trends
        </h1>
        <p className={`text-xs ${T.muted(dark)}`}>
          Detailed insights into compliance rates, common procedural failures, and case load statistics.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <ScoreTrendChart dark={dark} />
          <SectionBreakdown dark={dark} />
        </div>
        <div className="space-y-6">
          <OfficerPerformance dark={dark} />
        </div>
      </div>
    </div>
  );
}
