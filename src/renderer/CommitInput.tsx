import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & { live: boolean; numeric?: "uint32" | "float"; allowEmpty?: boolean };

// Offline inputs retain their original behavior. Live text fields commit complete values.
export function CommitInput({ live, numeric = "uint32", allowEmpty = false, value, onChange, ...props }: Props) {
  const [draft, setDraft] = useState(String(value ?? ""));
  const focused = useRef(false);
  const changed = useRef(false);
  useEffect(() => {
    if (!focused.current || !changed.current) setDraft(String(value ?? ""));
  }, [value]);
  if (!live) return <input {...props} value={value} onChange={onChange} />;
  return <input {...props} value={draft}
    onFocus={() => { focused.current = true; }}
    onChange={event => {
      changed.current = true;
      setDraft(event.target.value);
      event.target.setCustomValidity("");
    }}
    onBlur={event => {
      focused.current = false;
      if (!changed.current) return;
      const text = draft.trim();
      const valid = (allowEmpty && text === "") || (numeric === "uint32"
        ? /^\d+$/.test(text) && Number(text) <= 0xffffffff
        : text !== "" && Number.isFinite(Number(text)) && Math.abs(Number(text)) <= 3.4028234663852886e38);
      if (!valid) {
        event.target.setCustomValidity(numeric === "uint32" ? "Enter a whole number from 0 to 4294967295." : "Enter a finite number.");
        event.target.reportValidity();
        return;
      }
      event.target.setCustomValidity("");
      changed.current = false;
      event.target.value = text;
      // The original handlers only read target.value; preserve React's input event shape.
      onChange?.(event);
    }}
    onKeyDown={event => {
      if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === "Escape") {
        changed.current = false;
        setDraft(String(value ?? ""));
        event.currentTarget.setCustomValidity("");
        event.currentTarget.blur();
      }
    }} />;
}
