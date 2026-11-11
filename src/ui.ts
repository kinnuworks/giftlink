// Tiny DOM helpers. No framework: the app is a handful of screens.
type Child = Node | string | number | false | null | undefined;
type Attrs = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== false && c != null) el.append(c instanceof Node ? c : String(c));
  return el;
}

export function mount(...nodes: Child[]) {
  const app = document.getElementById('app')!;
  app.replaceChildren(...nodes.filter((n): n is Node | string => n !== false && n != null).map((n) => (n instanceof Node ? n : String(n))));
  window.scrollTo(0, 0);
}

export function spinner(text: string) {
  return h('div', { class: 'state' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('p', {}, text));
}

export function errorBox(message: string, retry?: () => void) {
  return h(
    'div',
    { class: 'notice error', role: 'alert' },
    h('p', {}, message),
    retry ? h('button', { class: 'btn secondary', onClick: retry }, 'Try again') : null,
  );
}

export function toast(text: string) {
  const t = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

export async function copy(text: string, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
    return true;
  } catch {
    // Some in-app browsers block the clipboard API: fall back to a selection copy.
    const ta = h('textarea', { readonly: true }, text);
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    toast(ok ? label : 'Press and hold the link to copy it');
    return ok;
  }
}

export async function share(text: string, url: string) {
  if (navigator.share) {
    try {
      await navigator.share({ text, url });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  await copy(`${text} ${url}`, 'Link copied. Paste it in any chat.');
}

export function busy(btn: HTMLButtonElement, text: string) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = text;
  return () => {
    btn.disabled = false;
    btn.textContent = old;
  };
}

export function navigate(path: string) {
  history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function link(path: string, text: string, cls = '') {
  return h(
    'a',
    {
      href: path,
      class: cls,
      onClick: (e: MouseEvent) => {
        e.preventDefault();
        navigate(path);
      },
    },
    text,
  );
}

export function timeAgo(ms: number) {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr} h ago`;
  const d = Math.round(hr / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
