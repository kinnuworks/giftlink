// Picks a staking pool for "claim and stake": a listed pool that pays its stakers,
// with the best reliability score. Data from Nimiq's public validators API.
export interface Validator {
  name: string;
  address: string;
  fee: number;
  payoutType: string;
  score: number;
}

const API = 'https://validators-api-mainnet.pages.dev/api/v1/validators';
let cache: Promise<Validator[]> | null = null;

export function listValidators(): Promise<Validator[]> {
  if (!cache) {
    cache = fetch(API)
      .then((r) => {
        if (!r.ok) throw new Error('Validator list unavailable');
        return r.json();
      })
      .then((list: Array<Record<string, any>>) =>
        list
          .filter((v) => v.isListed && v.payoutType && v.payoutType !== 'none' && v.address)
          .map((v) => ({
            name: String(v.name),
            address: String(v.address),
            fee: Number(v.fee) || 0,
            payoutType: String(v.payoutType),
            score: Number(v.score?.total) || 0,
          }))
          .sort((a, b) => b.score - a.score || a.fee - b.fee),
      )
      .catch((e) => {
        cache = null;
        throw e;
      });
  }
  return cache;
}

export async function pickValidator(): Promise<Validator | null> {
  const list = await listValidators();
  return list[0] ?? null;
}
