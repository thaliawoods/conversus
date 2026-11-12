import { useState } from "react";
import { PRONOUN_CHOICES } from "../pronouns";

type PronounsPickerProps = {
  value: string;
  onChange: (pronouns: string) => void;
};

function PronounsPicker({ value, onChange }: PronounsPickerProps) {
  const [other, setOther] = useState(value !== "" && !PRONOUN_CHOICES.includes(value));

  return (
    <div className="pronouns-picker" role="group" aria-label="Pronoms">
      {PRONOUN_CHOICES.map((choice) => {
        const chosen = !other && value === choice;
        return (
          <button
            key={choice}
            type="button"
            className={chosen ? "active" : undefined}
            aria-pressed={chosen}
            onClick={() => {
              setOther(false);
              onChange(chosen ? "" : choice);
            }}
          >
            {choice}
          </button>
        );
      })}
      <button
        type="button"
        className={other ? "active" : undefined}
        aria-pressed={other}
        onClick={() => {
          setOther(!other);
          onChange("");
        }}
      >
        autre
      </button>
      {other && (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={20}
          aria-label="Tes pronoms"
          autoFocus
        />
      )}
    </div>
  );
}

export default PronounsPicker;
