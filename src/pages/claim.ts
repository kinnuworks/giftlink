import {
  addrUrl,
  buildAddStake,
  buildTransfer,
  decodeGift,
  formatNim,
  getBlockNumber,
  giftState,
  hubLink,
  keyFromSecret,
  MIN_NEW_STAKE_LUNA,
  occasionByTheme,
  sameAddr,
  sendRawTransaction,
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

  let gift: GiftPayload;
  try {
    gift = decodeGift(encoded);
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
  const me = wallet ? await myAddress().catch(() => null) : null;
  render(encoded, gift, key, state, me, !!wallet);
}

function giftCard(gift: GiftPayload, value: number, from?: string, funding?: ChainTx) {
  return card({ value, theme: gift.theme, message: gift.message || undefined, from, fundingHash: funding?.hash });
}

function render(
  encoded: string,
  gift: GiftPayload,
  key: ReturnType<typeof keyFromSecret>,
  state: GiftState,
  me: string | null,
  inPay: boolean,
) {
  if (state.kind === 'unfunded') {
    return mount(
      header('claim'),
      h(
        'main',
        { class: 'page' },
        h('section', { class: 'intro' }, h('h1', { class: 't-h2' }, 'This gift hasn’t arrived yet.')),
        h('p', { class: 'lead' }, 'The sender’s payment is not on the Nimiq chain yet. If they just sent it, wait a moment and try again.'),
        h('button', { class: 'btn btn-candy btn-lg btn-block', onClick: () => claimPage(encoded) }, 'Check again'),
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
    if (e instanceof Cancelled) return;
    errorSlot.replaceChildren(errorBox((e as Error).message));
  };

  if (inPay && me) {
    const claimBtn = h('button', { class: 'btn btn-candy btn-lg btn-block' }, icon('wallet'), `Claim ${formatNim(value)} NIM`);
    claimBtn.addEventListener('click', async () => {
      errorSlot.replaceChildren();
      const done = busy(claimBtn, 'Claiming…');
      try {
        const N = await loadNimiq();
        const height = await getBlockNumber();
        const tx = buildTransfer(N, key, me, value, height);
        await sendRawTransaction(tx.hex);
        const confirmed = await waitForTx(tx.hash);
        successPage(gift, value, me, confirmed, false);
      } catch (e) {
        fail(e, done);
      }
    });
    actions.append(claimBtn);
    addStakeOption(actions, errorSlot, gift, key, value, me, fail);
  } else {
    actions.append(
      h('a', { class: 'btn btn-candy btn-lg btn-block', href: openInPayUrl('/c', encoded) }, 'Open in Nimiq Pay to claim'),
      h('a', { class: 'btn btn-outline btn-block', href: hubLink(encoded), target: '_blank', rel: 'noopener' }, 'Claim in the Nimiq web wallet'),
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
            const height = await getBlockNumber();
            const tx = buildTransfer(N, key, to, value, height);
            await sendRawTransaction(tx.hex);
            const confirmed = await waitForTx(tx.hash);
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

async function addStakeOption(
  actions: HTMLElement,
  errorSlot: HTMLElement,
  gift: GiftPayload,
  key: ReturnType<typeof keyFromSecret>,
  value: number,
  me: string,
  fail: (e: unknown, done: () => void) => void,
) {
  const staker = await isStaker(me).catch(() => false);
  if (staker) {
    // One step: the gift key adds its NIM straight to your existing stake.
    const btn = h('button', { class: 'btn btn-outline btn-block' }, icon('sprout'), 'Claim into my stake');
    btn.addEventListener('click', async () => {
      errorSlot.replaceChildren();
      const done = busy(btn, 'Adding to your stake…');
      try {
        const N = await loadNimiq();
        const height = await getBlockNumber();
        const tx = buildAddStake(N, key, me, value, height);
        await sendRawTransaction(tx.hex);
        const confirmed = await waitForTx(tx.hash);
        successPage(gift, value, me, confirmed, true);
      } catch (e) {
        fail(e, done);
      }
    });
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
  btn.addEventListener('click', async () => {
    errorSlot.replaceChildren();
    const done = busy(btn, 'Claiming…');
    try {
      const N = await loadNimiq();
      const height = await getBlockNumber();
      const tx = buildTransfer(N, key, me, value, height);
      await sendRawTransaction(tx.hex);
      const confirmed = await waitForTx(tx.hash);
      btn.textContent = 'Confirm the stake in your wallet…';
      await stakeNew(validator, value);
      successPage(gift, value, me, confirmed, true, validator);
    } catch (e) {
      fail(e, done);
    }
  });
  actions.append(btn, h('p', { class: 'hint' }, `Staking earns rewards from the pool (fee ${validator.fee > 1 ? validator.fee : Math.round(validator.fee * 100)}%). You can unstake later; it takes from 12 hours to a few days.`));
}

async function stakeNew(v: Validator, value: number) {
  const w = await getWallet();
  if (!w) throw new Error('Open Giftlink in Nimiq Pay to stake.');
  await call(() => w.sendNewStakerTransaction({ delegation: v.address, value }));
}

function successPage(gift: GiftPayload, value: number, to: string, tx: ChainTx, staked: boolean, validator?: Validator) {
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
      h(
        'div',
        { class: 'receipt' },
        h('div', {}, h('span', {}, 'Amount'), h('strong', {}, `${formatNim(value)} NIM`)),
        h('div', {}, h('span', {}, 'To'), h('a', { href: addrUrl(to), target: '_blank', rel: 'noopener' }, shortAddr(to))),
        h('div', {}, h('span', {}, 'Block'), h('strong', {}, `#${tx.blockNumber}`)),
        h('div', {}, h('span', {}, 'Transaction'), h('a', { href: txUrl(tx.hash), target: '_blank', rel: 'noopener' }, `${tx.hash.slice(0, 10)}…`)),
      ),
      link('/', 'Pass it on', 'btn btn-candy btn-lg btn-block'),
      h('p', { class: 'hint center' }, 'Send a gift of your own. It takes one payment.'),
    ),
  );
}
