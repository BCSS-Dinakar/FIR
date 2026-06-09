export default function FIRBadge({ children, variant = 'info', dark = true, className = '' }) {
  const variants = {
    critical: dark ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-600 border-red-200',
    high: dark ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-amber-50 text-amber-700 border-amber-200',
    compliant: dark ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-600 border-emerald-200',
    info: dark ? 'bg-blue-500/10 text-blue-500 border-transparent' : 'bg-blue-50 text-blue-600 border-transparent',
  };

  return (
    <span className={`inline-flex items-center justify-center text-[9px] font-black px-1.5 py-0.5 rounded border ${variants[variant] || variants.info} ${className}`}>
      {children}
    </span>
  );
}
