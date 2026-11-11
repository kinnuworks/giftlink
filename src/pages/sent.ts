import { addrUrl, formatNim, occasionByTheme, shortAddr, txUrl } from '../chain';
import { listSentGifts, takeBack, type SentGift } from '../gifts';
import { Cancelled, getWallet } from '../wallet';
import { busy, copy, errorBox, h, link, mount, spinner, timeAgo } from '../ui';
import { header, openInPayUrl } from './shell';
import { art } from '../card';

export async function sentPage() {
  mount(header('sent'), h('main', { class: 'page' }, spinner('Connecting to your wallet…')));
  const wallet = await getWallet();
  if (!wallet) {
    return mount(
      header('sent'),
      h(
        'main',
        { class: 'page' },
        h('h1', { class: 't-h2' }, 'Your gifts.'),
        h('p', { class: 'lead' }, 'Open Giftlink in Nimiq Pay to see the gifts you sent and take back any that weren’t claimed.'),
        h('a', { class: 'btn btn-candy btn-lg btn-block', href: openInPayUrl('/sent') }, 'Open in Nimiq Pay'),
      ),
    );
  }
  mount(header('sent'), h('main', { class: 'page' }, h('h1', { class: 't-h2' }, 'Your gifts.'), spinner('Reading your gifts from the Nimiq chain…')));
  let gifts: SentGift[];
  try {
    gifts = await listSentGifts();
  } catch (e) {
    if (e instanceof Cancelled) {
      return mount(
        header('sent'),
        h(
          'main',
          { class: 'page' },
          h('h1', { class: 't-h2' }, 'Your gifts.'),
          h('p', { class: 'lead' }, 'Giftlink needs one signature to find your gifts. It doesn’t move any money.'),
          h('button', { class: 'btn btn-candy btn-lg btn-block', onClick: () => sentPage() }, 'Find my gifts'),
        ),
      );
    }
    return mount(header('sent'), h('main', { class: 'page' }, h('h1', { class: 't-h2' }, 'Your gifts.'), errorBox((e as Error).message, () => sentPage())));
  }

  const waiting = gifts.filter((g) => g.state.kind === 'ready');
  const totalWaiting = waiting.reduce((s, g) => s + (g.state.kind === 'ready' ? g.state.balance : 0), 0);

  mount(
    header('sent'),
    h(
      'main',
      { class: 'page' },
      h('h1', { class: 't-h2' }, 'Your gifts.'),
      gifts.length
        ? h(
            'div',
            { class: 'stats' },
            stat(String(gifts.length), 'sent'),
            stat(String(gifts.filter((g) => g.state.kind === 'claimed' && !g.state.takenBack).length), 'claimed'),
            stat(formatNim(totalWaiting), 'NIM waiting'),
          )
        : h('p', { class: 'lead' }, 'Gifts you send show up here, with who claimed them.'),
      h('ul', { class: 'gift-list' }, ...gifts.map(row)),
      link('/', gifts.length ? 'Send another gift' : 'Send your first gift', 'btn btn-candy btn-lg btn-block'),
      h('p', { class: 'hint center' }, 'This list is rebuilt from the Nimiq chain, so it works on any phone with your wallet.'),
    ),
  );
}

function row(g: SentGift) {
  const occasion = occasionByTheme(g.theme);
  const status = h('div', { class: 'row-status' });
  const actions = h('div', { class: 'row-actions' });
  const errorSlot = h('div');

  if (g.state.kind === 'ready') {
    status.append(h('span', { class: 'pill wait' }, 'Waiting to be claimed'));
    const back = h('button', { class: 'btn btn-sm btn-outline' }, 'Take back');
    back.addEventListener('click', async () => {
      if (!confirm(`Take back ${formatNim(g.state.kind === 'ready' ? g.state.balance : 0)} NIM? The link will stop working.`)) return;
      errorSlot.replaceChildren();
      const done = busy(back, 'Taking back…');
      try {
        const tx = await takeBack(g);
        status.replaceChildren(
          h('span', { class: 'pill back' }, 'Taken back'),
          ' ',
          h('a', { href: txUrl(tx.hash), target: '_blank', rel: 'noopener' }, 'transaction'),
        );
        actions.replaceChildren();
      } catch (e) {
        done();
        if (!(e instanceof Cancelled)) errorSlot.append(errorBox((e as Error).message));
      }
    });
    if (g.link) actions.append(h('button', { class: 'btn btn-sm btn-outline', onClick: () => copy(g.link, 'Link copied') }, 'Copy link'));
    actions.append(back);
  } else if (g.state.kind === 'claimed') {
    const s = g.state;
    status.append(
      s.takenBack
        ? h('span', { class: 'pill back' }, 'Taken back')
        : h(
            'span',
            { class: 'pill ok' },
            'Claimed by ',
            h('a', { href: addrUrl(s.claimedBy), target: '_blank', rel: 'noopener' }, shortAddr(s.claimedBy)),
          ),
      ' ',
      h('a', { href: txUrl(s.claim.hash), target: '_blank', rel: 'noopener' }, timeAgo(s.claim.timestamp)),
    );
  } else {
    status.append(h('span', { class: 'pill wait' }, 'Payment not on chain yet'));
  }

  return h(
    'li',
    { class: 'gift-row' },
    art(occasion.id, 'row-art'),
    h(
      'div',
      { class: 'row-main' },
      h('div', { class: 'row-title' }, `${formatNim(g.value)} NIM · ${occasion.label}`),
      g.message ? h('div', { class: 'row-note' }, g.message) : null,
      h('div', { class: 'row-time' }, `Sent ${timeAgo(g.createdAt)}`),
      status,
      actions,
      errorSlot,
    ),
  );
}

function stat(value: string, label: string) {
  return h('div', { class: 'stat' }, h('span', { class: 'stat__value t-mono' }, value), h('span', { class: 'stat__label' }, label));
}
