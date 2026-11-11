// Shows NIM amounts in the user's own money, using the currency Nimiq Pay reports
// (USD, EUR, CRC or GMD) and CoinGecko's public NIM price. Falls back to USD.
import { getHostFiat } from '@nimiq/mini-app-sdk';
import { LUNA } from './chain';

const SUPPORTED = ['usd', 'eur', 'crc'] as const;
let pricePromise: Promise<Record<string, number>> | null = null;

function currency(): string {
  let c = 'usd';
  try {
    c = String(getHostFiat() ?? 'USD').toLowerCase();
  } catch {
    // outside Nimiq Pay
  }
  return (SUPPORTED as readonly string[]).includes(c) ? c : 'usd';
}

export function loadPrices(): Promise<Record<string, number>> {
  if (!pricePromise) {
    pricePromise = fetch(`https://api.coingecko.com/api/v3/simple/price?ids=nimiq-2&vs_currencies=${SUPPORTED.join(',')}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('price unavailable'))))
      .then((j) => j['nimiq-2'] as Record<string, number>)
      .catch(() => {
        pricePromise = null;
        return {};
      });
  }
  return pricePromise;
}

// "≈ $0.006" style text, or '' when no price is available.
export async function fiatText(luna: number): Promise<string> {
  const prices = await loadPrices();
  const c = currency();
  const p = prices[c];
  if (!p || !luna) return '';
  const v = (luna / LUNA) * p;
  const digits = v >= 1 ? 2 : Math.min(6, Math.max(2, 1 - Math.floor(Math.log10(v)) + 1));
  try {
    return '≈ ' + new Intl.NumberFormat('en-US', { style: 'currency', currency: c.toUpperCase(), maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(v);
  } catch {
    return `≈ ${v.toFixed(digits)} ${c.toUpperCase()}`;
  }
}
