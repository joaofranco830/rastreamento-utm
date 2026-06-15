/**
 * Rate limiting leve em memória (best-effort), por instância serverless.
 * Suficiente para conter picos/floods de uma origem no volume single-user
 * (sem Redis — seria over-engineering aqui). Janela deslizante simples.
 */
const hits = new Map<string, number[]>();

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const since = now - windowMs;
  const arr = (hits.get(key) ?? []).filter((t) => t > since);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  // poda preguiçosa para não crescer sem limite
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      const keep = v.filter((t) => t > since);
      if (keep.length === 0) hits.delete(k);
      else hits.set(k, keep);
    }
  }
  return true;
}
