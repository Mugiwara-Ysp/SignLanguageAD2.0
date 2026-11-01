import { CameraPanel } from '@/components/camera/CameraPanel';
import { GestureCollectionPanel } from '@/components/collection/GestureCollectionPanel';
import { AboutPanel } from '@/components/about/AboutPanel';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { InstructionsPanel } from '@/components/instructions/InstructionsPanel';
import { TranslationPanel } from '@/components/translation/TranslationPanel';
import { useCamera } from '@/hooks/useCamera';
import { useSentence } from '@/hooks/useSentence';
import { useSignRecognition } from '@/hooks/useSignRecognition';
import { useSpeech } from '@/hooks/useSpeech';

export default function App() {
  const camera = useCamera();
  const sentence = useSentence();
  const speech = useSpeech();
  const cameraActive = camera.status === 'active';

  const recognition = useSignRecognition({
    videoRef: camera.videoRef,
    cameraActive,
    onWordConfirmed: sentence.addWord,
  });

  return (
    <div className="flex min-h-screen flex-col">
      <Header serverState={recognition.serverState} modelConfigured={recognition.modelConfigured} />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:py-8">
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <CameraPanel
              videoRef={camera.videoRef}
              status={camera.status}
              errorMessage={camera.errorMessage}
              permission={camera.permission}
              onStart={() => void camera.start()}
              onStop={() => {
                recognition.stop();
                camera.stop();
              }}
            />
          </div>
          <div className="lg:col-span-2">
            <TranslationPanel
              cameraActive={cameraActive}
              recognition={recognition}
              words={sentence.words}
              sentence={sentence.sentence}
              onAddWords={sentence.addWords}
              onClearSentence={sentence.clear}
              speech={speech}
            />
          </div>
        </div>
        <GestureCollectionPanel videoRef={camera.videoRef} cameraActive={cameraActive} />
        <div className="grid gap-6 lg:grid-cols-2">
          <InstructionsPanel />
          <AboutPanel />
        </div>
      </main>
      <Footer />
    </div>
  );
}
