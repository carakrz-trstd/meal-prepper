import { RESTRICTIONS, type Restriction } from '../../shared/constraints/types';

/** The six predefined dietary restrictions as checkboxes (AC-20); the list order is the canonical order. */
export function RestrictionCheckboxes({ idPrefix, value, onChange }: { idPrefix: string; value: Restriction[]; onChange: (next: Restriction[]) => void }) {
  return (
    <div className="restrictions">
      {RESTRICTIONS.map((r) => (
        <span key={r} className="checkbox">
          <input
            id={`${idPrefix}-${r}`}
            type="checkbox"
            checked={value.includes(r)}
            onChange={(e) => onChange(RESTRICTIONS.filter((x) => (x === r ? e.target.checked : value.includes(x))))}
          />
          <label htmlFor={`${idPrefix}-${r}`}>{r}</label>
        </span>
      ))}
    </div>
  );
}
