# Giftlink

**Gift NIM with a link.** Pick an amount, send the link in any chat, and whoever opens it claims the NIM into their own Nimiq Pay wallet.

It needs Nimiq because each gift is a real address on the Nimiq chain. The key to that address lives only in the link, so Giftlink never holds anyone's money, and every claim is a transaction you can look up.

**Try it:** open [giftlink-beige.vercel.app](https://giftlink-beige.vercel.app) in Nimiq Pay (Mini Apps → Custom URL).

### Try it in 30 seconds

1. In Nimiq Pay, open Giftlink and pick 5 NIM and an occasion.
2. Tap **Create gift link**. The first time, your wallet asks for one signature so your gift list follows you to any phone. Then approve the payment.
3. Send the link to a friend, or open it on a second phone. Tap **Claim**. The NIM is in that wallet a second later, with a receipt and explorer links.

Buying for someone together? Pick **Group gift**: friends get a chip-in link and add NIM to the same gift before you send it. Didn't get claimed? Go to **Sent** and tap **Take back**. Running a meetup? **Vouchers** turns one payment into a printable sheet of QR codes, each holding NIM.

No Nimiq Pay at hand? [See what a friend receives](https://giftlink-beige.vercel.app/demo).

A gift link works like cash: whoever has it can claim it. Posting in a group chat? Turn on **Lock with a secret word**: Giftlink picks four random words, and you tell them separately.

---

## What it does

- **Gift links.** One payment moves the NIM to a fresh address made for that gift. The link carries the address's key, the amount, an occasion and an optional note.
- **Group gifts.** Start a gift, share a chip-in link, and friends add NIM to the same gift address from their own wallets. Everyone sees who chipped in, read straight from the chain. The chip-in link holds no key, so it can collect but never claim.
- **Secret word lock.** Optionally lock a gift with two or more words. The link then carries the key scrambled with them (PBKDF2, 600,000 rounds), so a leaked link alone can't claim it.
- **Claim in one tap.** The recipient's browser signs the claim with the gift's key and sends it to the Nimiq chain. Nobody needs an account.
- **Claim into staking.** If you already stake, the gift joins your stake in one step, with no wallet popup. If you don't, gifts of 100 NIM or more can be claimed and staked with a well-rated pool.
- **Sent list on any phone.** Gift keys come from one signature by your wallet, so Giftlink can rebuild your list of sent gifts from the chain on any device and let you take back the unclaimed ones.
- **Voucher sheets for meetups and shops.** One payment becomes up to 25 QR vouchers. Download the sheet as an image, hand them out, and take back whatever nobody claims.
- **Works with Nimiq's own cashlinks.** Links use the same format as Nimiq Hub cashlinks, so someone without Nimiq Pay can still claim in the Nimiq web wallet.

## How it works

| Step | What happens on chain |
|---|---|
| Create | Your wallet sends the NIM to a one-time gift address (`sendBasicTransactionWithData`, memo `Giftlink <occasion>`). |
| Share | The link is `/c#<key, amount, note, occasion>`. The part after `#` never reaches a server. |
| Claim | The browser builds a basic transaction from the gift address to the recipient, signs it with the gift key (`@nimiq/core`), and broadcasts it. |
| Stake on claim | Existing stakers: the gift key signs an add-stake transaction for the recipient. New stakers: claim, then `sendNewStakerTransaction` in the wallet. |
| Take back | Your wallet signs one fixed message. Gift keys are derived from that signature, so the app can find every gift you sent and sweep unclaimed ones back to you. |

Chain reads use Nimiq's public RPC. Pool choices come from Nimiq's validators API.

## Privacy and safety

- Giftlink has no server, no database and no account. It stores your gift list only in your browser, and can rebuild it from the chain.
- The note you write stays in the link. Only the occasion name goes on chain, in the funding memo.
- Anyone who has an unlocked gift link or voucher QR can claim it, like cash. Lock gifts you post in group chats.
- Chip-in payments carry the name you type, so the group can see who added what. That name is public on the Nimiq chain.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests: link format, keys, signed transactions
npx vite-node scripts/e2e-testnet.ts   # full gift and claim on Nimiq testnet
```

Add `?net=test` to any URL to use testnet. Nimiq Pay's testnet mode switches automatically.

Built with TypeScript, Vite, `@nimiq/mini-app-sdk` and `@nimiq/core`. MIT licensed.
