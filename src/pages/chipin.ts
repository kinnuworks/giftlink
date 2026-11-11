// Friends open a chip-in link and add NIM to a group gift. The link holds only the
// gift's address, so it can collect but never claim.
import {
  CHIP_MEMO,
  decodeChipIn,
  formatNim,
  getAccount,
  getTransactions,
  LUNA,
  memoText,
  sameAddr,
  shortAddr,
  addrUrl,
  txUrl,
  type ChainTx,
  type ChipIn,
} from '../chain';
import { loadNimiq } from '../nimiq';
import { Cancelled, call, getWallet } from '../wallet';
import { busy, errorBox, h, link, mount, spinner } from '../ui';
import { giftCard, icon, trust } from '../card';
import { header, openInPayUrl } from './shell';

const CHIP_AMOUNTS = [2, 5, 10, 25];

export async function chipInPage(encoded: string) {
  mount(header('send'), h('main', { class: 'page' }, spinner('Opening the group gift…')));
  let c: ChipIn;
  try {
    c = decodeChipIn(encoded);
  } catch (e) {
    return mount(header('send'), h('main', { class: 'page' }, errorBox((e as Error).message)));
  }

  let balance = 0;
  let txs: ChainTx[] = [];
  try {
    [balance, txs] = await Promise.all([getAccount(c.address).then((a) => a.balance), getTransactions(c.address, 100)]);
  } catch (e) {
    return mount(header('send'), h('main', { class: 'page' }, errorBox((e as Error).message, () => chipInPage(encoded))));
  }
  const incoming = txs.filter((t) => sameAddr(t.to, c.address)).sort((a, b) => a.blockNumber - b.blockNumber);
  const delivered = txs.some((t) => sameAddr(t.from, c.address));
  const total = incoming.reduce((s, t) => s + t.value, 0);
  const wallet = await getWallet();

  const people = h(
    'ul',
    { class: 'chip-list' },
    ...incoming.map((t, i) => {
      const memo = memoText(t.recipientData || t.senderData);
      const name = memo.startsWith(CHIP_MEMO) ? memo.slice(CHIP_MEMO.length).replace(/^[:\s·-]+/, '').trim() : i === 0 ? 'Organiser' : '';
      return h(
        'li',
        {},
        h('span', { class: 'avatar' }, (name || 'N').slice(0, 1).toUpperCase()),
        h('span', { class: 'chip-list__who' }, name || shortAddr(t.from), h('small', {}, h('a', { href: txUrl(t.hash), target: '_blank', rel: 'noopener' }, shortAddr(t.from)))),
        h('span', { class: 'chip-list__amt t-mono' }, `${formatNim(t.value)} NIM`),
      );
    }),
  );

  const body: (Node | null)[] = [
    h(
      'section',
      { class: 'intro' },
      h('span', { class: 'eyebrow' }, h('span', { class: 'dot' }), 'Group gift'),
      h('h1', { class: 't-h2' }, delivered ? (c.title ? `The gift for ${c.title} was sent.` : 'This group gift was sent.') : c.title ? `Chip in for ${c.title}.` : 'Chip in for a group gift.'),
      h('p', { class: 'lead' }, delivered ? `${incoming.length} ${incoming.length === 1 ? 'person' : 'people'} chipped in ${formatNim(total)} NIM.` : `${incoming.length} ${incoming.length === 1 ? 'person has' : 'people have'} added NIM so far. Everyone’s part goes into one gift.`),
    ),
    h('div', { class: 'preview' }, giftCard({ value: delivered ? total : balance, theme: c.theme, message: c.title || undefined })),
  ];

  if (delivered) {
    body.push(people, link('/', 'Start a gift of your own', 'btn btn-candy btn-lg btn-block'));
    return mount(header('send'), h('main', { class: 'page' }, ...body));
  }

  let amount = 5;
  const errorSlot = h('div');
  const name = h('input', { type: 'text', maxLength: 24, placeholder: 'Your name (shown to the group)', class: 'field', 'aria-label': 'Your name' });
  const chips = h('div', { class: 'chips amount-grid', role: 'group', 'aria-label': 'Amount' });
  const btn = h('button', { class: 'btn btn-candy btn-lg btn-block', type: 'submit' });
  const render = () => {
    chips.replaceChildren(
      ...CHIP_AMOUNTS.map((a) =>
        h('button', { type: 'button', class: 'chip chip--lg', 'aria-pressed': String(a === amount), onClick: () => ((amount = a), render()) }, h('span', { class: 't-mono' }, String(a)), ' NIM'),
      ),
    );
    btn.replaceChildren(icon('wallet'), `Chip in ${amount} NIM`);
  };
  render();

  if (wallet) {
    body.push(
      h(
        'form',
        {
          class: 'panel-form',
          onSubmit: async (e: Event) => {
            e.preventDefault();
            errorSlot.replaceChildren();
            const done = busy(btn, 'Check your wallet…');
            try {
              const who = name.value.trim().replace(/[^\p{L}\p{N} .'-]/gu, '').slice(0, 24);
              const serialized = await call(() =>
                wallet.sendBasicTransactionWithData({ recipient: c.address, value: amount * LUNA, data: `${CHIP_MEMO}${who ? ': ' + who : ''}` }),
              );
              let hash = '';
              try {
                hash = (await loadNimiq()).Transaction.fromAny(serialized).hash();
              } catch {
                hash = /^[0-9a-f]{64}$/i.test(serialized) ? serialized : '';
              }
              thanksPage(c, amount * LUNA, hash, encoded);
            } catch (err) {
              done();
              render();
              if (!(err instanceof Cancelled)) errorSlot.append(errorBox((err as Error).message));
            }
          },
        },
        h('div', { class: 'field-group' }, h('span', { class: 'label' }, 'Your part'), chips),
        h('div', { class: 'field-group' }, name),
        errorSlot,
        btn,
      ),
    );
  } else {
    body.push(h('a', { class: 'btn btn-ink btn-lg btn-block', href: openInPayUrl('/j', encoded) }, icon('wallet'), 'Open in Nimiq Pay to chip in'));
  }
  body.push(
    h('section', { class: 'how' }, h('span', { class: 'eyebrow' }, `Who's in · ${formatNim(total)} NIM`), people),
    trust('Your NIM goes straight to the gift', 'Checked on the Nimiq chain'),
    h('p', { class: 'hint center' }, 'Your name and amount are written to the Nimiq chain with your payment, so the group can see who chipped in.'),
  );
  mount(header('send'), h('main', { class: 'page' }, ...body));
}

function thanksPage(c: ChipIn, value: number, hash: string, encoded: string) {
  mount(
    header('send'),
    h(
      'main',
      { class: 'page' },
      h('section', { class: 'intro' }, h('h1', { class: 't-h2' }, `You chipped in ${formatNim(value)} NIM.`), h('p', { class: 'lead' }, 'It went straight into the group gift. The organiser sends it when everyone is in.')),
      hash ? h('p', { class: 'chain-status ok' }, h('span', { class: 'pulse' }), 'Sent. ', h('a', { href: txUrl(hash), target: '_blank', rel: 'noopener' }, 'View payment')) : null,
      h('button', { class: 'btn btn-outline btn-block', onClick: () => chipInPage(encoded) }, 'See the group'),
      link('/', 'Send a gift of your own', 'btn btn-candy btn-lg btn-block'),
      h('p', { class: 'hint center' }, h('a', { href: addrUrl(c.address), target: '_blank', rel: 'noopener' }, 'The gift’s address on the explorer')),
    ),
  );
}
