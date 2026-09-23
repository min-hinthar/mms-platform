import { useId, type ReactNode } from "react";

/**
 * Field — label, control and ONE note line, wired for assistive tech (Phase 0). Before it, `aria-
 * invalid` appeared four times in the whole repo, all on staff screens: a diner's refused email or
 * code was a sentence somewhere else on the page with nothing tying it to the box that caused it.
 *
 * The caller renders its own control (input, textarea, select — whatever it needs) from the props
 * handed to `children`, so this never has to proxy every input attribute:
 *
 *   <Field label="Email" hint="We'll send a code" error={err}>
 *     {(control) => <input {...control} type="email" value={v} onChange={…} />}
 *   </Field>
 *
 * The note line is the hint OR the error — an error replaces the hint it contradicts — and is
 * referenced by `aria-describedby`. It is NOT a live region: the view already owns one (one live
 * region per view, QA §A); announce the refusal there and move focus to the field.
 */
export type FieldControlProps = {
  id: string;
  className: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
};

export function Field({
  label,
  labelMy,
  hint,
  error,
  required = false,
  children,
}: {
  label: ReactNode;
  /** The Burmese echo of the label, on the Padauk stack. */
  labelMy?: ReactNode;
  hint?: ReactNode;
  /** A refusal for THIS field. Truthy → `aria-invalid` + the note line becomes the error. */
  error?: ReactNode;
  required?: boolean;
  children: (control: FieldControlProps) => ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error || hint;
  return (
    <div className="ui-field">
      <label htmlFor={id} className="ui-field-label">
        {label}
        {labelMy ? (
          <span lang="my" className="ui-field-label-my">
            {labelMy}
          </span>
        ) : null}
      </label>
      {children({
        id,
        className: "ui-field-control",
        "aria-describedby": note ? noteId : undefined,
        "aria-invalid": error ? true : undefined,
        "aria-required": required ? true : undefined,
      })}
      {note ? (
        // Keyed on the error so each NEW refusal replays the small rise; the hint never animates.
        <p
          id={noteId}
          key={error ? String(error) : "hint"}
          className={error ? "ui-field-note ui-field-error" : "ui-field-note"}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}
