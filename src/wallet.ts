// Bridge to the Nimiq Pay wallet (mini app SDK). Outside Nimiq Pay there is no wallet,
// and the app falls back to read-only views and web-wallet links.
import { init, NimiqProviderError, type NimiqProvider } from '@nimiq/mini-app-sdk';
import { getAccount, getStaker, ROOT_MESSAGE, rootFromSignature, toHex, fromHex } from './chain';
import { loadNimiq } from './nimiq';

let walletPromise: Promise<NimiqProvider | null> | null = null;

export function getWallet(): Promise<NimiqProvider | null> {
  if (!walletPromise) {
    walletPromise = init({ timeout: 3000 }).catch(() => {
      // Let a later call try again (the host may just have been slow).
      setTimeout(() => (walletPromise = null), 0);
      return null;
    });
  }
  return walletPromise;
}

export class Cancelled extends Error {
  constructor() {
    super('Cancelled in the wallet.');
  }
}

// Turns wallet errors into plain sentences. A cancel is not an error.
export function walletError(e: unknown): Error {
  const err = NimiqProviderError.from(e);
  if (err) {
    if (/PERMISSION_DENIED|CANCEL|REJECT/i.test(err.type) || /cancel|denied|reject/i.test(err.message)) return new Cancelled();
    if (/INSUFFICIENT|BALANCE/i.test(err.type) || /insufficient|balance/i.test(err.message))
      return new Error("There isn't enough NIM in your wallet for this.");
    return new Error(err.message || 'The wallet could not do this.');
  }
  if (e && typeof e === 'object' && 'error' in e) {
    const inner = (e as { error: { message?: string; type?: string } }).error;
    if (/denied|cancel|reject/i.test(`${inner.type} ${inner.message}`)) return new Cancelled();
    return new Error(inner.message || 'The wallet could not do this.');
  }
  return e instanceof Error ? e : new Error(String(e));
}

export async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    const res = (await fn()) as unknown;
    if (res && typeof res === 'object' && 'error' in (res as object)) throw res;
    return res as T;
  } catch (e) {
    throw walletError(e);
  }
}

// Nimiq Pay can list a key address and an HTLC address. Payments in and out of the
// app must use the basic (key) account, because a contract can't receive a plain transfer.
let addressCache: string | null = null;
export async function myAddress(): Promise<string> {
  if (addressCache) return addressCache;
  const w = await getWallet();
  if (!w) throw new Error('Open Giftlink in Nimiq Pay to use your wallet.');
  const accounts = await call(() => w.listAccounts());
  if (!accounts.length) throw new Error('Nimiq Pay did not share an address.');
  // Read every account; RPC errors are real errors, not "probably basic".
  const infos = await Promise.all(accounts.map((a) => getAccount(a)));
  const basic = infos.filter((i) => !i.type || i.type === 'basic');
  if (!basic.length) throw new Error('Nimiq Pay did not share a regular account address.');
  // Prefer a basic account that is in use; an unused HTLC slot also reads as an empty basic account.
  const pick = basic.find((i) => i.balance > 0) ?? basic[0];
  addressCache = accounts[infos.indexOf(pick)];
  w.on?.('accountsChanged', () => (addressCache = null));
  return addressCache;
}

export async function isStaker(address: string): Promise<boolean> {
  const s = await getStaker(address);
  return !!s;
}

// ---------- gift key root ----------

const rootKey = (address: string) => `giftlink:root:${address.replace(/\s/g, '')}`;

export function cachedRoot(address: string): Uint8Array | null {
  try {
    const v = localStorage.getItem(rootKey(address));
    return v ? fromHex(v) : null;
  } catch {
    return null;
  }
}

// Asks the wallet to sign a fixed message once. The signature seeds every gift key,
// so the sender can see and take back their gifts on any device.
const rootPromises = new Map<string, Promise<Uint8Array>>();

export function unlockRoot(address: string): Promise<Uint8Array> {
  const cached = cachedRoot(address);
  if (cached) return Promise.resolve(cached);
  // One signature prompt even if several screens ask at once.
  let p = rootPromises.get(address);
  if (!p) {
    p = signRoot(address).finally(() => rootPromises.delete(address));
    rootPromises.set(address, p);
  }
  return p;
}

async function signRoot(address: string): Promise<Uint8Array> {
  const asked = address;
  const w = await getWallet();
  if (!w) throw new Error('Open Giftlink in Nimiq Pay to use your wallet.');
  const sig = await call(() => w.sign(ROOT_MESSAGE));
  const N = await loadNimiq();
  try {
    const signer = N.PublicKey.fromHex(sig.publicKey).toAddress().toUserFriendlyAddress();
    if (signer.replace(/\s/g, '') !== address.replace(/\s/g, '')) {
      // The wallet signed with another account; follow the signer so keys stay consistent.
      addressCache = signer;
      address = signer;
    }
  } catch {
    // unexpected key format: keep going with the listed address
  }
  const root = rootFromSignature(N, sig.signature, sig.publicKey);
  try {
    localStorage.setItem(rootKey(address), toHex(root));
    if (asked !== address) localStorage.setItem(rootKey(asked), toHex(root));
  } catch {
    // storage blocked: the root lives for this session only
  }
  return root;
}
