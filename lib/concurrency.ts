/**
 * Maps over `items` with at most `limit` calls in flight at once, preserving
 * input order in the result.
 *
 * A plain `Promise.all` over every distinct club meant a single cold request
 * fired one upstream call per club simultaneously — enough to trip the provider's
 * per-minute rate limit and return an empty schedule to whoever asked.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    worker,
  );
  await Promise.all(workers);

  return results;
}
