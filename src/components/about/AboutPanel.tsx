import { Info } from 'lucide-react';
import { Card } from '@/components/ui/Card';

const DETAILS: { label: string; value: string }[] = [
  { label: 'Project name', value: 'SignLanguageAD1' },
  { label: 'Purpose', value: 'Indian Sign Language to English Translator' },
  { label: 'Version', value: '0.1.0' },
  { label: 'Frontend', value: 'React and Vite' },
  { label: 'Recognition backend', value: 'Separate Python FastAPI service. Five-class GRU pipeline is implemented; no model has been trained or deployed.' },
  { label: 'Privacy', value: 'Video stays in your browser. Ordered 12-frame sequences are sent to your recognition server only while translation runs.' },
];

export function AboutPanel() {
  return (
    <Card
      id="about"
      title="About"
      description="SignLanguageAD1 - Indian Sign Language to English Translator."
      icon={Info}
    >
      <p className="text-sm leading-relaxed text-slate-300">
        SignLanguageAD1 is a dashboard for translating Indian Sign Language gestures into English words and sentences.
        Real sign recognition is not available until a model has been trained and evaluated with independent recording
        sessions and the separate backend is deployed.
      </p>
      <dl className="mt-6 divide-y divide-white/10 rounded-xl border border-white/10 bg-navy-950/40">
        {DETAILS.map((detail) => (
          <div key={detail.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">{detail.label}</dt>
            <dd className="text-sm text-slate-200">{detail.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
