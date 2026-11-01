import { useState, type FormEvent } from 'react';
import { Languages, Plus, Trash2, Volume2, VolumeX } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LiveRecognition } from '@/components/translation/LiveRecognition';
import type { SignRecognition } from '@/hooks/useSignRecognition';
import type { SpeechState } from '@/hooks/useSpeech';

interface SentenceBuilderProps {
  words: string[];
  sentence: string;
  onAddWords: (words: string[]) => void;
  onClear: () => void;
  speech: SpeechState;
}

function SentenceBuilder({ words, sentence, onAddWords, onClear, speech }: SentenceBuilderProps) {
  const [manualWords, setManualWords] = useState('');
  const hasWords = words.length > 0;

  function addManualWords(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newWords = manualWords.trim().split(/\s+/).filter(Boolean);
    if (newWords.length === 0) return;
    onAddWords(newWords);
    setManualWords('');
  }

  return (
    <div className="space-y-4">
      <form className="space-y-2" onSubmit={addManualWords}>
        <label htmlFor="manual-words" className="block text-xs font-semibold uppercase tracking-wider text-electric-300">
          Demo sentence builder
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="manual-words"
            type="text"
            value={manualWords}
            onChange={(event) => setManualWords(event.target.value)}
            maxLength={120}
            placeholder="Type English words, e.g. Hello world"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-navy-950 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-electric-400 focus:outline-none focus:ring-2 focus:ring-electric-400/30"
          />
          <Button
            type="submit"
            disabled={!manualWords.trim()}
            icon={<Plus className="h-4 w-4" aria-hidden="true" />}
          >
            Add Words
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-slate-400">
          Demo input only. These words are typed by you and are not sign-language predictions.
        </p>
      </form>

      <div className="rounded-xl border border-white/10 bg-navy-950/60 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-electric-300">English sentence</p>
        {hasWords ? (
          <>
            <p className="min-h-[2.5rem] text-lg leading-relaxed text-white" aria-live="polite">
              {sentence}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {words.map((word, index) => (
                <span
                  key={`${word}-${index}`}
                  className="animate-fade-in-up rounded-lg border border-electric-400/25 bg-electric-500/10 px-2.5 py-1 text-xs font-semibold text-electric-300"
                >
                  {word}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">Your sentence will appear here as you add words.</p>
        )}
      </div>

      {speech.error && (
        <Alert tone="error" title="Read aloud unavailable">
          {speech.error}
        </Alert>
      )}
      {!speech.supported && (
        <Alert tone="info" title="Read aloud not supported">
          This browser does not support text-to-speech. Try a current version of Chrome, Edge, Safari or Firefox.
        </Alert>
      )}

      <div className="flex flex-wrap gap-3">
        {speech.speaking ? (
          <Button variant="secondary" onClick={speech.stop} icon={<VolumeX className="h-4 w-4" aria-hidden="true" />}>
            Stop Reading
          </Button>
        ) : (
          <Button
            onClick={() => speech.speak(sentence)}
            disabled={!hasWords || !speech.supported}
            icon={<Volume2 className="h-4 w-4" aria-hidden="true" />}
          >
            Read Aloud
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={onClear}
          disabled={!hasWords}
          icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
        >
          Clear Sentence
        </Button>
      </div>
    </div>
  );
}

interface TranslationPanelProps {
  cameraActive: boolean;
  recognition: SignRecognition;
  words: string[];
  sentence: string;
  onAddWords: (words: string[]) => void;
  onClearSentence: () => void;
  speech: SpeechState;
}

export function TranslationPanel({
  cameraActive,
  recognition,
  words,
  sentence,
  onAddWords,
  onClearSentence,
  speech,
}: TranslationPanelProps) {
  return (
    <Card
      id="translation"
      title="Translation"
      description="The loaded five-gesture model is an experimental same-session pilot; recognition may not generalize to other sessions or signers. You can also build a spoken English demo sentence manually."
      icon={Languages}
    >
      <div className="space-y-6">
        <LiveRecognition
          cameraActive={cameraActive}
          running={recognition.running}
          starting={recognition.starting}
          live={recognition.live}
          serverState={recognition.serverState}
          modelConfigured={recognition.modelConfigured}
          serverMessage={recognition.serverMessage}
          notice={recognition.notice}
          onStart={recognition.start}
          onStop={recognition.stop}
        />
        <div className="border-t border-white/10 pt-6">
          <SentenceBuilder
            words={words}
            sentence={sentence}
            onAddWords={onAddWords}
            onClear={onClearSentence}
            speech={speech}
          />
        </div>
      </div>
    </Card>
  );
}
