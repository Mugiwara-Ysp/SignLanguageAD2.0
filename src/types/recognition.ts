export type RecognitionStatus = 'ok' | 'no_hand' | 'unknown' | 'not_configured';

export interface RecognitionResponse {
  status: RecognitionStatus;
  message: string;
  word: string | null;
  confidence: number | null;
}

export interface ServerHealth {
  service: string;
  version: string;
  modelConfigured: boolean;
  message: string;
}
