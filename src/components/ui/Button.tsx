import clsx from 'clsx';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'whatsapp' | 'dark';
export type ButtonSize = 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-colors select-none ' +
  'disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark active:bg-brand-dark',
  secondary: 'bg-white text-ink border border-paper-strong hover:bg-paper-sunk',
  ghost: 'bg-transparent text-ink hover:bg-paper-sunk',
  danger: 'bg-white text-danger border border-danger/60 hover:bg-danger-soft',
  whatsapp: 'bg-whatsapp text-white hover:brightness-95',
  dark: 'bg-ink text-white hover:bg-black',
};

const sizes: Record<ButtonSize, string> = {
  md: 'min-h-[48px] px-4 text-base',
  lg: 'min-h-[56px] px-5 text-[17px]',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string) {
  return clsx(base, variants[variant], sizes[size], extra);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, block, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, clsx(block && 'w-full', className))} {...rest}>
      {icon}
      {children}
    </button>
  );
});

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  block?: boolean;
}

export function ButtonLink({ variant = 'primary', size = 'md', icon, block, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, size, clsx(block && 'w-full', 'no-underline', className as string))} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string; // required accessible name
  tone?: 'plain' | 'outline' | 'soft';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, tone = 'plain', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40',
        tone === 'outline' && 'border border-paper-strong bg-white hover:bg-paper-sunk',
        tone === 'soft' && 'bg-paper-sunk hover:bg-paper-line',
        tone === 'plain' && 'hover:bg-paper-sunk',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
