import { useId } from 'react';
import type { Participant } from '../../shared/constraints/types';

/** Ticks for the participants who are eating (FR-12). */
export function ParticipantTicks({ participants, ticked, onChange }: { participants: Participant[]; ticked: number[]; onChange: (ids: number[]) => void }) {
  const prefix = useId();
  if (participants.length === 0) return null;
  return (
    <fieldset className="participant-ticks">
      <legend>Who is eating?</legend>
      {participants.map((p) => (
        <span key={p.id} className="checkbox">
          <input
            id={`${prefix}-${p.id}`}
            type="checkbox"
            checked={ticked.includes(p.id)}
            onChange={(e) => onChange(participants.filter((x) => (x.id === p.id ? e.target.checked : ticked.includes(x.id))).map((x) => x.id))}
          />
          <label htmlFor={`${prefix}-${p.id}`}>{p.name}</label>
          {p.restrictions.length > 0 && <small className="meta"> ({p.restrictions.join(', ')})</small>}
        </span>
      ))}
    </fieldset>
  );
}
