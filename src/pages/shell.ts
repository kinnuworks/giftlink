import { h, link } from '../ui';
import { IS_TESTNET } from '../chain';

export function header(active: 'send' | 'sent' | 'vouchers' | 'claim') {
  const item = (id: typeof active, path: string, text: string) => {
    const a = link(path, text, 'nav__item');
    if (active === id) a.setAttribute('aria-current', 'page');
    return a;
  };
  const brand = link('/', '', 'nav__brand');
  const icon = h('img', { class: 'app-icon', src: '/img/icon.png', alt: '', width: 28, height: 28 });
  icon.addEventListener('error', () => icon.replaceWith(h('span', { class: 'app-icon app-icon--fallback', 'aria-hidden': 'true' })));
  brand.append(icon, h('span', {}, 'Giftlink'));
  return h(
    'header',
    { class: 'appbar' },
    h(
      'div',
      { class: 'appbar__bar' },
      brand,
      IS_TESTNET ? h('span', { class: 'net-badge' }, 'Testnet') : null,
      h('nav', { class: 'appbar__nav', 'aria-label': 'Main' }, item('send', '/', 'Send'), item('sent', '/sent', 'Gifts'), item('vouchers', '/vouchers', 'Vouchers')),
    ),
  );
}

// Opens this page inside Nimiq Pay. Without the app installed, the phone shows
// Nimiq Pay's own install page.
export function openInPayUrl(path: string, hash = '') {
  return `https://nimpay.app/miniapps/open/${location.host}${path}${hash ? '#' + hash : ''}`;
}
