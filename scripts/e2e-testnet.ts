// End-to-end check on Nimiq testnet: fund a gift, read its state, claim it, read again.
// Run: npx vite-node scripts/e2e-testnet.ts
import * as N from '@nimiq/core';
import {
  setNetwork, keyFromSecret, randomSecret, buildTransfer, getBlockNumber, sendRawTransaction,
  waitForTx, giftState, getAccount, encodeGift, decodeGift, LUNA,
} from '../src/chain';

setNetwork('test');
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

const sender = keyFromSecret(N, randomSecret());
const recipient = keyFromSecret(N, randomSecret());
log('sender', sender.address);

const tap = await fetch('https://faucet.pos.nimiq-testnet.com/tapit', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: `address=${encodeURIComponent(sender.address)}`,
});
log('faucet', tap.status, (await tap.text()).slice(0, 200));

for (let i = 0; i < 40; i++) {
  const a = await getAccount(sender.address);
  if (a.balance > 0) { log('sender balance', a.balance / LUNA, 'NIM'); break; }
  await new Promise((r) => setTimeout(r, 3000));
}

// Create a gift: sender funds a fresh gift address.
const gift = keyFromSecret(N, randomSecret());
const value = 12 * LUNA;
const fund = buildTransfer(N, sender, gift.address, value, await getBlockNumber(), 'Giftlink 🎂 Birthday');
await sendRawTransaction(fund.hex);
await waitForTx(fund.hash);
log('funded gift', gift.address, fund.hash);
const link = encodeGift({ secret: gift.secret, value, message: 'Test gift', theme: 6 });
log('link payload', link.length, 'chars');

const st1 = await giftState(gift.address);
log('state before claim', st1.kind, st1.kind === 'ready' ? st1.balance : '');
if (st1.kind !== 'ready') throw new Error('expected ready');

// Claim: decode the link as the recipient would, sign with the gift key.
const decoded = keyFromSecret(N, decodeGift(link).secret);
const claim = buildTransfer(N, decoded, recipient.address, st1.balance, await getBlockNumber());
await sendRawTransaction(claim.hex);
const confirmed = await waitForTx(claim.hash);
log('claimed in block', confirmed.blockNumber, claim.hash);

const st2 = await giftState(gift.address);
log('state after claim', st2.kind, st2.kind === 'claimed' ? `by ${st2.claimedBy} takenBack=${st2.takenBack}` : '');
log('recipient balance', (await getAccount(recipient.address)).balance / LUNA, 'NIM');
if (st2.kind !== 'claimed' || st2.takenBack) throw new Error('expected claimed by recipient');
log('E2E OK');
