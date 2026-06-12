import { useOutletContext } from 'react-router-dom';
import { useState, useEffect } from 'react';
import ScoreTrendChart from '../components/analytics/ScoreTrendChart';
import SectionBreakdown from '../components/analytics/SectionBreakdown';
import OfficerPerformance from '../components/analytics/OfficerPerformance';
import { getFIRAnalytics } from '../api/petition';

export default function FIRAnalytics() {
  const { dark } = useOutletContext();
  const [analyticsData, setAnalyticsData] = useState({ scores: [], blockerCounts: {}, officers: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const data = await getFIRAnalytics();
        if (data && data.success) {
          setAnalyticsData({
            scores: data.scores || [],
            blockerCounts: data.blockerCounts || {},
            officers: data.officers || []
          });
        }
      } catch (err) {
        console.error('Failed to fetch analytics data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  const T = {
    card: (d) => d ? 'bg-brand-navy-900 border-white/[0.06] shadow-2xl' : 'bg-white border-black/[0.08] shadow-sm',
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
    border: (d) => d ? 'border-white/[0.06]' : 'border-black/[0.08]',
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight mb-1">
          Case Analytics & Trends
        </h1>
        <p className={`text-xs ${T.muted(dark)}`}>
          Detailed insights into accuracy rates, common procedural mistakes, and case load statistics.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <ScoreTrendChart dark={dark} scores={analyticsData.scores} />
          <SectionBreakdown dark={dark} blockerCounts={analyticsData.blockerCounts} />
        </div>
        <div className="space-y-6">
          <OfficerPerformance dark={dark} officers={analyticsData.officers} />
        </div>
      </div>
    </div>
  );
}
