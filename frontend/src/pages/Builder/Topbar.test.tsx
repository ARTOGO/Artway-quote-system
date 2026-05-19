import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useRef, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QuoteProvider, useQuoteState } from '../../state/QuoteContext';
import { Topbar } from './Topbar';

// ─── Test harness ─────────────────────────────────────────────────────────

function withProvider(ui: ReactNode) {
  return <QuoteProvider>{ui}</QuoteProvider>;
}

/**
 * Sets a non-default state inside the provider so we can assert that
 * `+ 新報價` actually wipes it back to blank. Dispatches inside useEffect
 * (not during render) so React 19 doesn't warn about setState-in-render.
 */
function Seeder({ children }: { children: ReactNode }) {
  const { setMeta, setClient } = useQuoteState();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    setMeta('title', 'old title');
    setClient('company', 'OLD-CORP');
  }, [setMeta, setClient]);
  return <>{children}</>;
}

// Probe that prints current state for assertions
function Probe() {
  const { state } = useQuoteState();
  return (
    <>
      <span data-testid="title-echo">{state.meta.title}</span>
      <span data-testid="company-echo">{state.client.company}</span>
    </>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── F4: data-status attribute (replaces inline-style hex) ────────────────

describe('Topbar status dot', () => {
  it('renders a status dot with data-status matching state.status', () => {
    render(withProvider(<Topbar />));
    const dot = screen.getByTestId('status-dot');
    expect(dot).toHaveAttribute('data-status', 'draft');
  });

  it('does not use inline background-color (CLAUDE.md禁止 inline style)', () => {
    render(withProvider(<Topbar />));
    const dot = screen.getByTestId('status-dot') as HTMLElement;
    // Either no style attribute, or style is empty / doesn't set background
    expect(dot.style.background).toBe('');
    expect(dot.style.backgroundColor).toBe('');
  });

  it('updates data-status when status changes via the select', async () => {
    render(withProvider(<Topbar />));
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('報價單狀態'), 'sent');
    expect(screen.getByTestId('status-dot')).toHaveAttribute('data-status', 'sent');
  });
});

// ─── F3: New Quote button wiring ──────────────────────────────────────────

describe('Topbar 新報價 button', () => {
  it('prompts for confirmation before resetting', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      withProvider(
        <Seeder>
          <Topbar />
          <Probe />
        </Seeder>,
      ),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /新報價/ }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  it('resets state to blank when user confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      withProvider(
        <Seeder>
          <Topbar />
          <Probe />
        </Seeder>,
      ),
    );
    expect(screen.getByTestId('title-echo').textContent).toBe('old title');
    expect(screen.getByTestId('company-echo').textContent).toBe('OLD-CORP');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /新報價/ }));

    expect(screen.getByTestId('title-echo').textContent).toBe('');
    expect(screen.getByTestId('company-echo').textContent).toBe('');
  });

  it('keeps state when user cancels confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      withProvider(
        <Seeder>
          <Topbar />
          <Probe />
        </Seeder>,
      ),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /新報價/ }));
    expect(screen.getByTestId('title-echo').textContent).toBe('old title');
  });

  it('clears state.meta.quoteNo on confirm so BuilderPanel will re-fetch a fresh serial', async () => {
    // F9 fix: quote-number allocation moved to backend
    // (`POST /api/quotes/next-number`). The new-quote button just resets
    // state; BuilderPanel's useEffect detects `quoteNo === ''` and fetches
    // a fresh atomic serial.
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    function Probe() {
      const { state } = useQuoteState();
      return <span data-testid="qn-echo">{state.meta.quoteNo}</span>;
    }

    function PreseedQuoteNo({ children }: { children: ReactNode }) {
      const { setQuoteNo } = useQuoteState();
      const ran = useRef(false);
      useEffect(() => {
        if (ran.current) return;
        ran.current = true;
        setQuoteNo('AW-260518-007');
      }, [setQuoteNo]);
      return <>{children}</>;
    }

    render(
      withProvider(
        <PreseedQuoteNo>
          <Topbar />
          <Probe />
        </PreseedQuoteNo>,
      ),
    );

    // Wait for the preseed useEffect to commit before asserting
    await screen.findByText('AW-260518-007');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /新報價/ }));

    expect(screen.getByTestId('qn-echo').textContent).toBe('');
  });
});
