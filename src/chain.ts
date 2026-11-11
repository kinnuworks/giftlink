// Chain helpers: cashlink encoding, gift keys, transactions and RPC reads.
// The Nimiq module is passed in so the same code runs in the browser (web build)
// and in tests (node build).
import type * as NimiqTypes from '@nimiq/core';

export type Nimiq = typeof NimiqTypes;

export const LUNA = 100_000; // 1 NIM = 100,000 luna

// Mainnet by default. Nimiq Pay's hidden testnet mode switches the app to testnet.
const NETWORKS = {
  main: { id: 24, rpc: 'https://rpc.nimiqwatch.com', explorer: 'https://nimiq.watch/#' },
  test: { id: 5, rpc: 'https://rpc.testnet.nimiqwatch.com', explorer: 'https://test.nimiq.watch/#' },
} as const;
export let NETWORK_ID: number = NETWORKS.main.id;
export let RPC_URL: string = NETWORKS.main.rpc;
let EXPLORER: string = NETWORKS.main.explorer;
export let IS_TESTNET = false;
export function setNetwork(net: 'main' | 'test') {
  NETWORK_ID = NETWORKS[net].id;
  RPC_URL = NETWORKS[net].rpc;
  EXPLORER = NETWORKS[net].explorer;
  IS_TESTNET = net === 'test';
}
export const HUB_CASHLINK_URL = 'https://hub.nimiq.com/cashlink/';
export const MIN_NEW_STAKE_LUNA = 100 * LUNA;

// Occasions map to the Nimiq Hub cashlink theme byte, so links stay compatible.
export const OCCASIONS = [
  { id: 'birthday', label: 'Birthday', theme: 6, emoji: '🎂' },
  { id: 'thanks', label: 'Thank you', theme: 5, emoji: '🙏' },
  { id: 'holiday', label: 'Holidays', theme: 2, emoji: '🎄' },
  { id: 'newyear', label: 'New Year', theme: 3, emoji: '🧧' },
  { id: 'gift', label: 'Just because', theme: 1, emoji: '🎁' },
] as const;
export type Occasion = (typeof OCCASIONS)[number];
export const occasionByTheme = (theme: number): Occasion =>
  OCCASIONS.find((o) => o.theme === theme) ?? OCCASIONS[OCCASIONS.length - 1];

// ---------- bytes ----------

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '');
  if (clean.length % 2) throw new Error('Odd hex length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64Url(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// ---------- cashlink payload (same format as hub.nimiq.com/cashlink) ----------

export interface GiftPayload {
  secret: Uint8Array; // 32-byte private key
  value: number; // luna
  message: string;
  theme: number;
}

export function encodeGift(g: GiftPayload): string {
  if (g.secret.length !== 32) throw new Error('Invalid gift key');
  if (!Number.isSafeInteger(g.value) || g.value <= 0) throw new Error('Invalid gift amount');
  const msg = new TextEncoder().encode(g.message ?? '');
  if (msg.length > 255) throw new Error('Message is too long');
  const hasTheme = !!g.theme;
  const hasMsg = msg.length > 0 || hasTheme;
  const buf = new Uint8Array(32 + 8 + (hasMsg ? 1 + msg.length : 0) + (hasTheme ? 1 : 0));
  buf.set(g.secret, 0);
  new DataView(buf.buffer).setBigUint64(32, BigInt(g.value));
  let pos = 40;
  if (hasMsg) {
    buf[pos++] = msg.length;
    buf.set(msg, pos);
    pos += msg.length;
  }
  if (hasTheme) buf[pos++] = g.theme;
  // Same tweaks as the Hub: "=" padding, and a "~" every 256 chars for chat apps.
  let out = toBase64Url(buf);
  out = out.replace(/[A-Za-z0-9_]{257,}/g, (m) => m.replace(/.{256}/g, '$&~'));
  return out;
}

export function decodeGift(str: string): GiftPayload {
  const clean = decodeURIComponent(str).replace(/^#/, '').replace(/~/g, '').replace(/[.=]+$/, '');
  const buf = fromBase64Url(clean);
  if (buf.length < 40) throw new Error('This gift link is incomplete. Ask the sender to copy it again.');
  const secret = buf.slice(0, 32);
  const value = Number(new DataView(buf.buffer, buf.byteOffset).getBigUint64(32));
  let pos = 40;
  let message = '';
  let theme = 0;
  if (pos < buf.length) {
    const len = buf[pos++];
    message = new TextDecoder().decode(buf.slice(pos, pos + len));
    pos += len;
  }
  if (pos < buf.length) theme = buf[pos++];
  if (pos < buf.length && buf[pos] !== 0) throw new Error('This gift is not in NIM.');
  return { secret, value, message, theme };
}

export const hubLink = (encoded: string) => `${HUB_CASHLINK_URL}#${encoded}`;

// ---------- keys ----------

export interface GiftKey {
  keyPair: NimiqTypes.KeyPair;
  address: string; // user-friendly
  secret: Uint8Array;
}

export function keyFromSecret(N: Nimiq, secret: Uint8Array): GiftKey {
  const keyPair = N.KeyPair.derive(new N.PrivateKey(secret));
  return { keyPair, secret, address: keyPair.toAddress().toUserFriendlyAddress() };
}

export function randomSecret(): Uint8Array {
  const s = new Uint8Array(32);
  crypto.getRandomValues(s);
  return s;
}

// Gift keys are derived from a signature by the sender's wallet, so the list of
// sent gifts can be rebuilt on any device. kind = 'g' for single gifts, 'b' for
// voucher batches, 'v' for vouchers inside a batch.
export function deriveSecret(N: Nimiq, root: Uint8Array, kind: string, ...path: number[]): Uint8Array {
  const label = new TextEncoder().encode(`giftlink/${kind}/${path.join('/')}`);
  const data = new Uint8Array(root.length + label.length);
  data.set(root, 0);
  data.set(label, root.length);
  return N.Hash.computeSha256(data);
}

export const ROOT_MESSAGE =
  'Giftlink: unlock my gift keys.\n\nThis lets Giftlink rebuild the list of gifts you sent, on any device. It does not move any money.';

export function rootFromSignature(N: Nimiq, signatureHex: string, publicKeyHex: string): Uint8Array {
  const sig = fromHex(signatureHex);
  const pub = fromHex(publicKeyHex);
  const data = new Uint8Array(sig.length + pub.length);
  data.set(pub, 0);
  data.set(sig, pub.length);
  return N.Hash.computeSha256(data);
}

// ---------- transactions ----------

export function buildTransfer(
  N: Nimiq,
  from: GiftKey,
  recipient: string,
  value: number,
  validityStartHeight: number,
  data?: string,
  fee = 0,
): { hex: string; hash: string; size: number } {
  const sender = from.keyPair.toAddress();
  const to = N.Address.fromUserFriendlyAddress(recipient);
  const tx = data
    ? N.TransactionBuilder.newBasicWithData(sender, to, new TextEncoder().encode(data), BigInt(value), BigInt(fee), validityStartHeight, NETWORK_ID)
    : N.TransactionBuilder.newBasic(sender, to, BigInt(value), BigInt(fee), validityStartHeight, NETWORK_ID);
  tx.sign(from.keyPair, undefined);
  return { hex: tx.toHex(), hash: tx.hash(), size: tx.serializedSize };
}

// Adds the gift's NIM straight to an existing staker (the recipient), no wallet popup needed.
export function buildAddStake(N: Nimiq, from: GiftKey, stakerAddress: string, value: number, validityStartHeight: number, fee = 0) {
  const tx = N.TransactionBuilder.newAddStake(
    from.keyPair.toAddress(),
    N.Address.fromUserFriendlyAddress(stakerAddress),
    BigInt(value),
    BigInt(fee),
    validityStartHeight,
    NETWORK_ID,
  );
  tx.sign(from.keyPair, undefined);
  return { hex: tx.toHex(), hash: tx.hash(), size: tx.serializedSize };
}

// Trims memo text so it fits the 64-byte transaction data limit.
export function fitMemo(text: string, maxBytes = 64): string {
  const enc = new TextEncoder();
  let out = text;
  while (enc.encode(out).length > maxBytes) out = Array.from(out).slice(0, -1).join('');
  return out;
}

// ---------- RPC ----------

export class RpcError extends Error {}

let rpcId = 1;
export async function rpc<T>(method: string, params: unknown[] = [], url?: string): Promise<T> {
  url = url ?? RPC_URL;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }),
      });
      if (!res.ok) throw new RpcError(`The Nimiq node answered ${res.status}`);
      const json = await res.json();
      if (json.error) throw new RpcError(json.error.data || json.error.message || 'Nimiq node error');
      return json.result?.data as T;
    } catch (e) {
      lastErr = e;
      if (e instanceof RpcError) throw e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw new RpcError(`Can't reach the Nimiq network right now. ${lastErr instanceof Error ? lastErr.message : ''}`.trim());
}

export interface Account {
  address: string;
  balance: number;
  type: 'basic' | 'vesting' | 'htlc' | 'staking' | string;
}

export interface ChainTx {
  hash: string;
  blockNumber: number;
  timestamp: number;
  confirmations: number;
  from: string;
  to: string;
  value: number;
  fee: number;
  recipientData: string;
  senderData?: string;
  executionResult?: boolean;
}

export const getBlockNumber = () => rpc<number>('getBlockNumber');
export const getAccount = (address: string) => rpc<Account>('getAccountByAddress', [address]);
export const getTransactions = (address: string, max = 50) =>
  rpc<ChainTx[]>('getTransactionsByAddress', [address, max, null]);
export const getTransaction = (hash: string) => rpc<ChainTx>('getTransactionByHash', [hash]);
export const sendRawTransaction = (hex: string) => rpc<string>('sendRawTransaction', [hex]);
export const getStaker = (address: string) =>
  rpc<{ address: string; balance: number; delegation?: string; inactiveBalance?: number } | null>('getStakerByAddress', [address]).catch(
    () => null,
  );

// Waits for a transaction. If the node can't look it up by hash, an emptied sender
// account also counts as confirmed (claims and take-backs move the whole balance).
export async function waitForTx(hash: string, timeoutMs = 60_000, sender?: string): Promise<ChainTx> {
  const start = Date.now();
  let emptySeen = 0;
  while (Date.now() - start < timeoutMs) {
    try {
      const tx = await getTransaction(hash);
      if (tx && tx.blockNumber) return tx;
    } catch {
      // not found yet
    }
    if (sender) {
      const acc = await getAccount(sender).catch(() => null);
      if (acc && acc.balance === 0 && ++emptySeen >= 3) {
        return { hash, blockNumber: 0, timestamp: Date.now(), confirmations: 1, from: sender, to: '', value: 0, fee: 0, recipientData: '' };
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new RpcError('The network has not confirmed this yet. It may still go through; check again in a minute.');
}

// Moves a key's whole balance: a plain transfer, or add-stake to an existing staker.
// Tries with no fee first and retries with a small fee if the network asks for one.
export async function sweepKey(N: Nimiq, key: GiftKey, to: string, mode: 'transfer' | 'stake' = 'transfer'): Promise<ChainTx> {
  const balance = (await getAccount(key.address)).balance;
  if (balance <= 0) throw new RpcError('This gift is empty. It may have just been claimed.');
  const height = await getBlockNumber();
  const build = (fee: number) =>
    mode === 'stake' ? buildAddStake(N, key, to, balance - fee, height, fee) : buildTransfer(N, key, to, balance - fee, height, undefined, fee);
  let tx = build(0);
  try {
    await sendRawTransaction(tx.hex);
  } catch (e) {
    if (!/fee|priority|low|mempool/i.test((e as Error).message)) throw e;
    tx = build(Math.max(tx.size, 200));
    await sendRawTransaction(tx.hex);
  }
  return waitForTx(tx.hash, 60_000, key.address);
}

// ---------- gift status ----------

export type GiftState =
  | { kind: 'unfunded' }
  | { kind: 'ready'; balance: number; funding?: ChainTx; givers: number }
  | { kind: 'claimed'; funding?: ChainTx; claim: ChainTx; claimedBy: string; takenBack: boolean; givers: number };

// Reads a gift address and works out what happened to it.
export async function giftState(address: string, senderHint?: string): Promise<GiftState> {
  const [account, txs] = await Promise.all([getAccount(address), getTransactions(address).catch(() => [] as ChainTx[])]);
  const incoming = txs.filter((t) => sameAddr(t.to, address)).sort((a, b) => a.blockNumber - b.blockNumber);
  const outgoing = txs.filter((t) => sameAddr(t.from, address)).sort((a, b) => b.blockNumber - a.blockNumber);
  const funding = incoming[0];
  const givers = new Set(incoming.map((t) => t.from.replace(/\s/g, ''))).size;
  if (account.balance > 0) return { kind: 'ready', balance: account.balance, funding, givers };
  if (outgoing.length) {
    const claim = outgoing[0];
    const back = senderHint ? sameAddr(claim.to, senderHint) : !!funding && sameAddr(claim.to, funding.from);
    return { kind: 'claimed', funding, claim, claimedBy: claim.to, takenBack: back, givers };
  }
  return { kind: 'unfunded' };
}

export const sameAddr = (a?: string, b?: string) =>
  !!a && !!b && a.replace(/\s/g, '').toUpperCase() === b.replace(/\s/g, '').toUpperCase();

// ---------- formatting ----------

export function formatNim(luna: number): string {
  const nim = luna / LUNA;
  return nim.toLocaleString('en-US', { maximumFractionDigits: nim < 10 ? 5 : 2 });
}

export const shortAddr = (a: string) => {
  const parts = a.trim().split(/\s+/);
  return parts.length === 9 ? `${parts[0]} ${parts[1]} … ${parts[8]}` : a;
};

export const txUrl = (hash: string) => `${EXPLORER}${hash}`;
export const addrUrl = (address: string) => `${EXPLORER}${address.replace(/\s/g, '+')}`;

// ---------- optional secret word lock ----------
// A locked link carries the gift key XOR-ed with a key stretched from a secret word
// (PBKDF2-SHA256). Without the word the link alone can't claim the gift.
export const LOCK_PREFIX = 'L.';
const LOCK_ITERATIONS = 600_000;

// Two or more words, or a long single word: short words are easy to guess offline.
export function wordStrongEnough(word: string): boolean {
  const w = word.trim();
  return w.split(/\s+/).filter(Boolean).length >= 2 ? w.length >= 8 : w.length >= 12;
}

async function wordKey(word: string, salt: Uint8Array): Promise<Uint8Array> {
  const norm = word.trim().toLowerCase().normalize('NFKC');
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(norm), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: LOCK_ITERATIONS }, base, 256);
  return new Uint8Array(bits);
}

function lockSalt(value: number): Uint8Array {
  const salt = new Uint8Array(24);
  salt.set(new TextEncoder().encode('giftlink-lock-v1'), 0);
  new DataView(salt.buffer).setBigUint64(16, BigInt(value));
  return salt;
}

export async function lockGift(g: GiftPayload, word: string): Promise<string> {
  if (!wordStrongEnough(word)) throw new Error('Use at least two words, like "blue pancake".');
  const k = await wordKey(word, lockSalt(g.value));
  const secret = g.secret.map((b, i) => b ^ k[i]);
  return LOCK_PREFIX + encodeGift({ ...g, secret });
}

export function isLocked(encoded: string): boolean {
  return decodeURIComponent(encoded).replace(/^#/, '').startsWith(LOCK_PREFIX);
}

export async function unlockGift(encoded: string, word: string): Promise<GiftPayload> {
  const g = decodeGift(decodeURIComponent(encoded).replace(/^#/, '').slice(LOCK_PREFIX.length));
  const k = await wordKey(word, lockSalt(g.value));
  return { ...g, secret: g.secret.map((b, i) => b ^ k[i]) };
}

export function decodeLockedPreview(encoded: string): GiftPayload {
  return decodeGift(decodeURIComponent(encoded).replace(/^#/, '').slice(LOCK_PREFIX.length));
}

// ---------- group gift (chip-in) links ----------
// A chip-in link carries only the gift address, occasion and a title: no key.
export interface ChipIn {
  address: string;
  theme: number;
  title: string;
}

export function encodeChipIn(c: ChipIn): string {
  const json = JSON.stringify({ a: c.address.replace(/\s/g, ''), t: c.theme, n: c.title });
  return toBase64Url(new TextEncoder().encode(json)).replace(/=+$/, '');
}

export function decodeChipIn(str: string): ChipIn {
  try {
    const o = JSON.parse(new TextDecoder().decode(fromBase64Url(decodeURIComponent(str).replace(/^#/, ''))));
    const raw = String(o.a).toUpperCase();
    const address = raw.match(/.{1,4}/g)!.join(' ');
    if (!/^NQ\d\d( [0-9A-Z]{4}){8}$/.test(address)) throw new Error();
    return { address, theme: Number(o.t) || 1, title: String(o.n ?? '').slice(0, 80) };
  } catch {
    throw new Error('This chip-in link is broken. Ask the organiser to copy it again.');
  }
}

export const CHIP_MEMO = 'Giftlink chip-in';
export const GROUP_MEMO = 'Giftlink group';

export function memoText(hex?: string): string {
  if (!hex) return '';
  try {
    return new TextDecoder().decode(Uint8Array.from(hex.match(/../g) || [], (h) => parseInt(h, 16)));
  } catch {
    return '';
  }
}
