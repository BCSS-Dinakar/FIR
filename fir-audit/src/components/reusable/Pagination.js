import FIRButton from './FIRButton';

/**
 * Builds the visible page list with ellipsis truncation: always shows the first/last
 * `boundaryCount` pages and a window of `siblingCount` pages around current, filling
 * single-page gaps directly (no "..." over just one skipped page) rather than only
 * over real gaps.
 */
const getPageItems = (current, total, siblingCount = 2, boundaryCount = 1) => {
  const pages = new Set();
  for (let i = 1; i <= boundaryCount; i++) {
    pages.add(i);
    pages.add(total - i + 1);
  }
  for (let i = -siblingCount; i <= siblingCount; i++) pages.add(current + i);

  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);

  const items = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const gap = sorted[i] - sorted[i - 1];
      if (gap === 2) items.push({ type: 'page', value: sorted[i] - 1 });
      else if (gap > 2) items.push({ type: 'ellipsis', key: `e${sorted[i]}` });
    }
    items.push({ type: 'page', value: sorted[i] });
  }
  return items;
};

export default function Pagination({ dark, currentPage, totalPages, onPageChange, siblingCount = 2, boundaryCount = 1 }) {
  if (!totalPages || totalPages <= 1) return null;

  const items = getPageItems(currentPage, totalPages, siblingCount, boundaryCount);
  const T = { muted: (d) => (d ? 'text-white/40' : 'text-black/40') };

  return (
    <div className="flex items-center gap-1.5">
      <FIRButton
        onClick={() => onPageChange(1)}
        variant="secondary"
        dark={dark}
        className={`px-2.5 py-1 text-[11px] h-7 ${currentPage === 1 ? 'opacity-50 pointer-events-none' : ''}`}
      >
        « First
      </FIRButton>
      <FIRButton
        onClick={() => onPageChange(currentPage - 1)}
        variant="secondary"
        dark={dark}
        className={`px-2.5 py-1 text-[11px] h-7 ${currentPage === 1 ? 'opacity-50 pointer-events-none' : ''}`}
      >
        ‹ Previous
      </FIRButton>

      {items.map((item) =>
        item.type === 'ellipsis' ? (
          <span key={item.key} className={`w-7 h-7 flex items-center justify-center text-[11px] font-bold ${T.muted(dark)}`}>
            …
          </span>
        ) : (
          <button
            key={item.value}
            onClick={() => onPageChange(item.value)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold transition-colors ${
              currentPage === item.value
                ? 'bg-blue-500 text-white'
                : item.value === totalPages
                ? `border ${dark ? 'border-blue-500/50 text-blue-400 hover:bg-white/5' : 'border-blue-500/50 text-blue-600 hover:bg-black/5'}`
                : dark ? 'hover:bg-white/5' : 'hover:bg-black/5'
            }`}
          >
            {item.value}
          </button>
        )
      )}

      <FIRButton
        onClick={() => onPageChange(currentPage + 1)}
        variant="secondary"
        dark={dark}
        className={`px-2.5 py-1 text-[11px] h-7 ${currentPage === totalPages ? 'opacity-50 pointer-events-none' : ''}`}
      >
        Next ›
      </FIRButton>
      <FIRButton
        onClick={() => onPageChange(totalPages)}
        variant="secondary"
        dark={dark}
        className={`px-2.5 py-1 text-[11px] h-7 ${currentPage === totalPages ? 'opacity-50 pointer-events-none' : ''}`}
      >
        Last »
      </FIRButton>
    </div>
  );
}
