import { type ReactNode, useState } from 'react';

/** Right-edge slide-over (drawer). A chevron handle peeks at the edge: hover to reveal,
 *  click to pin open. The wrapper is pointer-events-none so it never blocks the page;
 *  only the handle and (when open) the panel are interactive. */
export function RightDrawer({ label, children }: { label: string; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || pinned;

  return (
    <div className="pointer-events-none fixed right-0 top-0 z-40 h-full">
      {/* Handle — always visible, sticks out to the left of the panel */}
      <button
        type="button"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => setPinned((p) => !p)}
        title={pinned ? 'Click to unpin' : 'Click to pin open'}
        className="pointer-events-auto absolute right-0 top-28 z-50 flex items-center gap-1 rounded-l-md border border-r-0 border-line bg-ink py-3 pl-1.5 pr-1 text-[11px] font-semibold text-paper shadow-md transition-transform duration-200"
        style={{ transform: open ? 'translateX(-440px)' : 'translateX(0)', writingMode: 'vertical-rl' }}
      >
        <span className="rotate-180">{pinned ? '▶' : '◀'} {label}</span>
      </button>

      {/* Panel */}
      <aside
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={`absolute right-0 top-0 h-full w-[440px] space-y-4 overflow-y-auto border-l border-line bg-paper p-3 shadow-xl transition-transform duration-200 ${
          open ? 'pointer-events-auto translate-x-0' : 'translate-x-full'
        }`}
      >
        {children}
      </aside>
    </div>
  );
}
