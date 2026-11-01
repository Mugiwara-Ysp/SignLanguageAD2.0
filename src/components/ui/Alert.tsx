import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

const toneClasses: Record<AlertTone, { wrap: string; Icon: LucideIcon }> = {
  info: { wrap: 'border-electric-400/30 bg-electric-500/10 text-slate-200', Icon: Info },
  success: { wrap: 'border-emerald-400/30 bg-emerald-500/10 text-slate-200', Icon: CheckCircle2 },
  warning: { wrap: 'border-amber-400/40 bg-amber-500/10 text-slate-200', Icon: AlertTriangle },
  error: { wrap: 'border-rose-400/40 bg-rose-500/10 text-slate-200', Icon: AlertCircle },
};

interface AlertProps {
  tone: AlertTone;
  title?: string;
  children: ReactNode;
}

export function Alert({ tone, title, children }: AlertProps) {
  const { wrap, Icon } = toneClasses[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex gap-3 rounded-xl border p-4 text-sm leading-relaxed ${wrap}`}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-semibold text-white">{title}</p>}
        <div className={title ? 'mt-1 text-slate-300' : undefined}>{children}</div>
      </div>
    </div>
  );
}
