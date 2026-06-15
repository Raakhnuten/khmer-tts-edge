import { getDb } from '../database/index.js';
import { SubtitleJobData } from '../subtitle.js';

interface SubtitleProjectRow {
  id: string;
  data: string;
  created_at: string;
}

export const subtitleRepository = {
  findById(id: string): SubtitleJobData | undefined {
    const row = getDb().prepare('SELECT * FROM subtitle_projects WHERE id = ?').get(id) as SubtitleProjectRow | undefined;
    if (!row) return undefined;
    const parsed: SubtitleJobData = JSON.parse(row.data);
    if (!parsed.version) parsed.version = 1;
    return parsed;
  },

  save(data: SubtitleJobData): void {
    getDb().prepare(`
      INSERT INTO subtitle_projects (id, data, created_at)
      VALUES (@id, @data, @createdAt)
      ON CONFLICT(id) DO UPDATE SET data = @data
    `).run({
      id: data.id,
      data: JSON.stringify(data),
      createdAt: data.createdAt,
    });
  },

  findOldIds(maxAgeMs: number): string[] {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const rows = getDb().prepare('SELECT id FROM subtitle_projects WHERE created_at < ?').all(cutoff) as { id: string }[];
    return rows.map(r => r.id);
  },

  cleanup(maxAgeMs: number): void {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    getDb().prepare('DELETE FROM subtitle_projects WHERE created_at < ?').run(cutoff);
  },
};
