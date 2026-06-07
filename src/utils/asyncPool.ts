export const TTS_CONCURRENCY = Math.min(
  5,
  Math.max(1, Number(process.env.TTS_CONCURRENCY || 3))
);

export async function asyncPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const errors: { index: number; error: any }[] = [];
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      try {
        results[i] = await worker(items[i], i);
      } catch (err) {
        errors.push({ index: i, error: err });
      }
    }
  }

  if (items.length === 0) return [];

  const workers = Array(Math.min(limit, items.length))
    .fill(null)
    .map(() => runWorker());

  await Promise.all(workers);

  if (errors.length > 0) {
    const messages = errors.map(
      (e) => `[${e.index}] ${(e.error as Error)?.message || String(e.error)}`
    );
    throw new Error(
      `asyncPool: ${errors.length} worker(s) failed:\n${messages.join('\n')}`
    );
  }

  return results;
}
