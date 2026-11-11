import { h, link } from '../ui';

export function header(active: 'send' | 'sent' | 'vouchers' | 'claim') {
  const item = (id: typeof active, path: string, text: string) =>
    link(path, text, `nav-item ${active === id ? 'on' : ''}`);
  return h(
    'header',
    { class: 'top' },
    link('/', 'Giftlink', 'brand'),
    h('nav', { 'aria-label': 'Main' }, item('send', '/', 'Send'), item('sent', '/sent', 'Sent'), item('vouchers', '/vouchers', 'Vouchers')),
  );
}

// Opens this page inside Nimiq Pay. Without the app installed, the phone shows
// Nimiq Pay's own install page.
export function openInPayUrl(path: string, hash = '') {
  return `https://nimpay.app/miniapps/open/${location.host}${path}${hash ? '#' + hash : ''}`;
}
