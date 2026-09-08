import { ButtonHTMLAttributes, forwardRef } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', children, ...props }, ref) => {
    const baseClasses =
      'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 select-none disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:ring-offset-1 focus:ring-offset-zinc-950 cursor-pointer whitespace-nowrap active:scale-[0.98]';

    const sizeClasses = {
      sm: 'text-xs px-3 py-1.5 gap-1.5',
      md: 'text-sm px-4 py-2 gap-2',
      lg: 'text-base px-5 py-2.5 gap-2.5',
    };

    const variantClasses = {
      primary:
        'bg-gradient-to-b from-violet-600 to-violet-700 hover:from-violet-500 hover:to-violet-600 active:from-violet-700 active:to-violet-800 text-white border border-violet-500/40 border-t-violet-400/60 shadow-sm shadow-violet-950/60 hover:shadow-md hover:shadow-violet-950/80',
      secondary:
        'bg-gradient-to-b from-zinc-800 to-zinc-800/80 hover:from-zinc-700 hover:to-zinc-700/80 active:from-zinc-800 text-zinc-100 border border-zinc-700/60 border-t-zinc-600/40 shadow-xs shadow-black/40',
      ghost:
        'bg-transparent hover:bg-zinc-800/60 active:bg-zinc-800 text-zinc-300 hover:text-zinc-100',
      outline:
        'bg-zinc-900/40 border border-zinc-700/70 hover:bg-zinc-800/60 text-zinc-200 hover:border-zinc-600 shadow-xs shadow-black/20',
    };

    return (
      <button
        ref={ref}
        className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
