import {
  addrUrl,
  buildAddStake,
  buildTransfer,
  decodeGift,
  decodeLockedPreview,
  getAccount,
  getTransactions,
  isLocked,
  unlockGift,
  formatNim,
  getBlockNumber,
  giftState,
  hubLink,
  keyFromSecret,
  MIN_NEW_STAKE_LUNA,
  occasionByTheme,
  sameAddr,
  sendRawTransaction,
  sweepKey,
  CLAIM_MEMO,
  THANKS_MEMO,
  fitMemo,
  shortAddr,
  txUrl,
  waitForTx,
  type GiftPayload,
  type GiftState,
  type ChainTx,
} from '../chain';
import { loadNimiq } from '../nimiq';
import { Cancelled, call, getWallet, isStaker, myAddress } from '../wallet';
import { busy, errorBox, h, link, mount, spinner } from '../ui';
import { header, openInPayUrl } from './shell';
import { pickValidator, type Validator } from '../validators';
import { art as artFor, giftCard as card, icon, trust } from '../card';

export async function claimPage(encoded: string) {
  mount(header('claim'), h('main', { class: 'page' }, spinner('Opening your gift…')));

  const locked = isLocked(encoded);
  let gift: GiftPayload;
  try {
    gift = locked ? ((await wordPage(encoded)) as GiftPayload) : decodeGift(encoded);
  } catch (e) {
    return mount(header('claim'), h('main', { class: 'page' }, errorBox((e as Error).message || 'This gift link is broken.')));
  }

  const N = await loadNimiq().catch(() => null);
  if (!N) {
    return mount(
      header('claim'),
      h('main', { class: 'page' }, errorBox('Could not load the code that opens gifts. Check your connection.', () => claimPage(encoded))),
    );
  }
  const key = keyFromSecret(N, gift.secret);
  const walletP = getWallet();

  let state: GiftState;
  try {
    state = await giftState(key.address);
    // A just-created gift may still be on its way: wait up to 30 s.
    const start = Date.now();
    while (state.kind === 'unfunded' && Date.now() - start < 30_000) {
      mount(header('claim'), h('main', { class: 'page' }, spinner('This gift is on its way. Waiting for the network…')));
      await new Promise((r) => setTimeout(r, 2500));
      state = await giftState(key.address);
    }
  } catch (e) {
    return mount(header('claim'), h('main', { class: 'page' }, errorBox((e as Error).message, () => claimPage(encoded))));
  }

  const wallet = await walletP;
  let me: string | null = null;
  if (wallet) {
    try {
      me = await myAddress();
    } catch (e) {
      return mount(header('claim'), h('main', { class: 'page' }, errorBox(`Couldn't read your wallet address. ${(e as Error).message}`, () => claimPage(encoded))));
    }
  }
  currentGivers = state.kind === 'unfunded' ? 0 : state.givers;
  currentSender = state.kind === 'unfunded' ? undefined : state.funding?.from;
  render(locked ? '' : encoded, gift, key, state, me, !!wallet, encoded);
}

let currentGivers = 0;
let currentSender: string | undefined;
function giftCard(gift: GiftPayload, value: number, from?: string, funding?: ChainTx) {
  return card({ value, theme: gift.theme, message: gift.message || undefined, from, fundingHash: funding?.hash, givers: currentGivers });
}

// Locked gifts: ask for the secret word before anything else.
async function wordPage(encoded: string): Promise<GiftPayload | null> {
  const preview = decodeLockedPreview(encoded);
  return new Promise((resolve) => {
    const input = h('input', { type: 'text', class: 'field', placeholder: 'Secret words', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-label': 'Secret word' });
    const errorSlot = h('div');
    const btn = h('button', { class: 'btn btn-candy btn-lg btn-block', type: 'submit' }, 'Open gift');
    mount(
      header('claim'),
      h(
        'main',
        { class: 'page' },
        h('section', { class: 'intro' }, h('span', { class: 'eyebrow' }, h('span', { class: 'dot' }), 'Someone sent you NIM'), h('h1', {}, 'You got ', h('span', { class: 'hl' }, 'a gift'), '.')),
        h('div', { class: 'preview is-new' }, card({ value: preview.value, theme: preview.theme, message: preview.message || undefined })),
        h(
          'form',
          {
            class: 'panel-form word-form',
            onSubmit: async (e: Event) => {
              e.preventDefault();
              errorSlot.replaceChildren();
              const done = busy(btn, 'Checking…');
              try {
                const g = await unlockGift(encoded, input.value);
                const N = await loadNimiq();
                const addr = keyFromSecret(N, g.secret).address;
                const [acc, txs] = await Promise.all([getAccount(addr), getTransactions(addr, 1).catch(() => [])]);
                if (acc.balance === 0 && txs.length === 0) {
                  done();
                  errorSlot.append(errorBox('Those words don’t open this gift. Check the spelling with the sender.'));
                  return;
                }
                resolve(g);
              } catch (err) {
                done();
                errorSlot.append(errorBox((err as Error).message));
              }
            },
          },
          h('label', { class: 'label' }, 'This gift is locked with secret words'),
          input,
          h('p', { class: 'hint' }, 'The sender told you the words separately. Capital letters don’t matter.'),
          errorSlot,
          btn,
        ),
      ),
    );
    input.focus();
  });
}

function render(
  encoded: string,
  gift: GiftPayload,
  key: ReturnType<typeof keyFromSecret>,
  state: GiftState,
  me: string | null,
  inPay: boolean,
  rawEncoded = encoded,
) {
  if (state.kind === 'unfunded') {
    return mount(
      header('claim'),
      h(
        'main',
        { class: 'page' },
        h('section', { class: 'intro' }, h('h1', { class: 't-h2' }, 'This gift hasn’t arrived yet.')),
        h('p', { class: 'lead' }, 'The sender’s payment is not on the Nimiq chain yet. If they just sent it, wait a moment and try again.'),
        h('button', { class: 'btn btn-candy btn-lg btn-block', onClick: () => claimPage(rawEncoded) }, 'Check again'),
      ),
    );
  }

  if (state.kind === 'claimed') {
    const mine = me && sameAddr(state.claimedBy, me);
    const title = state.takenBack ? 'The sender took this gift back' : mine ? 'You claimed this gift' : 'This gift was already claimed';
    return mount(
      header('claim'),
      h(
        'main',
        { class: 'page' },
        h('section', { class: 'intro' }, h('h1', { class: 't-h2' }, title + '.')),
        h('div', { class: 'preview is-spent' }, giftCard(gift, state.claim.value, state.funding?.from, state.funding)),
        h(
          'p',
          { class: 'claimed-line' },
          `Claimed ${new Date(state.claim.timestamp).toLocaleString()} by `,
          h('a', { href: addrUrl(state.claimedBy), target: '_blank', rel: 'noopener' }, shortAddr(state.claimedBy)),
          ' · ',
          h('a', { href: txUrl(state.claim.hash), target: '_blank', rel: 'noopener' }, 'transaction'),
        ),
        link('/', 'Send a gift of your own', 'btn btn-candy btn-lg btn-block'),
      ),
    );
  }

  // Ready to claim.
  const value = state.balance;
  const from = state.funding?.from;
  const errorSlot = h('div');
  const actions = h('div', { class: 'actions' });
  const page = h(
    'main',
    { class: 'page' },
    h('section', { class: 'intro' }, h('span', { class: 'eyebrow' }, h('span', { class: 'dot' }), 'Someone sent you NIM'), h('h1', {}, 'You got ', h('span', { class: 'hl' }, 'a gift'), '.')),
    h('div', { class: 'preview is-new' }, giftCard(gift, value, from, state.funding)),
    errorSlot,
    actions,
    trust('Checked on the Nimiq chain', 'Giftlink never holds the NIM'),
  );
  mount(header('claim'), page);

  const fail = (e: unknown, done: () => void) => {
    done();
    actions.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = false));
    if (e instanceof Cancelled) return;
    errorSlot.replaceChildren(errorBox((e as Error).message));
  };
  // Only one claim action at a time, and never claim a gift that's already gone.
  const exclusive = async (btn: HTMLButtonElement, label: string, run: () => Promise<void>) => {
    errorSlot.replaceChildren();
    const done = busy(btn, label);
    actions.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
    try {
      const now = await giftState(key.address);
      if (now.kind !== 'ready') {
        currentGivers = now.kind === 'claimed' ? now.givers : currentGivers;
        return render(encoded, gift, key, now, me, inPay, rawEncoded);
      }
      await run();
    } catch (e) {
      fail(e, done);
    }
  };

  if (inPay && me) {
    const claimBtn = h('button', { class: 'btn btn-candy btn-lg btn-block' }, icon('wallet'), `Claim ${formatNim(value)} NIM`);
    claimBtn.addEventListener('click', () =>
      exclusive(claimBtn, 'Claiming…', async () => {
        const confirmed = await sweepKey(await loadNimiq(), key, me!, 'transfer', CLAIM_MEMO);
        successPage(gift, value, me!, confirmed, false);
      }),
    );
    actions.append(claimBtn);
    addStakeOption(actions, gift, key, value, me, exclusive);
  } else {
    actions.append(
      h('a', { class: 'btn btn-candy btn-lg btn-block', href: openInPayUrl('/c', rawEncoded) }, 'Open in Nimiq Pay to claim'),
      ...(encoded ? [h('a', { class: 'btn btn-outline btn-block', href: hubLink(encoded), target: '_blank', rel: 'noopener' }, 'Claim in the Nimiq web wallet')] : []),
      addressClaim(gift, key, value, errorSlot, fail),
      h('p', { class: 'hint' }, 'No Nimiq Pay yet? Install it from your app store, then open this link again.'),
    );
  }
}

// Outside Nimiq Pay: claim to any Nimiq address the person pastes.
function addressClaim(
  gift: GiftPayload,
  key: ReturnType<typeof keyFromSecret>,
  value: number,
  errorSlot: HTMLElement,
  fail: (e: unknown, done: () => void) => void,
) {
  const input = h('input', { type: 'text', placeholder: 'NQ.. your Nimiq address', autocomplete: 'off', spellcheck: false, 'aria-label': 'Your Nimiq address' });
  const btn = h('button', { class: 'btn btn-outline btn-block', type: 'submit' }, 'Claim to this address');
  return h(
    'details',
    { class: 'more' },
    h('summary', {}, 'Or claim to a Nimiq address'),
    h(
      'form',
      {
        class: 'inline-form',
        onSubmit: async (e: Event) => {
          e.preventDefault();
          errorSlot.replaceChildren();
          const done = busy(btn, 'Claiming…');
          try {
            const N = await loadNimiq();
            let to: string;
            try {
              to = N.Address.fromUserFriendlyAddress(input.value.trim().toUpperCase()).toUserFriendlyAddress();
            } catch {
              throw new Error('That doesn’t look like a Nimiq address. It starts with NQ and has 36 characters.');
            }
            const now = await giftState(key.address);
            if (now.kind !== 'ready') throw new Error('This gift was already claimed.');
            const confirmed = await sweepKey(N, key, to, 'transfer', CLAIM_MEMO);
            successPage(gift, value, to, confirmed, false);
          } catch (err) {
            fail(err, done);
          }
        },
      },
      input,
      btn,
    ),
  );
}

type Exclusive = (btn: HTMLButtonElement, label: string, run: () => Promise<void>) => Promise<void>;

async function addStakeOption(
  actions: HTMLElement,
  gift: GiftPayload,
  key: ReturnType<typeof keyFromSecret>,
  value: number,
  me: string,
  exclusive: Exclusive,
) {
  const staker = await isStaker(me).catch(() => false);
  if (staker) {
    // One step: the gift key adds its NIM straight to your existing stake.
    const btn = h('button', { class: 'btn btn-outline btn-block' }, icon('sprout'), 'Claim into my stake');
    btn.addEventListener('click', () =>
      exclusive(btn, 'Adding to your stake…', async () => {
        const confirmed = await sweepKey(await loadNimiq(), key, me, 'stake');
        successPage(gift, value, me, confirmed, true);
      }),
    );
    actions.append(btn, h('p', { class: 'hint' }, 'You already stake, so the gift joins your stake and starts earning with your pool.'));
    return;
  }
  if (value < MIN_NEW_STAKE_LUNA) {
    actions.append(h('p', { class: 'hint' }, 'Gifts of 100 NIM or more can go straight into staking.'));
    return;
  }
  // New stakers: claim first, then the wallet creates the stake (two confirmations).
  const validator = await pickValidator().catch(() => null);
  if (!validator) return;
  const btn = h('button', { class: 'btn btn-outline btn-block' }, icon('sprout'), `Claim and stake with ${validator.name}`);
  btn.addEventListener('click', () =>
    exclusive(btn, 'Claiming…', async () => {
      const confirmed = await sweepKey(await loadNimiq(), key, me, 'transfer', CLAIM_MEMO);
      // The NIM is already in the wallet. A cancelled or failed stake must not undo that.
      btn.textContent = 'Confirm the stake in your wallet…';
      try {
        await stakeNew(validator, value);
        successPage(gift, value, me, confirmed, true, validator);
      } catch (e) {
        successPage(gift, value, me, confirmed, false, undefined, e instanceof Cancelled ? 'Staking was skipped. Your NIM is in your wallet.' : `Staking didn’t go through (${(e as Error).message}). Your NIM is in your wallet.`);
      }
    }),
  );
  actions.append(btn, h('p', { class: 'hint' }, `Staking earns rewards from the pool (fee ${validator.fee > 1 ? validator.fee : Math.round(validator.fee * 100)}%). You can unstake later; it takes from 12 hours to a few days.`));
}

async function stakeNew(v: Validator, value: number) {
  const w = await getWallet();
  if (!w) throw new Error('Open Giftlink in Nimiq Pay to stake.');
  await call(() => w.sendNewStakerTransaction({ delegation: v.address, value }));
}

function successPage(gift: GiftPayload, value: number, to: string, tx: ChainTx, staked: boolean, validator?: Validator, note?: string) {
  const occasion = occasionByTheme(gift.theme);
  mount(
    header('claim'),
    h(
      'main',
      { class: 'page' },
      h('div', { class: 'success-mark' }, artFor(occasion.id)),
      h('h1', { class: 't-h2 center' }, staked ? `${formatNim(value)} NIM is now staking.` : `${formatNim(value)} NIM is yours.`),
      h(
        'p',
        { class: 'lead' },
        staked
          ? validator
            ? `It’s in your wallet and staked with ${validator.name}, earning rewards.`
            : 'It joined your stake and earns rewards with your pool.'
          : 'It’s in your wallet now.',
      ),
      note ? h('p', { class: 'notice' }, note) : null,
      h(
        'div',
        { class: 'receipt' },
        h('div', {}, h('span', {}, 'Amount'), h('strong', {}, `${formatNim(value)} NIM`)),
        h('div', {}, h('span', {}, 'To'), h('a', { href: addrUrl(to), target: '_blank', rel: 'noopener' }, shortAddr(to))),
        tx.blockNumber ? h('div', {}, h('span', {}, 'Block'), h('strong', {}, `#${tx.blockNumber}`)) : null,
        h('div', {}, h('span', {}, 'Transaction'), h('a', { href: txUrl(tx.hash), target: '_blank', rel: 'noopener' }, `${tx.hash.slice(0, 10)}…`)),
      ),
      currentSender && currentGivers <= 1 && !sameAddr(currentSender, to) ? thanksBox(currentSender) : null,
      link('/', 'Pass it on', 'btn btn-candy btn-lg btn-block'),
      h('p', { class: 'hint center' }, 'Send a gift of your own. It takes one payment.'),
    ),
  );
}

// A thank-you note on chain: the smallest possible NIM payment back to the sender,
// carrying a short message. It shows up in the sender's Sent list.
function thanksBox(sender: string) {
  const input = h('input', { type: 'text', class: 'field', maxLength: 40, placeholder: 'Thank you!', 'aria-label': 'Thank-you note' });
  const btn = h('button', { class: 'btn btn-outline btn-block', type: 'submit' }, icon('share'), 'Say thanks');
  const slot = h('div');
  const form = h(
    'form',
    {
      class: 'panel-form thanks',
      onSubmit: async (e: Event) => {
        e.preventDefault();
        slot.replaceChildren();
        const done = busy(btn, 'Check your wallet…');
        try {
          const w = await getWallet();
          if (!w) throw new Error('Open Giftlink in Nimiq Pay to send thanks.');
          const note = input.value.trim() || 'Thank you!';
          await call(() => w.sendBasicTransactionWithData({ recipient: sender, value: 1, data: fitMemo(`${THANKS_MEMO}: ${note}`) }));
          form.replaceChildren(h('p', { class: 'chain-status ok' }, h('span', { class: 'pulse' }), 'Thanks sent. They’ll see it in their Sent list.'));
        } catch (err) {
          done();
          if (!(err instanceof Cancelled)) slot.append(errorBox((err as Error).message));
        }
      },
    },
    h('label', { class: 'label' }, 'Say thanks ', h('span', { class: 'label__hint' }, 'a note on the chain, costs almost nothing')),
    input,
    slot,
    btn,
  );
  return form;
}
