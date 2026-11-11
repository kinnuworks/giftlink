// Creating, listing and taking back gifts. Every gift key comes from the sender's
// root (a wallet signature) plus an index, so nothing needs a server.
import {
  buildTransfer,
  decodeGift,
  deriveSecret,
  encodeGift,
  getBlockNumber,
  getTransactions,
  giftState,
  keyFromSecret,
  occasionByTheme,
  OCCASIONS,
  sendRawTransaction,
  waitForTx,
  type ChainTx,
  type GiftKey,
  type GiftState,
} from './chain';
import { loadNimiq } from './nimiq';
import { call, getWallet, myAddress, unlockRoot } from './wallet';

export interface LocalGift {
  index: number;
  value: number;
  message: string;
  theme: number;
  createdAt: number;
  fundingHash?: string;
}

const listKey = (addr: string) => `giftlink:gifts:${addr.replace(/\s/g, '')}`;

function readLocal(addr: string): LocalGift[] {
  try {
    return JSON.parse(localStorage.getItem(listKey(addr)) || '[]');
  } catch {
    return [];
  }
}

function writeLocal(addr: string, gifts: LocalGift[]) {
  try {
    localStorage.setItem(listKey(addr), JSON.stringify(gifts));
  } catch {
    // storage blocked: the chain is still the source of truth
  }
}

export async function giftKey(root: Uint8Array, index: number): Promise<GiftKey> {
  const N = await loadNimiq();
  return keyFromSecret(N, deriveSecret(N, root, 'g', index));
}

export const giftUrl = (encoded: string) => `${location.origin}/c#${encoded}`;

// Finds every index this wallet has used, from the chain. Stops after 3 unused in a row.
export async function scanIndexes(root: Uint8Array, known: number[] = []): Promise<Map<number, ChainTx[]>> {
  const found = new Map<number, ChainTx[]>();
  let gap = 0;
  const max = Math.max(-1, ...known);
  for (let i = 0; gap < 3 || i <= max; i++) {
    const key = await giftKey(root, i);
    const txs = await getTransactions(key.address, 10).catch(() => [] as ChainTx[]);
    if (txs.length || known.includes(i)) {
      found.set(i, txs);
      gap = 0;
    } else {
      gap++;
    }
    if (i > 500) break;
  }
  return found;
}

export interface CreatedGift {
  link: string;
  encoded: string;
  address: string;
  fundingHash: string;
  value: number;
}

export async function createGift(value: number, theme: number, message: string): Promise<CreatedGift> {
  const w = await getWallet();
  if (!w) throw new Error('Open Giftlink in Nimiq Pay to send a gift.');
  const me = await myAddress();
  const root = await unlockRoot(me);
  const local = readLocal(me);
  let index = local.length ? Math.max(...local.map((g) => g.index)) + 1 : -1;
  if (index < 0) {
    const used = await scanIndexes(root);
    index = used.size ? Math.max(...used.keys()) + 1 : 0;
  }
  const key = await giftKey(root, index);
  const occasion = occasionByTheme(theme);
  const N = await loadNimiq();
  const serialized = await call(() =>
    w.sendBasicTransactionWithData({
      recipient: key.address,
      value,
      data: `Giftlink ${occasion.emoji} ${occasion.label}`,
    }),
  );
  let fundingHash = '';
  try {
    fundingHash = N.Transaction.fromAny(serialized).hash();
  } catch {
    // older hosts may return the hash directly
    fundingHash = /^[0-9a-f]{64}$/i.test(serialized) ? serialized : '';
  }
  const encoded = encodeGift({ secret: key.secret, value, message, theme });
  writeLocal(me, [...local, { index, value, message, theme, createdAt: Date.now(), fundingHash }]);
  return { link: giftUrl(encoded), encoded, address: key.address, fundingHash, value };
}

export interface SentGift {
  index: number;
  address: string;
  value: number;
  message: string;
  theme: number;
  createdAt: number;
  state: GiftState;
  link: string;
}

function themeFromData(txs: ChainTx[]): number {
  for (const t of txs) {
    const hex = t.recipientData || t.senderData || '';
    try {
      const text = new TextDecoder().decode(Uint8Array.from(hex.match(/../g) || [], (h) => parseInt(h, 16)));
      const o = OCCASIONS.find((o) => text.includes(o.label));
      if (o) return o.theme;
    } catch {
      // ignore
    }
  }
  return 1;
}

export async function listSentGifts(): Promise<SentGift[]> {
  const me = await myAddress();
  const root = await unlockRoot(me);
  const local = readLocal(me);
  const found = await scanIndexes(root, local.map((g) => g.index));
  const out: SentGift[] = [];
  for (const [index, txs] of found) {
    const key = await giftKey(root, index);
    const l = local.find((g) => g.index === index);
    const state = await giftState(key.address, me);
    const funding = state.kind !== 'unfunded' ? state.funding : undefined;
    const value = l?.value ?? funding?.value ?? 0;
    const theme = l?.theme ?? themeFromData(txs);
    const message = l?.message ?? '';
    const createdAt = l?.createdAt ?? (funding?.timestamp || Date.now());
    const encoded = value > 0 ? encodeGift({ secret: key.secret, value, message, theme }) : '';
    out.push({ index, address: key.address, value, message, theme, createdAt, state, link: encoded ? giftUrl(encoded) : '' });
  }
  // Recover the local list on a new device.
  if (local.length < out.length) {
    writeLocal(
      me,
      out.map((g) => ({ index: g.index, value: g.value, message: g.message, theme: g.theme, createdAt: g.createdAt })),
    );
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

// Sends the whole balance of a gift (or voucher) address to `to`, signed with the gift key.
export async function sweep(key: GiftKey, to: string, balance: number): Promise<ChainTx> {
  const N = await loadNimiq();
  const height = await getBlockNumber();
  const { hex, hash } = buildTransfer(N, key, to, balance, height);
  await sendRawTransaction(hex);
  return waitForTx(hash);
}

export async function takeBack(gift: SentGift): Promise<ChainTx> {
  if (gift.state.kind !== 'ready') throw new Error('This gift has nothing left to take back.');
  const me = await myAddress();
  const root = await unlockRoot(me);
  const key = await giftKey(root, gift.index);
  return sweep(key, me, gift.state.balance);
}

export function parseGiftFromHash(hash: string) {
  return decodeGift(hash);
}
