import { Logo } from '@/components/layout/Logo';
import { StatusPill, type StatusTone } from '@/components/ui/StatusPill';
import { BACKEND_URL_CONFIGURED } from '@/config';
import type { ServerState } from '@/hooks/useSignRecognition';

interface HeaderProps {
  serverState: ServerState;
  modelConfigured: boolean | null;
}

const NAV_ITEMS = [
  { href: '#camera', label: 'Camera' },
  { href: '#translation', label: 'Translation' },
  { href: '#collection', label: 'Collect gestures' },
  { href: '#instructions', label: 'Instructions' },
  { href: '#about', label: 'About' },
];

function describeServer(serverState: ServerState, modelConfigured: boolean | null): { tone: StatusTone; label: string } {
  if (serverState === 'checking') return { tone: 'neutral', label: 'Checking server' };
  if (serverState === 'offline') {
    return {
      tone: 'error',
      label: BACKEND_URL_CONFIGURED ? 'Server offline' : 'Backend not configured',
    };
  }
  if (modelConfigured === false) return { tone: 'warning', label: 'Model not configured' };
  return { tone: 'success', label: 'Model connected' };
}

export function Header({ serverState, modelConfigured }: HeaderProps) {
  const server = describeServer(serverState, modelConfigured);

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-navy-900/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <a href="#camera" aria-label="SignLanguageAD1 home" className="rounded-lg transition hover:opacity-90">
          <Logo />
        </a>
        <nav aria-label="Dashboard sections" className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <StatusPill tone={server.tone} label={server.label} pulse={serverState === 'checking'} />
      </div>
      <nav aria-label="Dashboard sections" className="flex gap-1 overflow-x-auto px-4 pb-3 md:hidden">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="shrink-0 rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:text-white"
          >
            {item.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
