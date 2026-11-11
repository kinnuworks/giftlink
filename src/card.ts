// The gift card: the one colourful object in the app. Used for the live preview,
// the ready screen and the claim screen.
import { addrUrl, formatNim, occasionByTheme, shortAddr, txUrl } from './chain';
import { h } from './ui';

export interface CardOpts {
  value: number; // luna
  theme: number;
  message?: string;
  from?: string;
  fundingHash?: string;
  givers?: number;
  size?: 'lg' | 'md';
}

export function art(id: string, cls = 'gcard__art') {
  const img = h('img', { class: cls, src: `/img/${id}.png`, alt: '', width: 160, height: 160, decoding: 'async' });
  img.addEventListener('error', () => img.replaceWith(h('div', { class: `${cls} ${cls}--fallback`, 'aria-hidden': 'true' })));
  return img;
}

export function giftCard(o: CardOpts) {
  const occ = occasionByTheme(o.theme);
  const amount = formatNim(o.value);
  return h(
    'div',
    { class: `gcard gcard--${o.size ?? 'lg'}`, 'data-occ': occ.id },
    h('div', { class: 'gcard__top' }, h('span', { class: 'gcard__brand' }, 'Giftlink'), h('span', { class: 'gcard__occ' }, occ.label)),
    art(occ.id),
    h('div', { class: 'gcard__amount' }, amount, h('span', { class: 'gcard__unit' }, 'NIM')),
    o.message ? h('p', { class: 'gcard__note' }, o.message) : null,
    o.from || o.fundingHash
      ? h(
          'div',
          { class: 'gcard__meta' },
          o.givers && o.givers > 1
            ? h('span', {}, `From ${o.givers} people`)
            : o.from
              ? h('span', {}, 'From ', h('a', { href: addrUrl(o.from), target: '_blank', rel: 'noopener' }, shortAddr(o.from)))
              : null,
          o.fundingHash
            ? h(
                'a',
                { class: 'gcard__check', href: txUrl(o.fundingHash), target: '_blank', rel: 'noopener' },
                checkIcon(),
                'Checked on the Nimiq chain',
              )
            : null,
        )
      : null,
  );
}

export function checkIcon() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
  return s;
}

// Small inline icons in Lucide's style.
const ICONS: Record<string, string> = {
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  wallet: '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  sprout: '<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h3v-3"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
};

export function icon(name: keyof typeof ICONS | string) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.75');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] ?? '';
  return s;
}

export function trust(...items: string[]) {
  return h('p', { class: 'trust' }, ...items.map((t) => h('span', {}, t)));
}
