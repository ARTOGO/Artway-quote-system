// NumberInput — controlled-but-edit-safe numeric input.
//
// Problem this solves (Codex C1): naive `<input type="number">` with a
// `value={item.qty}` controlled prop + `onChange={parseFloat}` loses any
// intermediate decimal state. Typing `0.5` goes through `0`, `0.`, `0.5`,
// but at `0.` the parse yields `0` and React re-renders with `value={0}`,
// stripping the dot. The next keystroke `5` lands on `0` instead of `0.`,
// silently 10×-ing the qty.
//
// Solution: keep the raw user-typed string in local state. Sync from
// external `value` ONLY when the field is not focused (covers
// `load(quote)` and `reset()` paths). Commit the parsed number on blur.
//
// Behaviour:
//   - while focused: local string survives every keystroke, including `0.`
//   - on blur: parseFloat → `onCommit(n)`; the input snaps to the
//     canonical string representation of the committed number.
//   - external changes propagate when not focused (e.g. load existing quote).

import { useEffect, useRef, useState, type InputHTMLAttributes, type JSX } from 'react';

interface NumberInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> {
  value: number;
  onCommit: (n: number) => void;
  /** Parse fallback when input is empty / invalid. Defaults to 0. */
  emptyFallback?: number;
}

export function NumberInput({
  value,
  onCommit,
  emptyFallback = 0,
  ...inputProps
}: NumberInputProps): JSX.Element {
  const [local, setLocal] = useState<string>(String(value));
  const focusedRef = useRef(false);

  // Sync from external value when not focused. This covers load(quote) /
  // reset() flows; while focused we preserve the in-progress decimal.
  useEffect(() => {
    if (!focusedRef.current) {
      setLocal(String(value));
    }
  }, [value]);

  function handleBlur(): void {
    focusedRef.current = false;
    const n = parseFloat(local);
    const final = Number.isNaN(n) ? emptyFallback : n;
    if (final !== value) onCommit(final);
    setLocal(String(final));
  }

  return (
    <input
      {...inputProps}
      type="text"
      inputMode="decimal"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={handleBlur}
    />
  );
}
