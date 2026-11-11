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
  lockGift,
  encodeChipIn,
  memoText,
  sameAddr,
  GROUP_MEMO,
  fitMemo,
  sweepKey,
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
  group?: boolean;
  title?: string;
  word?: string; // secret word, kept only on this device
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
export const chipUrl = (encoded: string) => `${location.origin}/j#${encoded}`;

async function linkFor(secret: Uint8Array, value: number, message: string, theme: number, word?: string) {
  const g = { secret, value, message, theme };
  return giftUrl(word ? await lockGift(g, word) : encodeGift(g));
}

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
  chipLink?: string;
  locked: boolean;
}

export interface GiftOptions {
  group?: boolean;
  title?: string;
  word?: string;
}

export async function createGift(value: number, theme: number, message: string, opts: GiftOptions = {}): Promise<CreatedGift> {
  const w = await getWallet();
  if (!w) throw new Error('Open Giftlink in Nimiq Pay to send a gift.');
  const me = await myAddress();
  const root = await unlockRoot(me);
  const local = readLocal(me);
  // Never reuse an index: take the highest of this device's list and the chain.
  const localNext = local.length ? Math.max(...local.map((g) => g.index)) + 1 : 0;
  const used = await scanIndexes(root, local.map((g) => g.index));
  const chainNext = used.size ? Math.max(...used.keys()) + 1 : 0;
  const index = Math.max(localNext, chainNext);
  const key = await giftKey(root, index);
  const occasion = occasionByTheme(theme);
  const N = await loadNimiq();
  const serialized = await call(() =>
    w.sendBasicTransactionWithData({
      recipient: key.address,
      value,
      data: fitMemo(`${opts.group ? GROUP_MEMO : 'Giftlink'} ${occasion.emoji} ${occasion.label}`),
    }),
  );
  const fundingHash = txHashOf(N, serialized);
  const word = opts.word?.trim() || undefined;
  const link = await linkFor(key.secret, value, message, theme, word);
  const encoded = link.split('#')[1];
  const title = opts.title?.trim() || '';
  writeLocal(me, [...local, { index, value, message, theme, createdAt: Date.now(), fundingHash, group: !!opts.group, title, word }]);
  const chipLink = opts.group ? chipUrl(encodeChipIn({ address: key.address, theme, title })) : undefined;
  return { link, encoded, address: key.address, fundingHash, value, chipLink, locked: !!word };
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
  group: boolean;
  title: string;
  contributors: number;
  chipLink?: string;
  locked: boolean;
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
    const group = l?.group ?? txs.some((t) => memoText(t.recipientData || t.senderData).startsWith(GROUP_MEMO));
    const title = l?.title ?? '';
    const incoming = txs.filter((t) => sameAddr(t.to, key.address));
    const contributors = new Set(incoming.map((t) => t.from.replace(/\s/g, ''))).size;
    const balance = state.kind === 'ready' ? state.balance : value;
    const link = balance > 0 ? await linkFor(key.secret, balance, message, theme, l?.word) : '';
    const chipLink = group ? chipUrl(encodeChipIn({ address: key.address, theme, title })) : undefined;
    out.push({ index, address: key.address, value: Math.max(value, balance), message, theme, createdAt, state, link, group, title, contributors, chipLink, locked: !!l?.word });
  }
  // Recover the local list on a new device.
  if (local.length < out.length) {
    writeLocal(
      me,
      out.map((g) => ({ ...local.find((l) => l.index === g.index), index: g.index, value: g.value, message: g.message, theme: g.theme, createdAt: g.createdAt, group: g.group, title: g.title })),
    );
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

// Sends the whole balance of a gift (or voucher) address to `to`, signed with the gift key.
export async function sweep(key: GiftKey, to: string, _balance?: number): Promise<ChainTx> {
  return sweepKey(await loadNimiq(), key, to);
}

// The host returns a transaction hash; older hosts may return the serialized transaction.
export function txHashOf(N: Awaited<ReturnType<typeof loadNimiq>>, result: string): string {
  const clean = String(result || '').replace(/^0x/i, '');
  if (/^[0-9a-f]{64}$/i.test(clean)) return clean.toLowerCase();
  try {
    return N.Transaction.fromAny(clean).hash();
  } catch {
    return '';
  }
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
