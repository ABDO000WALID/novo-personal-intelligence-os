import { HTMLAttributes, forwardRef } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'interactive' | 'subtle' | 'elevated';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', variant = 'default', children, ...props }, ref) => {
    const baseClasses =
      'rounded-xl transition-all duration-200 ease-out p-5 relative overflow-hidden';

    const variantClasses = {
      default:
        'bg-gradient-to-b from-zinc-900/80 to-zinc-900/40 border border-zinc-800/80 border-t-zinc-700/40 shadow-sm shadow-black/40 text-zinc-100',
      interactive:
        'bg-gradient-to-b from-zinc-900/80 to-zinc-900/40 border border-zinc-800/80 border-t-zinc-700/40 shadow-sm shadow-black/40 text-zinc-100 hover:border-violet-500/30 hover:border-t-violet-400/50 hover:shadow-md hover:shadow-black/60 hover:-translate-y-0.5 cursor-pointer',
      subtle:
        'bg-zinc-950/50 border border-zinc-800/40 text-zinc-300',
      elevated:
        'bg-zinc-900/95 border border-zinc-800/90 border-t-zinc-700/50 shadow-lg shadow-black/60 text-zinc-100',
    };

    return (
      <div
        ref={ref}
        className={`${baseClasses} ${variantClasses[variant]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
