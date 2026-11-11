// A preview of the claim screen for people browsing outside Nimiq Pay.
// The card is an illustration and is labelled as one; no NIM moves here.
import { LUNA } from '../chain';
import { giftCard, icon, trust } from '../card';
import { h, link, mount } from '../ui';
import { header, openInPayUrl } from './shell';

export function demoPage() {
  mount(
    header('send'),
    h(
      'main',
      { class: 'page' },
      h('p', { class: 'notice' }, 'Example only. This is what your friend sees when they open a gift link. No NIM moves on this page.'),
      h(
        'section',
        { class: 'intro' },
        h('span', { class: 'eyebrow' }, h('span', { class: 'dot' }), 'Someone sent you NIM'),
        h('h1', {}, 'You got ', h('span', { class: 'hl' }, 'a gift'), '.'),
      ),
      h('div', { class: 'preview is-new' }, giftCard({ value: 25 * LUNA, theme: 6, message: 'Happy birthday, Ada. Coffee is on me.' })),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-candy btn-lg btn-block', disabled: true }, icon('wallet'), 'Claim 25 NIM'), h('button', { class: 'btn btn-outline btn-block', disabled: true }, icon('sprout'), 'Claim into my stake')),
      trust('Checked on the Nimiq chain', 'Giftlink never holds the NIM'),
      h(
        'section',
        { class: 'how' },
        h('span', { class: 'eyebrow' }, 'What happens when they tap Claim'),
        h(
          'div',
          { class: 'steps' },
          h('div', { class: 'tile' }, h('div', { class: 'icon-tile' }, icon('shield')), h('div', {}, h('p', { class: 't-title' }, 'Their phone signs the claim'), h('p', {}, 'The key in the link signs a transfer to their own wallet. No server is involved.'))),
          h('div', { class: 'tile' }, h('div', { class: 'icon-tile' }, icon('link')), h('div', {}, h('p', { class: 't-title' }, 'The Nimiq chain confirms it'), h('p', {}, 'About a second later the NIM is theirs, with a receipt and explorer links.'))),
        ),
      ),
      h('a', { class: 'btn btn-ink btn-lg btn-block', href: openInPayUrl('/') }, icon('wallet'), 'Send a real gift in Nimiq Pay'),
      h('p', { class: 'center links' }, link('/', 'Back')),
    ),
  );
}
