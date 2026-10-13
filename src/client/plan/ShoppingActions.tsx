import { useState } from 'react';
import { formatShoppingText } from '../../shared/shopping-text';
import type { Unit } from '../../shared/units';

/** "Copy as text" and "Print": client-side only, no accounts or integrations (AD-14, AC-22). */
export function ShoppingActions({ entries }: { entries: { name: string; quantity: number; unit: Unit }[] }) {
  const [status, setStatus] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatShoppingText(entries));
      setStatus('Copied');
    } catch {
      setStatus('Copy failed');
    }
  }

  return (
    <div className="shopping-actions no-print">
      <button type="button" onClick={() => void copy()}>Copy as text</button>
      <button type="button" onClick={() => window.print()}>Print</button>
      {status && <span role="status">{status}</span>}
    </div>
  );
}
