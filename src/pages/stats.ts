// Public usage page, read straight from the Nimiq chain: every claim leaves a 1-luna
// marker in the registry address, so anyone can recount these numbers.
import {
  addrUrl,
  formatNim,
  getTransactions,
  memoText,
  REGISTRY_MEMO,
  registryKey,
  sameAddr,
  shortAddr,
  txUrl,
  type ChainTx,
} from '../chain';
import { loadNimiq } from '../nimiq';
import { errorBox, h, link, mount, spinner, timeAgo } from '../ui';
import { header } from './shell';

export async function statsPage() {
  mount(header('send'), h('main', { class: 'page' }, spinner('Counting gifts on the Nimiq chain…')));
  try {
    const N = await loadNimiq();
    const registry = registryKey(N).address;
    const marks = (await getTransactions(registry, 500)).filter((t) => sameAddr(t.to, registry) && memoText(t.recipientData || t.senderData).startsWith(REGISTRY_MEMO));
    const recipients = new Set<string>();
    const senders = new Set<string>();
    let total = 0;
    const rows: { gift: string; to: string; value: number; at: number; hash: string }[] = [];
    // Read each claimed gift's own history: who funded it, and how much was claimed.
    const details = await Promise.all(marks.map((m) => getTransactions(m.from, 20).catch(() => [] as ChainTx[])));
    marks.forEach((m, i) => {
      const to = memoText(m.recipientData || m.senderData).slice(REGISTRY_MEMO.length).trim();
      const txs = details[i];
      const claim = txs.find((t) => sameAddr(t.from, m.from) && !sameAddr(t.to, registry));
      txs.filter((t) => sameAddr(t.to, m.from)).forEach((t) => senders.add(t.from.replace(/\s/g, '')));
      if (to) recipients.add(to.toUpperCase());
      total += claim?.value ?? 0;
      rows.push({ gift: m.from, to: claim?.to ?? to, value: claim?.value ?? 0, at: m.timestamp, hash: claim?.hash ?? m.hash });
    });
    const wallets = new Set([...recipients, ...senders]);
    rows.sort((a, b) => b.at - a.at);

    mount(
      header('send'),
      h(
        'main',
        { class: 'page' },
        h('section', { class: 'intro' }, h('span', { class: 'eyebrow' }, h('span', { class: 'dot' }), 'Live from the Nimiq chain'), h('h1', { class: 't-h2' }, 'Giftlink in numbers.')),
        h(
          'div',
          { class: 'stats' },
          stat(String(wallets.size), 'wallets'),
          stat(String(marks.length), 'gifts claimed'),
          stat(formatNim(total), 'NIM gifted'),
        ),
        h(
          'p',
          { class: 't-small' },
          `${recipients.size} people claimed gifts from ${senders.size} senders. Every claim leaves a tiny marker at a public address, so you can recount this yourself: `,
          h('a', { href: addrUrl(registry), target: '_blank', rel: 'noopener' }, shortAddr(registry)),
          '.',
        ),
        h(
          'ul',
          { class: 'gift-list' },
          ...rows.slice(0, 50).map((r) =>
            h(
              'li',
              { class: 'gift-row' },
              h(
                'div',
                { class: 'row-main' },
                h('div', { class: 'row-title' }, `${formatNim(r.value)} NIM claimed`),
                h(
                  'div',
                  { class: 'row-status' },
                  'by ',
                  h('a', { href: addrUrl(r.to), target: '_blank', rel: 'noopener' }, shortAddr(r.to)),
                  ' · ',
                  h('a', { href: txUrl(r.hash), target: '_blank', rel: 'noopener' }, timeAgo(r.at)),
                ),
              ),
            ),
          ),
        ),
        link('/', 'Send a gift', 'btn btn-candy btn-lg btn-block'),
      ),
    );
  } catch (e) {
    mount(header('send'), h('main', { class: 'page' }, errorBox((e as Error).message, () => statsPage())));
  }
}

function stat(value: string, label: string) {
  return h('div', { class: 'stat' }, h('span', { class: 'stat__value t-mono' }, value), h('span', { class: 'stat__label' }, label));
}
