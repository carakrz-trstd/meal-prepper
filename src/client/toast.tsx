import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface ToastOptions {
  message: string;
  /** e.g. "Undo" */
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  /** how long the toast stays; default 8 seconds */
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const MAX_TOASTS = 3;

interface ToastApi {
  show(options: ToastOptions): void;
}

/** Without a provider the toasts are simply not shown, so components work in isolation (and in tests). */
const ToastContext = createContext<ToastApi>({ show: () => undefined });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

function Toast({ item, defaultDurationMs, onDone }: { item: ToastItem; defaultDurationMs: number; onDone: () => void }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(onDone, item.durationMs ?? defaultDurationMs);
    return () => clearTimeout(t);
  }, [paused, item.durationMs, defaultDurationMs, onDone]);

  async function act() {
    onDone();
    try {
      await item.onAction?.();
    } catch {
      /* the action reports its own errors */
    }
  }

  return (
    <div
      className="toast"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="toast-message">{item.message}</span>
      {item.actionLabel && (
        <button type="button" className="toast-action" onClick={() => void act()}>{item.actionLabel}</button>
      )}
      <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={onDone}>×</button>
    </div>
  );
}

/** Short messages with an optional action such as "Undo". The region is announced politely to screen readers. */
export function ToastProvider({ children, defaultDurationMs = 8000 }: { children: ReactNode; defaultDurationMs?: number }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback((options: ToastOptions) => {
    const item = { ...options, id: nextId.current++ };
    setItems((prev) => [...prev, item].slice(-MAX_TOASTS));
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts no-print" aria-live="polite">
        {items.map((item) => (
          <Toast key={item.id} item={item} defaultDurationMs={defaultDurationMs} onDone={() => setItems((prev) => prev.filter((x) => x.id !== item.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
