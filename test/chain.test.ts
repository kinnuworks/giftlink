import { describe, expect, it } from 'vitest';
import * as N from '@nimiq/core';
import {
  buildAddStake,
  buildTransfer,
  decodeGift,
  deriveSecret,
  encodeGift,
  keyFromSecret,
  randomSecret,
  rootFromSignature,
  NETWORK_ID,
} from '../src/chain';

describe('gift link encoding', () => {
  it('round-trips amount, message and theme', () => {
    const secret = randomSecret();
    const enc = encodeGift({ secret, value: 12_345_678, message: 'Happy birthday, Ada 🎂', theme: 6 });
    const dec = decodeGift(enc);
    expect(Array.from(dec.secret)).toEqual(Array.from(secret));
    expect(dec.value).toBe(12_345_678);
    expect(dec.message).toBe('Happy birthday, Ada 🎂');
    expect(dec.theme).toBe(6);
  });

  it('matches the Hub byte layout: key, uint64 value, message length, message, theme', () => {
    const secret = new Uint8Array(32).fill(7);
    const enc = encodeGift({ secret, value: 100_000, message: 'hi', theme: 1 });
    const raw = Uint8Array.from(atob(enc.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    expect(raw.length).toBe(32 + 8 + 1 + 2 + 1);
    expect(Array.from(raw.slice(32, 40))).toEqual([0, 0, 0, 0, 0, 1, 0x86, 0xa0]);
    expect(raw[40]).toBe(2);
    expect(raw[43]).toBe(1);
  });

  it('accepts minimal links without message or theme, and tolerates ~ breaks', () => {
    const secret = randomSecret();
    const enc = encodeGift({ secret, value: 5, message: '', theme: 0 });
    expect(decodeGift(enc.slice(0, 10) + '~' + enc.slice(10)).value).toBe(5);
  });

  it('rejects broken links with a clear message', () => {
    expect(() => decodeGift('abc')).toThrow(/incomplete/);
  });
});

describe('keys and transactions', () => {
  it('derives stable, distinct gift keys from a wallet signature', () => {
    const root = rootFromSignature(N, 'aa'.repeat(64), 'bb'.repeat(32));
    const a = deriveSecret(N, root, 'g', 0);
    const b = deriveSecret(N, root, 'g', 1);
    expect(Array.from(deriveSecret(N, root, 'g', 0))).toEqual(Array.from(a));
    expect(Array.from(a)).not.toEqual(Array.from(b));
    expect(keyFromSecret(N, a).address).toMatch(/^NQ\d\d( [0-9A-Z]{4}){8}$/);
  });

  it('builds a signed mainnet claim that verifies', () => {
    const gift = keyFromSecret(N, randomSecret());
    const to = keyFromSecret(N, randomSecret()).address;
    const { hex, hash } = buildTransfer(N, gift, to, 1_000_000, 4_000_000);
    const tx = N.Transaction.fromAny(hex);
    expect(tx.networkId).toBe(NETWORK_ID);
    expect(tx.hash()).toBe(hash);
    expect(tx.recipient.toUserFriendlyAddress()).toBe(to);
    expect(tx.value).toBe(1_000_000n);
    expect(tx.fee).toBe(0n);
    tx.verify(1, NETWORK_ID);
  });

  it('builds a signed add-stake for an existing staker', () => {
    const gift = keyFromSecret(N, randomSecret());
    const staker = keyFromSecret(N, randomSecret()).address;
    const { hex } = buildAddStake(N, gift, staker, 20_000_000, 4_000_000);
    const tx = N.Transaction.fromAny(hex);
    expect(tx.sender.toUserFriendlyAddress()).toBe(gift.address);
    tx.verify(1, NETWORK_ID);
  });
});
