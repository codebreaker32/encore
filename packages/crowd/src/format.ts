/** Formatting shared by the engine and the MC. Kept apart so neither module imports the other at runtime. */

/** Seconds as a set clock: "3:12". */
export function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/** The longest word of five or more letters in a line's text: "the landlord line". Null without words. */
export function keyWord(text: string | undefined): string | null {
  if (!text) return null;
  const words = text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 5);
  if (words.length === 0) return null;
  // Ties go to the later word: a punchline ends on the word that matters.
  return words.reduce((best, w) => (w.length >= best.length ? w : best), words[0]);
}

/** "first", "second", ... "twelfth", then "13th", "21st". */
export function ordinal(n: number): string {
  const words = [
    'zeroth',
    'first',
    'second',
    'third',
    'fourth',
    'fifth',
    'sixth',
    'seventh',
    'eighth',
    'ninth',
    'tenth',
    'eleventh',
    'twelfth',
  ];
  if (n >= 0 && n < words.length) return words[n];
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  return `${n}${mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th'}`;
}
