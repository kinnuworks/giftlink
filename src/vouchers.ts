// Voucher batches: one payment funds a batch address, the browser splits it into
// up to 25 vouchers, each with its own one-time key (shown as a QR code).
import {
  buildTransfer,
  deriveSecret,
  encodeGift,
  getAccount,
  getBlockNumber,
  getTransactions,
  keyFromSecret,
  sameAddr,
  sendRawTransaction,
  type ChainTx,
  type GiftKey,
} from './chain';
import { loadNimiq } from './nimiq';
import { giftUrl, sweep } from './gifts';
import { call, getWallet, myAddress, unlockRoot } from './wallet';

export const MAX_VOUCHERS = 25;

export interface BatchInfo {
  index: number;
  count: number;
  value: number; // per voucher, luna
  label: string;
  theme: number;
  createdAt: number;
}

const batchKey = (addr: string) => `giftlink:batches:${addr.replace(/\s/g, '')}`;

function readBatches(addr: string): BatchInfo[] {
  try {
    return JSON.parse(localStorage.getItem(batchKey(addr)) || '[]');
  } catch {
    return [];
  }
}

function writeBatches(addr: string, list: BatchInfo[]) {
  try {
    localStorage.setItem(batchKey(addr), JSON.stringify(list));
  } catch {
    // chain stays the source of truth
  }
}

export async function batchFundingKey(root: Uint8Array, j: number): Promise<GiftKey> {
  const N = await loadNimiq();
  return keyFromSecret(N, deriveSecret(N, root, 'b', j));
}

export async function voucherKey(root: Uint8Array, j: number, k: number): Promise<GiftKey> {
  const N = await loadNimiq();
  return keyFromSecret(N, deriveSecret(N, root, 'v', j, k));
}

export async function listBatches(): Promise<BatchInfo[]> {
  const me = await myAddress();
  const root = await unlockRoot(me);
  const local = readBatches(me);
  const out: BatchInfo[] = [...local];
  // Recover batches made on another device.
  let gap = 0;
  for (let j = 0; gap < 2 && j < 200; j++) {
    if (local.some((b) => b.index === j)) {
      gap = 0;
      continue;
    }
    const key = await batchFundingKey(root, j);
    const txs = await getTransactions(key.address, 60).catch(() => [] as ChainTx[]);
    if (!txs.length) {
      gap++;
      continue;
    }
    gap = 0;
    const outs = txs.filter((t) => sameAddr(t.from, key.address) && !sameAddr(t.to, me));
    const inTx = txs.find((t) => sameAddr(t.to, key.address));
    out.push({
      index: j,
      count: outs.length,
      value: outs[0]?.value ?? 0,
      label: '',
      theme: 1,
      createdAt: inTx?.timestamp ?? Date.now(),
    });
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  if (out.length !== local.length) writeBatches(me, out);
  return out;
}

export async function nextBatchIndex(): Promise<number> {
  const list = await listBatches();
  return list.length ? Math.max(...list.map((b) => b.index)) + 1 : 0;
}

export async function fundBatch(count: number, value: number, label: string, theme: number): Promise<BatchInfo> {
  if (count < 1 || count > MAX_VOUCHERS) throw new Error(`Make between 1 and ${MAX_VOUCHERS} vouchers.`);
  const w = await getWallet();
  if (!w) throw new Error('Open Giftlink in Nimiq Pay to make vouchers.');
  const me = await myAddress();
  const root = await unlockRoot(me);
  const index = await nextBatchIndex();
  const funding = await batchFundingKey(root, index);
  await call(() =>
    w.sendBasicTransactionWithData({ recipient: funding.address, value: value * count, data: `Giftlink vouchers x${count}` }),
  );
  const info: BatchInfo = { index, count, value, label, theme, createdAt: Date.now() };
  writeBatches(me, [...readBatches(me).filter((b) => b.index !== index), info]);
  return info;
}

// Splits the funded batch into vouchers. Safe to run again: vouchers that already
// received their NIM are skipped, so an interrupted split just resumes.
export async function splitBatch(batch: BatchInfo, onProgress: (done: number, total: number) => void): Promise<void> {
  const me = await myAddress();
  const root = await unlockRoot(me);
  const funding = await batchFundingKey(root, batch.index);
  const N = await loadNimiq();

  // Wait for the funding payment to land.
  const start = Date.now();
  let acc = await getAccount(funding.address);
  while (acc.balance < batch.value && Date.now() - start < 90_000) {
    await new Promise((r) => setTimeout(r, 2000));
    acc = await getAccount(funding.address);
  }
  const outs = (await getTransactions(funding.address, 60)).filter((t) => sameAddr(t.from, funding.address));
  const pending: { k: number; key: GiftKey }[] = [];
  for (let k = 0; k < batch.count; k++) {
    const key = await voucherKey(root, batch.index, k);
    if (outs.some((t) => sameAddr(t.to, key.address))) continue;
    pending.push({ k, key });
  }
  let done = batch.count - pending.length;
  onProgress(done, batch.count);
  if (!pending.length) return;
  if (acc.balance < batch.value * pending.length) {
    throw new Error('The voucher payment has not arrived in full yet. Wait a moment and tap Continue.');
  }
  const height = await getBlockNumber();
  const hashes: string[] = [];
  for (const p of pending) {
    const tx = buildTransfer(N, funding, p.key.address, batch.value, height, `Giftlink voucher ${p.k + 1}`);
    await sendRawTransaction(tx.hex);
    hashes.push(tx.hash);
    await new Promise((r) => setTimeout(r, 250));
  }
  // Wait until every voucher shows its balance.
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const balances = await Promise.all(pending.map((p) => getAccount(p.key.address).then((a) => a.balance).catch(() => 0)));
    done = batch.count - pending.length + balances.filter((b) => b > 0).length;
    onProgress(done, batch.count);
    if (balances.every((b) => b > 0)) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Some vouchers are still confirming. Tap Continue in a minute to finish.');
}

export interface VoucherStatus {
  k: number;
  key: GiftKey;
  link: string;
  balance: number;
  claimedBy?: string;
  claimTx?: ChainTx;
}

export async function voucherStatuses(batch: BatchInfo): Promise<{ funding: GiftKey; fundingBalance: number; vouchers: VoucherStatus[] }> {
  const me = await myAddress();
  const root = await unlockRoot(me);
  const funding = await batchFundingKey(root, batch.index);
  const fundingBalance = (await getAccount(funding.address)).balance;
  const vouchers = await Promise.all(
    Array.from({ length: batch.count }, async (_, k) => {
      const key = await voucherKey(root, batch.index, k);
      const [acc, txs] = await Promise.all([
        getAccount(key.address).catch(() => ({ balance: 0 })),
        getTransactions(key.address, 5).catch(() => [] as ChainTx[]),
      ]);
      const outTx = txs.find((t) => sameAddr(t.from, key.address));
      return {
        k,
        key,
        link: giftUrl(encodeGift({ secret: key.secret, value: batch.value, message: batch.label, theme: batch.theme })),
        balance: acc.balance,
        claimedBy: outTx?.to,
        claimTx: outTx,
      };
    }),
  );
  return { funding, fundingBalance, vouchers };
}

// Takes back every unclaimed voucher and anything left on the batch address.
export async function reclaimBatch(batch: BatchInfo, onProgress: (n: number) => void): Promise<number> {
  const me = await myAddress();
  const { funding, fundingBalance, vouchers } = await voucherStatuses(batch);
  let total = 0;
  let n = 0;
  for (const v of vouchers) {
    if (v.balance > 0) {
      await sweep(v.key, me, v.balance);
      total += v.balance;
      onProgress(++n);
    }
  }
  if (fundingBalance > 0) {
    await sweep(funding, me, fundingBalance);
    total += fundingBalance;
  }
  return total;
}
