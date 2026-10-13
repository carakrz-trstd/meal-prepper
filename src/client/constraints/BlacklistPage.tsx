import { useEffect, useState, type FormEvent } from 'react';
import { constraintsApi, type BlacklistItem } from './constraintsApi';

/** Ingredients that never appear in suggestions and trigger a warning when planned manually (AC-6, AC-13). */
export function BlacklistPage() {
  const [items, setItems] = useState<BlacklistItem[] | null>(null);
  const [term, setTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    constraintsApi.listBlacklist().then(setItems, (e: Error) => setError(e.message));
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!term.trim()) return setError('Enter an ingredient.');
    try {
      const item = await constraintsApi.addBlacklist(term.trim());
      setItems((prev) => {
        const rest = (prev ?? []).filter((i) => i.id !== item.id);
        return [...rest, item].sort((a, b) => a.term.localeCompare(b.term));
      });
      setTerm('');
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(item: BlacklistItem) {
    try {
      await constraintsApi.removeBlacklist(item.id);
      setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section>
      <h1>Ingredient blacklist</h1>
      <p className="meta">Meals with these ingredients are never suggested. A word also matches longer names ("nut" matches "walnut").</p>
      {error && <p role="alert" className="error">{error}</p>}
      <form onSubmit={(e) => void add(e)} noValidate className="blacklist-form">
        <label>
          Ingredient
          <input value={term} onChange={(e) => setTerm(e.target.value)} />
        </label>
        <button type="submit">Add to blacklist</button>
      </form>
      {items && items.length === 0 && <p>Nothing is blacklisted yet.</p>}
      <ul className="blacklist">
        {items?.map((i) => (
          <li key={i.id}>
            <span>{i.term}</span>
            <button type="button" aria-label={`Remove ${i.term}`} onClick={() => void remove(i)}>Remove</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
