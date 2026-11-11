import { renderSVG } from 'uqr';
import { formatNim, LUNA, OCCASIONS, getTransaction, txUrl } from '../chain';
import { createGift, type CreatedGift } from '../gifts';
import { Cancelled, getWallet } from '../wallet';
import { busy, copy, errorBox, h, link, mount, share } from '../ui';
import { header, openInPayUrl } from './shell';

const AMOUNTS = [10, 25, 50, 100];

export async function createPage() {
  // Render at once; swap in the wallet button when the wallet bridge answers.
  const walletSlot = h('div', {}, h('button', { class: 'btn primary big', disabled: true }, 'Connecting to your wallet…'));
  let amount = 25;
  let theme: number = OCCASIONS[0].theme;

  const custom = h('input', {
    type: 'number',
    inputmode: 'decimal',
    min: '1',
    step: 'any',
    placeholder: 'Other',
    class: 'amount-input',
    'aria-label': 'Other amount in NIM',
  });
  const amountChips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Amount' });
  const renderAmounts = () => {
    amountChips.replaceChildren(
      ...AMOUNTS.map((a) =>
        h(
          'button',
          {
            type: 'button',
            class: `chip ${a === amount && !custom.value ? 'on' : ''}`,
            role: 'radio',
            'aria-checked': String(a === amount && !custom.value),
            onClick: () => {
              amount = a;
              custom.value = '';
              renderAmounts();
              updateButton();
            },
          },
          `${a} NIM`,
        ),
      ),
      custom,
    );
  };
  custom.addEventListener('input', () => {
    const v = parseFloat(custom.value);
    if (v > 0) amount = v;
    renderAmounts();
    custom.focus();
    updateButton();
  });

  const occasionChips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Occasion' });
  const renderOccasions = () =>
    occasionChips.replaceChildren(
      ...OCCASIONS.map((o) =>
        h(
          'button',
          {
            type: 'button',
            class: `chip ${o.theme === theme ? 'on' : ''}`,
            role: 'radio',
            'aria-checked': String(o.theme === theme),
            onClick: () => {
              theme = o.theme;
              renderOccasions();
            },
          },
          `${o.emoji} ${o.label}`,
        ),
      ),
    );

  const message = h('textarea', {
    rows: 2,
    maxLength: 120,
    placeholder: 'Add a note (optional)',
    'aria-label': 'Note',
  });
  const errorSlot = h('div');
  const button = h('button', { class: 'btn primary big', type: 'submit' });
  const updateButton = () => {
    button.textContent = `Create gift link · ${formatNim(Math.round(amount * LUNA))} NIM`;
  };

  const form = h(
    'form',
    {
      class: 'card',
      onSubmit: async (e: Event) => {
        e.preventDefault();
        errorSlot.replaceChildren();
        const value = Math.round(amount * LUNA);
        if (!(value >= LUNA / 100)) {
          errorSlot.append(errorBox('Pick an amount of at least 0.01 NIM.'));
          return;
        }
        const done = busy(button, 'Check your wallet…');
        try {
          const gift = await createGift(value, theme, message.value.trim());
          resultPage(gift, theme, message.value.trim());
        } catch (err) {
          done();
          if (err instanceof Cancelled) return;
          errorSlot.append(errorBox((err as Error).message));
        }
      },
    },
    h('label', { class: 'label' }, 'Amount'),
    amountChips,
    h('label', { class: 'label' }, 'Occasion'),
    occasionChips,
    h('label', { class: 'label' }, 'Note'),
    message,
    h('p', { class: 'hint' }, 'The note travels inside the link only. It is never written to the chain.'),
    errorSlot,
    walletSlot,
  );
  getWallet().then((wallet) =>
    walletSlot.replaceChildren(
      ...(wallet
        ? [button, h('p', { class: 'hint center' }, 'First gift only: your wallet asks you to sign once, so you can see and take back your gifts on any device.')]
        : [
            h(
              'div',
              { class: 'notice' },
              h('p', {}, 'Sending a gift needs your Nimiq Pay wallet.'),
              h('a', { class: 'btn primary big', href: openInPayUrl('/') }, 'Open in Nimiq Pay'),
            ),
          ]),
    ),
  );

  renderAmounts();
  renderOccasions();
  updateButton();

  mount(
    header('send'),
    h(
      'main',
      { class: 'page' },
      h('h1', {}, 'Gift NIM with a link'),
      h('p', { class: 'lead' }, 'Pick an amount and send the link in any chat. Whoever opens it gets the NIM in their own wallet.'),
      form,
      h(
        'section',
        { class: 'how' },
        h('h2', {}, 'How it works'),
        h(
          'ol',
          {},
          h('li', {}, 'You approve one payment. The NIM moves to a new address made just for this gift.'),
          h('li', {}, 'The key to that address lives only in the link. Giftlink never holds your NIM.'),
          h('li', {}, 'Your friend opens the link and taps Claim. Not claimed? Take it back from ', link('/sent', 'Sent'), '.'),
        ),
      ),
    ),
  );
}

export function resultPage(gift: CreatedGift, theme: number, message: string) {
  const occasion = OCCASIONS.find((o) => o.theme === theme) ?? OCCASIONS[0];
  const shareText = `${occasion.emoji} I sent you ${formatNim(gift.value)} NIM. Open the link in Nimiq Pay to claim it:`;
  const status = h('p', { class: 'status pending' }, 'Waiting for the network to confirm…');
  const qr = h('div', { class: 'qr', html: renderSVG(gift.link, { border: 2 }) });

  mount(
    header('send'),
    h(
      'main',
      { class: 'page' },
      h('h1', {}, 'Your gift is ready'),
      h(
        'div',
        { class: 'gift-card' },
        h('div', { class: 'gift-emoji', 'aria-hidden': 'true' }, occasion.emoji),
        h('div', { class: 'gift-amount' }, `${formatNim(gift.value)} NIM`),
        h('div', { class: 'gift-occasion' }, occasion.label),
        message ? h('p', { class: 'gift-message' }, `“${message}”`) : null,
      ),
      h('button', { class: 'btn primary big', onClick: () => share(shareText, gift.link) }, 'Share the link'),
      h('button', { class: 'btn secondary', onClick: () => copy(gift.link, 'Link copied') }, 'Copy link'),
      h('p', { class: 'hint' }, 'Anyone with this link can claim the gift, like cash. Send it only to the person it’s for.'),
      status,
      h('details', { class: 'more' }, h('summary', {}, 'Show QR code'), qr),
      h('p', { class: 'center' }, link('/', 'Send another gift'), ' · ', link('/sent', 'See your gifts')),
    ),
  );

  if (gift.fundingHash) {
    const start = Date.now();
    const poll = async () => {
      try {
        const tx = await getTransaction(gift.fundingHash);
        if (tx?.blockNumber) {
          status.className = 'status ok';
          status.replaceChildren('On the Nimiq chain ✓ ', h('a', { href: txUrl(gift.fundingHash), target: '_blank', rel: 'noopener' }, 'View payment'));
          return;
        }
      } catch {
        // not yet visible
      }
      if (Date.now() - start < 90_000) setTimeout(poll, 2000);
      else status.textContent = 'Still confirming. The link already works and will be claimable as soon as the payment lands.';
    };
    poll();
  } else {
    status.textContent = 'Payment sent. It can take a few seconds to show on the chain.';
  }
}
