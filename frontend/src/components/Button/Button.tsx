import type { ButtonHTMLAttributes, JSX } from 'react';

import styles from './Button.module.scss';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/**
 * Button — design-system primitive. Variants:
 *   - primary    金棕背景白字 (主要 CTA)
 *   - secondary  金棕外框 (次要動作)
 *   - ghost      透明背景 (取消 / 隱藏動作)
 *
 * Wraps the native <button> so disabled / type / aria-* / onClick etc work
 * out of the box; pass any HTMLButtonElement attribute via spread.
 */
export function Button({
  variant = 'primary',
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps): JSX.Element {
  const classes = [styles.button, styles[variant], className].filter(Boolean).join(' ');
  return (
    <button {...rest} type={type} className={classes}>
      {children}
    </button>
  );
}
