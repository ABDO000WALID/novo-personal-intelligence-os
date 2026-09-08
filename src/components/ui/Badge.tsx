import { HTMLAttributes, ReactNode } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'violet' | 'outline' | 'success' | 'muted';
  children?: ReactNode;
  className?: string;
}


export function Badge({
  className = '',
  variant = 'default',
  children,
  ...props
}: BadgeProps) {
  const baseClasses =
    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium tracking-wide whitespace-nowrap select-none';

  const variantClasses = {
    default: 'bg-zinc-800/80 text-zinc-200 border border-zinc-700/60 shadow-xs shadow-black/30',
    violet: 'bg-violet-950/40 text-violet-300 border border-violet-700/40 shadow-xs shadow-violet-950/40',
    outline: 'border border-zinc-700/70 text-zinc-300 bg-zinc-900/30',
    success: 'bg-emerald-950/40 text-emerald-300 border border-emerald-700/40 shadow-xs shadow-emerald-950/40',
    muted: 'bg-zinc-900/80 text-zinc-400 border border-zinc-800/80',
  };

  return (
    <span
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
