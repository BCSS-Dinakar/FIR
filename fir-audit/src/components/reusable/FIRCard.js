export default function FIRCard({ children, dark = true, className = '', noPadding = false }) {
  const paddingClass = noPadding ? '' : 'p-6';
  const themeClass = dark ? 'bg-brand-navy-900 border-white/[0.06]' : 'bg-white border-black/[0.08] shadow-sm';
  
  return (
    <div className={`rounded-2xl border transition-colors ${paddingClass} ${themeClass} ${className}`}>
      {children}
    </div>
  );
}
