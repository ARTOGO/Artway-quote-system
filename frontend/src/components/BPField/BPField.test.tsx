import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BPField } from './BPField';

describe('BPField', () => {
  it('renders label and associates it with the input via htmlFor', () => {
    render(<BPField label="專案名稱" />);
    const input = screen.getByLabelText('專案名稱');
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
  });

  it('forwards a manually-provided id', () => {
    render(<BPField label="編號" id="my-id" />);
    expect(screen.getByLabelText('編號')).toHaveAttribute('id', 'my-id');
  });

  it('auto-generates an id when none is provided (useId)', () => {
    render(<BPField label="A" />);
    const a = screen.getByLabelText('A') as HTMLInputElement;
    expect(a.id).toBeTruthy();
  });

  it('passes through value + onChange', async () => {
    const onChange = vi.fn();
    render(<BPField label="X" value="initial" onChange={onChange} />);
    const input = screen.getByLabelText('X') as HTMLInputElement;
    expect(input.value).toBe('initial');
    const user = userEvent.setup();
    await user.type(input, 'a');
    expect(onChange).toHaveBeenCalled();
  });

  it('passes through readOnly / placeholder / type', () => {
    render(<BPField label="Email" type="email" placeholder="x@y" readOnly value="a@b.com" />);
    const input = screen.getByLabelText('Email') as HTMLInputElement;
    expect(input.type).toBe('email');
    expect(input.placeholder).toBe('x@y');
    expect(input).toHaveAttribute('readonly');
  });

  it('applies compact class when compact=true', () => {
    const { container, rerender } = render(<BPField label="A" />);
    const rootDefault = container.firstChild as HTMLElement;
    expect(rootDefault.className).not.toMatch(/compact/);

    rerender(<BPField label="A" compact />);
    const rootCompact = container.firstChild as HTMLElement;
    expect(rootCompact.className).toMatch(/compact/);
  });

  it('appends caller className without replacing internal classes', () => {
    const { container } = render(<BPField label="A" className="extra-cls" />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/field/);
    expect(root.className).toMatch(/extra-cls/);
  });
});
