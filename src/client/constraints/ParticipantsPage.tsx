import { useEffect, useState, type FormEvent } from 'react';
import type { Participant, Restriction } from '../../shared/constraints/types';
import { constraintsApi } from './constraintsApi';
import { RestrictionCheckboxes } from './RestrictionCheckboxes';

const byName = (a: Participant, b: Participant) => a.name.localeCompare(b.name);

function Row({ p, onSaved, onRemove }: { p: Participant; onSaved: (p: Participant) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const [restrictions, setRestrictions] = useState<Restriction[]>(p.restrictions);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return setError('Enter a name.');
    try {
      const r = await constraintsApi.updateParticipant(p.id, name.trim(), restrictions);
      if (r.kind === 'invalid') return setError(r.fields[0]?.message ?? 'The participant could not be saved.');
      onSaved(r.participant);
      setEditing(false);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <li data-testid={`participant-${p.name}`} className="participant-row">
      {editing ? (
        <>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <RestrictionCheckboxes idPrefix={`edit-${p.id}`} value={restrictions} onChange={setRestrictions} />
          <button type="button" onClick={() => void save()}>Save participant</button>
          <button type="button" onClick={() => { setEditing(false); setName(p.name); setRestrictions(p.restrictions); setError(null); }}>Cancel</button>
          {error && <p role="alert" className="error">{error}</p>}
        </>
      ) : (
        <>
          <strong>{p.name}</strong>{' '}
          <span className="meta">{p.restrictions.length ? p.restrictions.join(', ') : 'no restrictions'}</span>
          <button type="button" aria-label={`Edit ${p.name}`} onClick={() => setEditing(true)}>Edit</button>
          <button type="button" aria-label={`Remove ${p.name}`} onClick={onRemove}>Remove</button>
        </>
      )}
    </li>
  );
}

/** Saved participants with their dietary restrictions (AC-7, AC-20). Only name and restrictions are stored. */
export function ParticipantsPage() {
  const [list, setList] = useState<Participant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);

  useEffect(() => {
    constraintsApi.listParticipants().then((l) => setList([...l].sort(byName)), (e: Error) => setError(e.message));
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter a name for the participant.');
    try {
      const r = await constraintsApi.createParticipant(name.trim(), restrictions);
      if (r.kind === 'invalid') return setError(r.fields[0]?.message ?? 'The participant could not be saved.');
      setList((prev) => [...(prev ?? []), r.participant].sort(byName));
      setName('');
      setRestrictions([]);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(p: Participant) {
    try {
      await constraintsApi.deleteParticipant(p.id);
      setList((prev) => (prev ?? []).filter((x) => x.id !== p.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section>
      <h1>Participants</h1>
      <p className="meta">Saved people with their dietary restrictions. When you plan a meal you tick who is eating.</p>
      {error && <p role="alert" className="error">{error}</p>}

      <form aria-label="Add participant" onSubmit={(e) => void add(e)} noValidate className="participant-form">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <RestrictionCheckboxes idPrefix="add" value={restrictions} onChange={setRestrictions} />
        <button type="submit">Add participant</button>
      </form>

      {list && list.length === 0 && <p>No participants yet.</p>}
      <ul className="participant-list">
        {list?.map((p) => (
          <Row key={`${p.id}-${p.name}-${p.restrictions.join()}`} p={p} onSaved={(u) => setList((prev) => (prev ?? []).map((x) => (x.id === u.id ? u : x)).sort(byName))} onRemove={() => void remove(p)} />
        ))}
      </ul>
    </section>
  );
}
