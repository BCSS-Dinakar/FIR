import { useOutletContext } from 'react-router-dom';
import ProfileSettings from '../components/settings/ProfileSettings';
import AIEngineConfig from '../components/settings/AIEngineConfig';
import NotificationPreferences from '../components/settings/NotificationPreferences';

export default function FIRSettings() {
  const { dark } = useOutletContext();

  const T = {
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-black tracking-tight mb-1">
          Station Profile & Settings
        </h1>
        <p className={`text-xs ${T.muted(dark)}`}>
          Configure your station metadata, legal reference databases, and AI checking rules.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <ProfileSettings dark={dark} />
          <NotificationPreferences dark={dark} />
        </div>
        <div className="space-y-6">
          <AIEngineConfig dark={dark} />
        </div>
      </div>
    </div>
  );
}
