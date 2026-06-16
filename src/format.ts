// Compact number formatting for an incremental game (1.23K, 4.56M, ...).

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export function formatNumber(n: number): string {
  if (!isFinite(n)) return '∞';
  if (n < 1000) {
    // Show a couple of decimals for small fractional amounts, else whole.
    return n < 10 && n % 1 !== 0 ? n.toFixed(1) : Math.floor(n).toString();
  }
  const tier = Math.min(Math.floor(Math.log10(n) / 3), SUFFIXES.length - 1);
  const scaled = n / Math.pow(1000, tier);
  return `${scaled.toFixed(2)}${SUFFIXES[tier]}`;
}
