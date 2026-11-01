import { BookOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

const POSITIONING_STEPS = [
  'Sit or stand so your face and signing hand are fully visible to the camera.',
  'Keep the room well lit and avoid strong light behind you.',
  'Hold your hand at chest height, with all fingers open and visible.',
  'Keep gloves, rings with reflections and anything covering your hand off while signing.',
  'Make one sign at a time and hold it steady for a moment.',
];

const CONTROL_STEPS = [
  'Press Start Camera and allow camera access when your browser asks.',
  'Wait until the camera status shows Camera live.',
  'Use Demo sentence builder to type English words for a demonstration. Typed words are not sign predictions.',
  'Start Translation only when a trained recognition backend is connected; the backend is not deployed yet.',
  'Press Stop Translation to pause. Stop Camera also turns off translation.',
  'Press Clear Sentence to start a new sentence, or Read Aloud to hear it.',
];

const LIMITATIONS = [
  'The recognition backend is not deployed, and no trained ISL model is included. Camera-based sign recognition is unavailable.',
  'Only the signs the connected model was trained on can be recognized. This app does not cover all of ISL.',
  'The current pipeline tracks a single hand, so two-handed signs may not be recognized correctly.',
  'Lighting, camera angle, clothing and background can all reduce accuracy.',
  'Words are added word by word. The sentence is not grammar-corrected.',
  'Confidence is the model\u2019s own estimate and is not a guarantee of correctness.',
  'This tool is not a replacement for a qualified sign language interpreter.',
];

function NumberedSteps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((item, index) => (
        <li key={item} className="flex gap-3 text-sm leading-relaxed text-slate-300">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-electric-500/15 text-xs font-bold text-electric-300">
            {index + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm leading-relaxed text-slate-300">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-electric-400" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Subsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-electric-300">{title}</h3>
      {children}
    </div>
  );
}

export function InstructionsPanel() {
  return (
    <Card
      id="instructions"
      title="Instructions"
      description="How to get the best results and what the current version can and cannot do."
      icon={BookOpen}
    >
      <div className="space-y-8">
        <Subsection title="Positioning your hands">
          <BulletList items={POSITIONING_STEPS} />
        </Subsection>
        <Subsection title="Starting and stopping translation">
          <NumberedSteps items={CONTROL_STEPS} />
        </Subsection>
        <Subsection title="Current limitations">
          <BulletList items={LIMITATIONS} />
        </Subsection>
      </div>
    </Card>
  );
}
