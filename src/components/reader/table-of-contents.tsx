'use client';

import { useEffect, useState } from 'react';

export function TableOfContents() {
  const [items, setItems] = useState<{ label: string; href: string; level: number }[]>([]);

  useEffect(() => {
    const update = () => {
      const t = (window as unknown as { __readerToc?: typeof items }).__readerToc;
      if (t) setItems(t);
    };
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, []);

  if (items.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No table of contents.</div>;
  }

  return (
    <nav aria-label="Table of contents" className="py-2">
      <ul className="text-sm">
        {items.map((it, i) => (
          <li key={i} style={{ paddingLeft: `${it.level * 12 + 16}px` }} className="pr-4">
            <button
              className="w-full text-left py-1.5 hover:bg-accent rounded px-2 truncate"
              onClick={() => {
                const go = (window as unknown as { __readerGoToToc?: (href: string) => void }).__readerGoToToc;
                if (go) go(it.href);
              }}
              title={it.label}
            >
              {it.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
