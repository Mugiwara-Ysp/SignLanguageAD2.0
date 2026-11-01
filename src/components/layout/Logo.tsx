import { Hand } from 'lucide-react';

export function Logo() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-electric-500 shadow-lg shadow-electric-600/40">
        <Hand className="h-5 w-5 text-white" aria-hidden="true" />
      </span>
      <span className="text-lg font-bold tracking-tight text-white">
        SignLanguage<span className="text-electric-400">AD1</span>
      </span>
    </div>
  );
}
