// Claims a testnet gift link with the same code path the app uses (sweepKey).
// Run: npx vite-node scripts/claim-test-gift.ts '<payload after #>' '<recipient NQ address>'
import * as N from '@nimiq/core';
import { setNetwork, decodeGift, keyFromSecret, sweepKey, giftState } from '../src/chain';
setNetwork('test');
const [payload, to] = process.argv.slice(2);
const key = keyFromSecret(N, decodeGift(payload).secret);
console.log('before', (await giftState(key.address)).kind);
const tx = await sweepKey(N, key, to);
console.log('claimed', tx.hash, 'block', tx.blockNumber);
const after = await giftState(key.address);
console.log('after', after.kind, after.kind === 'claimed' ? after.claimedBy : '');
