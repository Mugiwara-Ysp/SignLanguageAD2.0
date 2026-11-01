import { useCallback, useState } from 'react';

export function useSentence() {
  const [words, setWords] = useState<string[]>([]);

  const addWord = useCallback((word: string) => {
    setWords((previous) => [...previous, word]);
  }, []);

  const addWords = useCallback((newWords: string[]) => {
    setWords((previous) => [...previous, ...newWords]);
  }, []);

  const clear = useCallback(() => setWords([]), []);

  return { words, sentence: words.join(' '), addWord, addWords, clear };
}
