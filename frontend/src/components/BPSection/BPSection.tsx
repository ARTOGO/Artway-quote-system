// BPSection — Builder-panel section (uppercase gold title + content slot).
//
// Legacy class: `.bp-section` (margin-bottom + hairline divider) +
// `.bp-section-compact` (denser field spacing). We don't apply
// `.bp-section-compact` to children automatically — each <BPField> takes its
// own `compact` prop so the section can mix compact + full-width fields if
// needed. The class on the wrapper is purely cosmetic (spacing between
// sections).

import type { JSX, ReactNode } from 'react';

import styles from './BPSection.module.scss';

interface BPSectionProps {
  title: string;
  /** Optional trailing element rendered on the right of the title row (e.g. an action button). */
  action?: ReactNode;
  /** Dense between-field spacing (matches legacy `.bp-section-compact`). */
  compact?: boolean;
  children: ReactNode;
  className?: string;
}

export function BPSection({
  title,
  action,
  compact = false,
  children,
  className,
}: BPSectionProps): JSX.Element {
  const rootClass = [styles.section, compact && styles.compact, className]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={rootClass}>
      <div className={styles.title}>
        <span>{title}</span>
        {action !== undefined && <span className={styles.action}>{action}</span>}
      </div>
      {children}
    </section>
  );
}
