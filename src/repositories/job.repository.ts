import { getDb } from '../database/index.js';
import { Job } from '../types/index.js';
import { computeTextHash } from '../utils/helpers.js';

interface JobRow {
  id: string;
  status: string;
  voice: string;
  text_content: string;
  text_hash: string | null;
  progress: number;
  current_chunk: number;
  total_chunks: number;
  error: string | null;
  output_path: string | null;
  created_at: string;
  updated_at: string;
  attempts: number;
  max_attempts: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
}

function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    status: row.status as Job['status'],
    voice: row.voice,
    text: row.text_content,
    progress: row.progress,
    currentChunk: row.current_chunk,
    totalChunks: row.total_chunks,
    error: row.error ?? undefined,
    outputPath: row.output_path ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : undefined,
    startedAt: row.started_at ? new Date(row.started_at) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    lastError: row.last_error ?? undefined,
  };
}

export const jobRepository = {
  findById(id: string): Job | undefined {
    const row = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined;
    return row ? rowToJob(row) : undefined;
  },

  findQueued(limit: number, now: string): Job[] {
    const rows = getDb().prepare(
      `SELECT * FROM jobs WHERE status = 'queued' AND (scheduled_at IS NULL OR scheduled_at <= ?) ORDER BY created_at ASC LIMIT ?`
    ).all(now, limit) as JobRow[];
    return rows.map(rowToJob);
  },

  findProcessing(): Job[] {
    const rows = getDb().prepare(
      `SELECT * FROM jobs WHERE status = 'processing'`
    ).all() as JobRow[];
    return rows.map(rowToJob);
  },

  save(job: Job): void {
    getDb().prepare(`
      INSERT OR REPLACE INTO jobs (id, status, voice, text_content, text_hash, progress, current_chunk, total_chunks, error, output_path, created_at, updated_at, attempts, max_attempts, scheduled_at, started_at, completed_at, last_error)
      VALUES (@id, @status, @voice, @text, @textHash, @progress, @currentChunk, @totalChunks, @error, @outputPath, @createdAt, @updatedAt, @attempts, @maxAttempts, @scheduledAt, @startedAt, @completedAt, @lastError)
    `).run({
      id: job.id,
      status: job.status,
      voice: job.voice,
      text: job.text,
      textHash: computeTextHash(job.text),
      progress: job.progress,
      currentChunk: job.currentChunk,
      totalChunks: job.totalChunks,
      error: job.error ?? null,
      outputPath: job.outputPath ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      scheduledAt: job.scheduledAt?.toISOString() ?? null,
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      lastError: job.lastError ?? null,
    });
  },

  update(id: string, updates: Partial<Job>): void {
    const sets: string[] = [];
    const params: Record<string, unknown> = { id };

    if (updates.status !== undefined) { sets.push('status = @status'); params.status = updates.status; }
    if (updates.progress !== undefined) { sets.push('progress = @progress'); params.progress = updates.progress; }
    if (updates.currentChunk !== undefined) { sets.push('current_chunk = @currentChunk'); params.currentChunk = updates.currentChunk; }
    if (updates.totalChunks !== undefined) { sets.push('total_chunks = @totalChunks'); params.totalChunks = updates.totalChunks; }
    if (updates.error !== undefined) { sets.push('error = @error'); params.error = updates.error ?? null; }
    if (updates.outputPath !== undefined) { sets.push('output_path = @outputPath'); params.outputPath = updates.outputPath ?? null; }
    if (updates.updatedAt !== undefined) { sets.push('updated_at = @updatedAt'); params.updatedAt = updates.updatedAt.toISOString(); }
    if (updates.attempts !== undefined) { sets.push('attempts = @attempts'); params.attempts = updates.attempts; }
    if (updates.maxAttempts !== undefined) { sets.push('max_attempts = @maxAttempts'); params.maxAttempts = updates.maxAttempts; }
    if (updates.scheduledAt !== undefined) { sets.push('scheduled_at = @scheduledAt'); params.scheduledAt = updates.scheduledAt?.toISOString() ?? null; }
    if (updates.startedAt !== undefined) { sets.push('started_at = @startedAt'); params.startedAt = updates.startedAt?.toISOString() ?? null; }
    if (updates.completedAt !== undefined) { sets.push('completed_at = @completedAt'); params.completedAt = updates.completedAt?.toISOString() ?? null; }
    if (updates.lastError !== undefined) { sets.push('last_error = @lastError'); params.lastError = updates.lastError ?? null; }
    sets.push('updated_at = @now'); params.now = new Date().toISOString();

    if (sets.length > 1) {
      getDb().prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = @id`).run(params);
    }
  },

  countByStatus(): Record<string, number> {
    const rows = getDb().prepare(
      `SELECT status, COUNT(*) as count FROM jobs GROUP BY status`
    ).all() as { status: string; count: number }[];
    const result: Record<string, number> = {};
    for (const r of rows) result[r.status] = r.count;
    return result;
  },

  totalAttempts(): number {
    const row = getDb().prepare('SELECT COALESCE(SUM(attempts), 0) as total FROM jobs').get() as { total: number };
    return row.total;
  },

  resetProcessingToQueued(): void {
    getDb().prepare(`
      UPDATE jobs SET status = 'queued', last_error = 'Server restart - job requeued', updated_at = @now, scheduled_at = @now
      WHERE status = 'processing'
    `).run({ now: new Date().toISOString() });
  },

  cleanup(maxAgeMs: number): void {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    getDb().prepare('DELETE FROM jobs WHERE created_at < ?').run(cutoff);
  },
};
