/**
 * Approximates `git diff --numstat` without computing an alignment: a line
 * counts as added for each extra occurrence in the new version and removed
 * for each missing occurrence. Matches numstat for the vast majority of edits
 * and runs in linear time.
 */
export function countLineChanges(before: string | null, after: string | null) {
  const counts = new Map<string, number>();
  if (before) for (const line of splitLines(before)) counts.set(line, (counts.get(line) ?? 0) + 1);
  let added = 0;
  if (after) {
    for (const line of splitLines(after)) {
      const n = counts.get(line) ?? 0;
      if (n > 0) counts.set(line, n - 1);
      else added++;
    }
  }
  let removed = 0;
  for (const n of counts.values()) removed += n;
  return { added, removed };
}

function splitLines(text: string) {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function isBinary(data: Uint8Array) {
  const n = Math.min(data.length, 8000);
  for (let i = 0; i < n; i++) if (data[i] === 0) return true;
  return false;
}
