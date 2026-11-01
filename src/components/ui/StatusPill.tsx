export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

const toneClasses: Record<StatusTone, { wrap: string; dot: string }> = {
  neutral: { wrap: 'border-white/10 bg-navy-700/80 text-slate-300', dot: 'bg-slate-400' },
  info: { wrap: 'border-electric-400/30 bg-electric-500/10 text-electric-300', dot: 'bg-electric-400' },
  success: { wrap: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300', dot: 'bg-emerald-400' },
  warning: { wrap: 'border-amber-400/30 bg-amber-500/10 text-amber-300', dot: 'bg-amber-400' },
  error: { wrap: 'border-rose-400/30 bg-rose-500/10 text-rose-300', dot: 'bg-rose-400' },
};

interface StatusPillProps {
  tone: StatusTone;
  label: string;
  pulse?: boolean;
}

export function StatusPill({ tone, label, pulse = false }: StatusPillProps) {
  const classes = toneClasses[tone];
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${classes.wrap}`}
    >
      <span className="relative flex h-2 w-2">
        {pulse && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${classes.dot}`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${classes.dot}`} />
      </span>
      {label}
    </span>
  );
}
