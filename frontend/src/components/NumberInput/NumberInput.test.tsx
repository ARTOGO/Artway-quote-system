import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { NumberInput } from './NumberInput';

// Test harness: parent owns the committed value; renders NumberInput
// + a sibling showing the latest commit so we can assert what gets passed.
function Harness({ initial = 0, onCommit }: { initial?: number; onCommit?: (n: number) => void }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <NumberInput
        value={v}
        onCommit={(n) => {
          setV(n);
          onCommit?.(n);
        }}
        aria-label="num"
      />
      <span data-testid="committed">{v}</span>
    </>
  );
}

describe('NumberInput', () => {
  it('renders the initial value as a string', () => {
    render(<Harness initial={5} />);
    expect((screen.getByLabelText('num') as HTMLInputElement).value).toBe('5');
  });

  it('preserves the decimal point during in-progress typing', async () => {
    const onCommit = vi.fn();
    render(<Harness initial={0} onCommit={onCommit} />);
    const input = screen.getByLabelText('num') as HTMLInputElement;
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, '0.5');
    // While focused the raw string survives — `0.` is never collapsed to `0`.
    expect(input.value).toBe('0.5');
    // No commit until blur
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits parsed number on blur', async () => {
    const onCommit = vi.fn();
    render(<Harness initial={0} onCommit={onCommit} />);
    const input = screen.getByLabelText('num') as HTMLInputElement;
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, '1.5');
    await user.tab(); // blur
    expect(onCommit).toHaveBeenCalledWith(1.5);
    expect(screen.getByTestId('committed').textContent).toBe('1.5');
  });

  it('commits the fallback (0) on blur of empty input', async () => {
    const onCommit = vi.fn();
    render(<Harness initial={5} onCommit={onCommit} />);
    const input = screen.getByLabelText('num') as HTMLInputElement;
    const user = userEvent.setup();
    await user.clear(input);
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith(0);
    expect(input.value).toBe('0');
  });

  it('snaps display to canonical number on blur (trailing-dot collapse)', async () => {
    render(<Harness initial={0} />);
    const input = screen.getByLabelText('num') as HTMLInputElement;
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, '7.');
    await user.tab();
    // parseFloat('7.') === 7; display normalises
    expect(input.value).toBe('7');
  });

  it('does NOT call onCommit when blur leaves the value unchanged', async () => {
    const onCommit = vi.fn();
    render(<Harness initial={3} onCommit={onCommit} />);
    const input = screen.getByLabelText('num') as HTMLInputElement;
    const user = userEvent.setup();
    await user.click(input);
    await user.tab(); // blur without changes
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('updates from external value when not focused', () => {
    // Parent fully owns `value` — simulate loading a quote where qty
    // changes externally. NumberInput's useEffect must sync local string.
    function ExtHarness({ value }: { value: number }) {
      return <NumberInput value={value} onCommit={() => {}} aria-label="num" />;
    }
    const { rerender } = render(<ExtHarness value={0} />);
    const input = screen.getByLabelText('num') as HTMLInputElement;
    expect(input.value).toBe('0');
    rerender(<ExtHarness value={42} />);
    expect(input.value).toBe('42');
  });
});
