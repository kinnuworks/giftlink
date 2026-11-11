// Makes a funded testnet gift and prints its claim URL (for UI testing).
import * as N from '@nimiq/core';
import { setNetwork, keyFromSecret, randomSecret, buildTransfer, getBlockNumber, sendRawTransaction, waitForTx, getAccount, encodeGift, LUNA } from '../src/chain';
setNetwork('test');
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fromHex, toHex } from '../src/chain';
// Reuses one testnet sender key between runs (kept out of git), so the faucet is only hit once.
const KEY_FILE = '.testnet-sender.key';
const sender = keyFromSecret(N, existsSync(KEY_FILE) ? fromHex(readFileSync(KEY_FILE, 'utf8').trim()) : randomSecret());
writeFileSync(KEY_FILE, toHex(sender.secret));
console.error('sender', sender.address);
if ((await getAccount(sender.address)).balance < 1000 * LUNA) await fetch('https://faucet.pos.nimiq-testnet.com/tapit', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `address=${encodeURIComponent(sender.address)}` });
for (let i = 0; i < 40 && (await getAccount(sender.address)).balance === 0; i++) await new Promise((r) => setTimeout(r, 3000));
const gift = keyFromSecret(N, randomSecret());
const value = Number(process.argv[2] ?? 25) * LUNA;
const f = buildTransfer(N, sender, gift.address, value, await getBlockNumber(), 'Giftlink 🎂 Birthday');
await sendRawTransaction(f.hex);
await waitForTx(f.hash);
console.log(`http://127.0.0.1:5180/c?net=test#${encodeGift({ secret: gift.secret, value, message: 'Happy birthday! Have a great one.', theme: 6 })}`);
