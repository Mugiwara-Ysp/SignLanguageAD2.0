import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-electric-500 text-white shadow-lg shadow-electric-600/25 hover:bg-electric-400 focus-visible:ring-electric-300',
  secondary:
    'border border-white/10 bg-navy-700 text-slate-100 hover:border-electric-400/40 hover:bg-navy-600 focus-visible:ring-electric-300',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 focus-visible:ring-rose-300',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', icon, className = '', children, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition duration-200 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
