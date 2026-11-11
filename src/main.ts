import './style.css';
import { createPage } from './pages/create';
import { claimPage } from './pages/claim';
import { sentPage } from './pages/sent';
import { vouchersPage } from './pages/vouchers';
import { demoPage } from './pages/demo';
import { chipInPage } from './pages/chipin';
import { thumbPage } from './pages/thumb';
import { errorBox, h, mount } from './ui';
import { header } from './pages/shell';
import { loadNimiq } from './nimiq';
import { getWallet } from './wallet';
import { setNetwork } from './chain';
import { getHostNetwork } from '@nimiq/mini-app-sdk';

// Nimiq Pay's testnet mode (or ?net=test while developing) switches to testnet.
if (getHostNetwork() === 'testnet' || new URLSearchParams(location.search).get('net') === 'test') setNetwork('test');

// Start loading the wallet bridge and the signing code right away, in parallel.
getWallet();
loadNimiq().catch(() => undefined);

async function route() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const hash = location.hash.slice(1);
  try {
    if (path === '/c' || path === '/claim' || path === '/cashlink') {
      if (!hash) return createPage();
      return await claimPage(hash);
    }
    if (path === '/demo') return demoPage();
    if (path === '/thumb') return thumbPage();
    if (path === '/j') return hash ? await chipInPage(hash) : createPage();
    if (path === '/sent') return await sentPage();
    if (path.startsWith('/vouchers')) return await vouchersPage(path.split('/')[2]);
    // A Hub-style cashlink pasted at the root still works.
    if (hash.length > 40) return await claimPage(hash);
    return await createPage();
  } catch (e) {
    console.error(e);
    mount(header('send'), h('main', { class: 'page' }, errorBox('Something went wrong loading this page.', () => route())));
  }
}

window.addEventListener('popstate', route);
window.addEventListener('hashchange', route);
route();
