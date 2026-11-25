// Typed-answer matching with small-typo tolerance.
// A typo is accepted only if the guess is closer to the right answer than to any other name in the game,
// so "Niger" never counts for "Nigeria" and "Iran" never counts for "Iraq".

export function normalize(s) {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bsaint\b/g, "st").replace(/\bst\.?(?=\s)/g, "st")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Optional words a player may leave off ("Lake", "River", "the", ...).
const FILLER = /\b(the|lake|lago|lac|river|rio|sea|ocean|gulf|of|bay|city|republic|islands?|federated states|state|national park|np|metro area|metro|mount|mt|peak)\b/g;
export const loose = (s) => normalize(s).replace(FILLER, " ").replace(/\s+/g, " ").trim();

// Damerau–Levenshtein (optimal string alignment): swapped letters count as one typo.
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

export function tolerance(len) {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  return 3;
}

// entities: [{ key, names: [..] }]; correctKeys: Set of keys that count as right.
// Returns { result: "correct" | "wrong" | "empty", typo: bool, matchedKey }
export function judge(input, entities, correctKeys) {
  const g = normalize(input);
  if (!g) return { result: "empty" };
  const gl = loose(input);
  // 1. exact (full or loose) matches
  const exact = [];
  for (const e of entities) {
    for (const n of e.names) {
      if (normalize(n) === g) { exact.push({ e, full: true }); break; }
      const ln = loose(n);
      if (ln && ln === gl) { exact.push({ e, full: false }); break; }
    }
  }
  const exactFull = exact.filter((x) => x.full);
  if (exactFull.some((x) => correctKeys.has(x.e.key))) return { result: "correct", typo: false };
  if (exactFull.length) return { result: "wrong", matchedKey: exactFull[0].e.key };
  if (exact.some((x) => correctKeys.has(x.e.key))) return { result: "correct", typo: false };
  if (exact.length) return { result: "wrong", matchedKey: exact[0].e.key };
  // 2. typo tolerance: nearest name overall must be a correct one, and within tolerance
  let best = { d: Infinity, key: null, tol: 0 };
  let bestWrong = Infinity;
  for (const e of entities) {
    for (const n of e.names) {
      for (const [cand, guess] of [[normalize(n), g], [loose(n), gl]]) {
        if (!cand || !guess) continue;
        const d = levenshtein(guess, cand);
        if (correctKeys.has(e.key)) {
          if (d < best.d) best = { d, key: e.key, tol: tolerance(cand.length) };
        } else if (d < bestWrong) bestWrong = d;
      }
    }
  }
  if (best.key !== null && best.d <= best.tol && best.d < bestWrong) return { result: "correct", typo: true };
  return { result: "wrong" };
}
