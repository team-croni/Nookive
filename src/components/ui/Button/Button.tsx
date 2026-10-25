import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'close';
export type ButtonSize = 'xs' | 'sm' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'sm', className = '', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${className}`.trim()}
      {...props}
    />
  ),
);

Button.displayName = 'Button';
