// Shared fuzzy title-matching utilities, used by search.js (and reused by
// requests.js's "available" match in M8). Generic — no service coupling.

function fetchT(url, opts, ms = 6000) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
}

// Lowercase + diacritic-fold + strip a leading "the"/"a"/"an" + concatenate —
// used for substring checks and dedup keys.
function normStr(s) {
  let v = (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const stripped = v.replace(/^(the|an?)\s+/, '');
  v = stripped || v;
  return v.replace(/[^a-z0-9]/g, '');
}

// Standard edit-distance DP — titles/words here are short, so O(n*m) is fine.
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row.push(a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], row[j - 1]));
    }
    prev = row;
  }
  return prev[b.length];
}

// Word-preserving version of normStr() — same normalization rules, kept as
// space-separated tokens for word-by-word fuzzy matching.
function fuzzyNormWords(s) {
  let v = (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  v = v.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  v = v.replace(/^(the|an?)\s+/, '') || v;
  return v.split(' ').filter(Boolean);
}

// One query word vs. one title word → a match grade (higher = better) or 0.
function wordMatchGrade(qWord, tWord) {
  if (qWord === tWord) return 3;
  if (/^\d+$/.test(qWord)) return 0; // no fuzzing sequel numbers ("Toy Story 2" vs "3")
  if (tWord.includes(qWord)) return 2;
  if (qWord.length <= 3) return 0;
  const threshold = qWord.length <= 5 ? 1 : 2;
  return levenshtein(qWord, tWord) <= threshold ? 1 : 0;
}

// Every query word must match some title word, via exact → substring → fuzzy
// edit-distance. Returns a score so callers can rank results.
function fuzzyTitleMatch(title, query) {
  const qWords = fuzzyNormWords(query);
  if (!qWords.length) return { match: true, score: 0 };
  const tWords = fuzzyNormWords(title);
  if (!tWords.length) return { match: false, score: -Infinity };

  let score = 0;
  for (const qWord of qWords) {
    let best = 0;
    for (const tWord of tWords) best = Math.max(best, wordMatchGrade(qWord, tWord));
    if (best === 0) return { match: false, score: -Infinity };
    score += best;
  }
  const isExactFullTitle = qWords.join(' ') === tWords.join(' ');
  return { match: true, score: isExactFullTitle ? score + 1000 : score };
}
