import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface CardProps {
  id: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
}

export function Card({ id, title, description, icon: Icon, actions, children }: CardProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 animate-fade-in-up rounded-2xl border border-white/10 bg-navy-800/70 p-5 shadow-2xl shadow-black/30 backdrop-blur sm:p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-electric-500/15 text-electric-300 ring-1 ring-electric-400/20">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id={`${id}-title`} className="text-lg font-bold leading-tight text-white">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm leading-relaxed text-slate-400">{description}</p>}
          </div>
        </div>
        {actions}
      </header>
      <div className="mt-5">{children}</div>
    </section>
  );
}
