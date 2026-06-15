export interface Job {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  voice: string;
  text: string;
  progress: number;
  currentChunk: number;
  totalChunks: number;
  error?: string;
  outputPath?: string;
  createdAt: Date;
  updatedAt: Date;
  attempts: number;
  maxAttempts: number;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  lastError?: string;
}
