import { renderSVG } from 'uqr';
import { formatNim, LUNA, OCCASIONS, getTransaction, txUrl } from '../chain';
import { createGift, type CreatedGift } from '../gifts';
import { Cancelled, getWallet } from '../wallet';
import { busy, copy, errorBox, h, link, mount, share } from '../ui';
import { art, giftCard, icon, trust } from '../card';
import { header, openInPayUrl } from './shell';

const AMOUNTS = [5, 10, 25, 100];

export async function createPage() {
  let amount = 25;
  let theme: number = OCCASIONS[0].theme;
  let group = false;

  const previewSlot = h('div', { class: 'preview' });
  const message = h('input', {
    type: 'text',
    maxLength: 80,
    placeholder: 'Add a note, like "Happy birthday, Ada"',
    'aria-label': 'Note',
    class: 'field',
    id: 'note',
  });
  const renderPreview = () =>
    previewSlot.replaceChildren(giftCard({ value: Math.round(amount * LUNA), theme, message: message.value.trim() || undefined }));
  message.addEventListener('input', renderPreview);

  const custom = h('input', {
    type: 'number',
    inputmode: 'decimal',
    min: '0.01',
    step: 'any',
    placeholder: 'Other',
    class: 'field field--amount',
    'aria-label': 'Other amount in NIM',
  });
  const amountChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Amount' });
  const renderAmounts = () => {
    amountChips.replaceChildren(
      ...AMOUNTS.map((a) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip chip--lg',
            'aria-pressed': String(a === amount && !custom.value),
            onClick: () => {
              amount = a;
              custom.value = '';
              update();
            },
          },
          h('span', { class: 't-mono' }, String(a)),
          ' NIM',
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
    renderPreview();
    updateButton();
  });

  const occasionTiles = h('div', { class: 'occasions', role: 'group', 'aria-label': 'Occasion' });
  const renderOccasions = () =>
    occasionTiles.replaceChildren(
      ...OCCASIONS.map((o) =>
        h(
          'button',
          {
            type: 'button',
            class: 'occ',
            'data-occ': o.id,
            'aria-pressed': String(o.theme === theme),
            onClick: () => {
              theme = o.theme;
              renderOccasions();
              renderPreview();
            },
          },
          art(o.id, 'occ__art'),
          h('span', {}, o.label),
        ),
      ),
    );

  // Who pays: just me, or a group gift friends chip into.
  const title = h('input', { type: 'text', maxLength: 60, placeholder: "What's it for? Like \"Ada's 30th\"", class: 'field', 'aria-label': 'What the group gift is for' });
  const groupExtra = h('div', { class: 'group-extra', hidden: true }, title, h('p', { class: 'hint' }, 'You pay the first part. Friends get a chip-in link and add NIM to the same gift. Send the gift when everyone is in.'));
  const modeSeg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Who pays' });
  const renderMode = () => {
    modeSeg.replaceChildren(
      ...[
        [false, 'Just me'],
        [true, 'Group gift'],
      ].map(([g, label]) =>
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(group === g),
            onClick: () => {
              group = g as boolean;
              groupExtra.hidden = !group;
              renderMode();
              updateButton();
            },
          },
          label as string,
        ),
      ),
    );
  };
  renderMode();

  // Optional secret word: the link alone can't claim the gift.
  const lockSwitch = h('input', { type: 'checkbox', class: 'switch', id: 'lock', 'aria-describedby': 'lock-hint' });
  const word = h('input', { type: 'text', maxLength: 40, placeholder: 'Secret word, like "pancake"', class: 'field', autocomplete: 'off', 'aria-label': 'Secret word' });
  const wordRow = h('div', { class: 'group-extra', hidden: true }, word, h('p', { class: 'hint' }, 'Tell them the word in person or in another chat. Without it, the link alone can’t claim the gift.'));
  lockSwitch.addEventListener('change', () => {
    wordRow.hidden = !lockSwitch.checked;
    if (lockSwitch.checked) word.focus();
  });

  const errorSlot = h('div');
  const button = h('button', { class: 'btn btn-candy btn-lg btn-block', type: 'submit' });
  const updateButton = () => {
    button.replaceChildren(group ? 'Start group gift' : 'Create gift link', h('span', { class: 'sep' }, '·'), h('span', { class: 't-mono' }, `${formatNim(Math.round(amount * LUNA))} NIM`));
  };
  const update = () => {
    renderAmounts();
    renderPreview();
    updateButton();
  };

  const walletSlot = h('div', {}, h('button', { class: 'btn btn-candy btn-lg btn-block', disabled: true }, 'Connecting to your wallet…'));

  const form = h(
    'form',
    {
      class: 'panel-form',
      onSubmit: async (e: Event) => {
        e.preventDefault();
        errorSlot.replaceChildren();
        const value = Math.round(amount * LUNA);
        if (!(value >= LUNA / 100)) {
          errorSlot.append(errorBox('Pick an amount of at least 0.01 NIM.'));
          return;
        }
        if (lockSwitch.checked && !word.value.trim()) {
          errorSlot.append(errorBox('Type a secret word, or turn the lock off.'));
          return;
        }
        const done = busy(button, 'Check your wallet…');
        try {
          const secretWord = lockSwitch.checked ? word.value.trim() : undefined;
          const gift = await createGift(value, theme, message.value.trim(), { group, title: title.value.trim(), word: secretWord });
          resultPage(gift, theme, message.value.trim(), secretWord);
        } catch (err) {
          done();
          updateButton();
          if (err instanceof Cancelled) return;
          errorSlot.append(errorBox((err as Error).message));
        }
      },
    },
    h('div', { class: 'field-group' }, h('span', { class: 'label' }, 'Who pays'), modeSeg, groupExtra),
    h('div', { class: 'field-group' }, h('span', { class: 'label' }, 'Amount'), amountChips),
    h('div', { class: 'field-group' }, h('span', { class: 'label' }, 'Occasion'), occasionTiles),
    h(
      'div',
      { class: 'field-group' },
      h('label', { class: 'label', for: 'note' }, 'Note ', h('span', { class: 'label__hint' }, 'travels inside the link, never on the chain')),
      message,
    ),
    h(
      'div',
      { class: 'field-group' },
      h('label', { class: 'switch-row', for: 'lock' }, h('span', {}, h('span', { class: 'label', style: 'margin:0' }, 'Lock with a secret word'), h('span', { class: 'label__hint', id: 'lock-hint' }, 'Optional, for gifts you send in a group chat')), lockSwitch),
      wordRow,
    ),
    errorSlot,
    walletSlot,
  );

  getWallet().then((wallet) =>
    walletSlot.replaceChildren(
      ...(wallet
        ? [button, h('p', { class: 'hint center' }, 'First gift only: your wallet asks for one signature, so your gifts follow you to any phone.')]
        : [
            h(
              'div',
              { class: 'notice' },
              h('p', {}, 'Sending a gift needs your Nimiq Pay wallet.'),
              h('a', { class: 'btn btn-ink btn-lg btn-block', href: openInPayUrl('/') }, icon('wallet'), 'Open in Nimiq Pay'),
              link('/demo', 'See what your friend gets', 'btn btn-outline btn-block'),
            ),
          ]),
    ),
  );

  update();
  renderOccasions();

  mount(
    header('send'),
    h(
      'main',
      { class: 'page' },
      h(
        'section',
        { class: 'intro' },
        h('span', { class: 'eyebrow' }, h('span', { class: 'dot' }), 'For birthdays, thanks and first NIM'),
        h('h1', {}, 'Gift NIM ', h('span', { class: 'hl' }, 'with a link'), '.'),
        h('p', { class: 'lead' }, 'Pick an amount and send the link in any chat. Whoever opens it claims the NIM into their own wallet.'),
      ),
      previewSlot,
      form,
      trust('Giftlink never holds your NIM', 'Take back unclaimed gifts', 'No account'),
      h(
        'section',
        { class: 'how' },
        h('span', { class: 'eyebrow' }, 'How it works'),
        h(
          'div',
          { class: 'steps' },
          step('link', 'One payment, one address', 'Your NIM moves to a new address made only for this gift.'),
          step('shield', 'The key lives in the link', 'Nobody else holds it, Giftlink included.'),
          step('undo', 'Claimed, or back to you', 'Your friend taps Claim. If they never do, take it back from Sent.'),
        ),
      ),
    ),
  );
}

function step(ic: string, title: string, text: string) {
  return h('div', { class: 'tile' }, h('div', { class: 'icon-tile' }, icon(ic)), h('div', {}, h('p', { class: 't-title' }, title), h('p', {}, text)));
}

export function resultPage(gift: CreatedGift, theme: number, message: string, word?: string) {
  const occasion = OCCASIONS.find((o) => o.theme === theme) ?? OCCASIONS[0];
  const shareText = `I sent you ${formatNim(gift.value)} NIM (${occasion.label.toLowerCase()}). Open the link in Nimiq Pay to claim it:`;
  const status = h('p', { class: 'chain-status pending' }, h('span', { class: 'pulse' }), 'Confirming on the Nimiq chain…');
  const qr = h('div', { class: 'qr', html: renderSVG(gift.link, { border: 2 }) });
  const qrToggle = h(
    'button',
    {
      class: 'btn btn-outline',
      'aria-expanded': 'false',
      onClick: (e: Event) => {
        qr.classList.toggle('open');
        (e.currentTarget as HTMLButtonElement).setAttribute('aria-expanded', String(qr.classList.contains('open')));
      },
    },
    icon('qr'),
    'QR code',
  );

  const giftActions = [
    h('button', { class: `btn ${gift.chipLink ? 'btn-outline' : 'btn-candy'} btn-lg btn-block`, onClick: () => share(shareText, gift.link) }, icon('share'), gift.chipLink ? 'Share the gift link now' : 'Share the link'),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-outline', onClick: () => copy(gift.link, 'Gift link copied') }, icon('copy'), 'Copy link'), qrToggle),
    qr,
  ];

  mount(
    header('send'),
    h(
      'main',
      { class: 'page' },
      h(
        'section',
        { class: 'intro' },
        h('h1', { class: 't-h2' }, gift.chipLink ? 'Your group gift is started.' : 'Your gift is ready.'),
        h('p', { class: 'lead' }, gift.chipLink ? 'Ask friends to chip in. When everyone is in, send the gift link to the person it’s for.' : 'Send the link to the person it’s for. They claim it in Nimiq Pay.'),
      ),
      h('div', { class: 'preview' }, giftCard({ value: gift.value, theme, message: message || undefined })),
      status,
      gift.chipLink
        ? h(
            'section',
            { class: 'step-block' },
            h('span', { class: 'eyebrow' }, h('span', { class: 'dot' }), 'Step 1 · Collect'),
            h('p', { class: 't-small' }, 'Friends open this link in Nimiq Pay and add NIM. It holds no key, so it can’t be used to claim.'),
            h('button', { class: 'btn btn-candy btn-lg btn-block', onClick: () => share(`Chip in for ${occasion.label.toLowerCase()}! Add NIM to our group gift:`, gift.chipLink!) }, icon('share'), 'Share the chip-in link'),
            h('button', { class: 'btn btn-outline btn-block', onClick: () => copy(gift.chipLink!, 'Chip-in link copied') }, icon('copy'), 'Copy chip-in link'),
          )
        : null,
      gift.chipLink
        ? h(
            'section',
            { class: 'step-block' },
            h('span', { class: 'eyebrow' }, 'Step 2 · Give'),
            h('p', { class: 't-small' }, 'The gift link claims everything collected so far. You’ll also find it later under Sent.'),
            ...giftActions,
          )
        : h('div', {}, ...giftActions),
      word
        ? h('p', { class: 'notice warn' }, 'Locked with your secret word. Tell them the word separately; the link alone won’t open the gift.')
        : h('p', { class: 'notice warn' }, 'Anyone with the gift link can claim it, like cash.'),
      h('p', { class: 'center links' }, link('/', 'Send another gift'), h('span', { class: 'sep' }, '·'), link('/sent', 'See your gifts')),
    ),
  );

  if (gift.fundingHash) {
    const start = Date.now();
    const poll = async () => {
      try {
        const tx = await getTransaction(gift.fundingHash);
        if (tx?.blockNumber) {
          status.className = 'chain-status ok';
          status.replaceChildren(h('span', { class: 'pulse' }), 'On the Nimiq chain. ', h('a', { href: txUrl(gift.fundingHash), target: '_blank', rel: 'noopener' }, 'View payment'));
          return;
        }
      } catch {
        // not yet visible
      }
      if (Date.now() - start < 90_000) setTimeout(poll, 2000);
      else status.textContent = 'Still confirming. The link already works and becomes claimable as soon as the payment lands.';
    };
    poll();
  } else {
    status.textContent = 'Payment sent. It can take a few seconds to show on the chain.';
  }
}
