export default function FIRButton({ children, variant = 'primary', dark = true, fullWidth = false, onClick, className = '', icon, ...props }) {
  const base = "inline-flex items-center justify-center font-bold text-xs transition-all duration-200 focus:outline-none flex-shrink-0";
  const widthClass = fullWidth ? "w-full" : "min-w-0";
  const variants = {
    primary: "px-5 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-500 hover:brightness-110 text-white rounded-xl shadow-md shadow-blue-600/20",
    solid: "px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md shadow-blue-600/20",
    secondary: `px-5 py-2.5 border rounded-xl ${dark ? 'border-white/10 hover:bg-white/[0.05] text-white' : 'border-black/10 hover:bg-black/[0.03] text-black'}`,
    outline: `px-3 py-2 rounded-xl border text-xs font-bold transition-all ${dark ? 'border-white/[0.06] hover:bg-white/[0.05] text-white' : 'border-black/[0.08] hover:bg-black/[0.03] text-black'}`,
    ghost: `px-4 py-2 ${dark ? 'text-white/60 hover:text-white' : 'text-black/60 hover:text-black'}`,
    action: `px-3 py-1.5 border rounded-lg text-[10px] ${dark ? 'border-white/10 hover:border-blue-500/50 hover:text-blue-400' : 'border-black/10 hover:border-blue-500 hover:text-blue-600 shadow-sm'}`, // matches "Resolve" buttons
    danger: `px-3 py-1.5 border rounded-lg text-[10px] ${dark ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/15' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'}`,
    warning: `px-3 py-1.5 border rounded-lg text-[10px] ${dark ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/15' : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'}`,
  };

  return (
    <button
      onClick={onClick}
      className={`${base} ${widthClass} ${variants[variant] || variants.primary} ${className}`}
      {...props}
    >
      <div className="flex items-center gap-2 truncate">
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="truncate leading-normal block">{children}</span>
      </div>
    </button>
  );
}
