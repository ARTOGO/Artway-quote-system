import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BPSection } from './BPSection';

describe('BPSection', () => {
  it('renders the title and children', () => {
    render(
      <BPSection title="基本資訊">
        <p>body</p>
      </BPSection>,
    );
    expect(screen.getByText('基本資訊')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('uses a <section> element as the root', () => {
    const { container } = render(
      <BPSection title="A">
        <span />
      </BPSection>,
    );
    expect(container.firstChild?.nodeName).toBe('SECTION');
  });

  it('renders an action node when provided', () => {
    render(
      <BPSection title="A" action={<button>reload</button>}>
        <span />
      </BPSection>,
    );
    expect(screen.getByRole('button', { name: 'reload' })).toBeInTheDocument();
  });

  it('omits the action slot when no action is passed', () => {
    const { container } = render(
      <BPSection title="A">
        <span />
      </BPSection>,
    );
    // Action slot should not render an empty span
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('applies compact class when compact=true', () => {
    const { container, rerender } = render(
      <BPSection title="A">
        <span />
      </BPSection>,
    );
    expect((container.firstChild as HTMLElement).className).not.toMatch(/compact/);

    rerender(
      <BPSection title="A" compact>
        <span />
      </BPSection>,
    );
    expect((container.firstChild as HTMLElement).className).toMatch(/compact/);
  });
});
