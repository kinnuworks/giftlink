import { encode, renderSVG } from 'uqr';
import { formatNim, LUNA, occasionByTheme, shortAddr, addrUrl } from '../chain';
import {
  fundBatch,
  listBatches,
  MAX_VOUCHERS,
  reclaimBatch,
  splitBatch,
  voucherStatuses,
  type BatchInfo,
  type VoucherStatus,
} from '../vouchers';
import { Cancelled, getWallet } from '../wallet';
import { busy, copy, errorBox, h, link, mount, navigate, spinner, timeAgo } from '../ui';
import { header, openInPayUrl } from './shell';
import { icon } from '../card';

export async function vouchersPage(id?: string) {
  mount(header('vouchers'), h('main', { class: 'page' }, spinner('Connecting to your wallet…')));
  const wallet = await getWallet();
  if (!wallet) {
    return mount(
      header('vouchers'),
      h(
        'main',
        { class: 'page' },
        h('h1', { class: 't-h2' }, 'NIM vouchers for your meetup.'),
        h('p', { class: 'lead' }, 'One payment becomes a sheet of QR codes. Each one holds NIM. Take back whatever nobody claims.'),
        h('a', { class: 'btn btn-candy btn-lg btn-block', href: openInPayUrl('/vouchers') }, 'Open in Nimiq Pay'),
      ),
    );
  }
  if (id !== undefined && id !== '') return batchPage(Number(id));
  return newBatchPage();
}

async function newBatchPage() {
  mount(header('vouchers'), h('main', { class: 'page' }, spinner('Loading your vouchers…')));
  let batches: BatchInfo[] = [];
  let listError = '';
  try {
    batches = await listBatches();
  } catch (e) {
    if (!(e instanceof Cancelled)) listError = (e as Error).message;
  }

  const count = h('input', { type: 'number', min: '1', max: String(MAX_VOUCHERS), value: '10', inputmode: 'numeric', 'aria-label': 'Number of vouchers' });
  const each = h('input', { type: 'number', min: '0.01', step: 'any', value: '5', inputmode: 'decimal', 'aria-label': 'NIM per voucher' });
  const label = h('input', { type: 'text', maxLength: 40, placeholder: 'Event name, e.g. Lagos Nimiq meetup', 'aria-label': 'Event name' });
  const total = h('p', { class: 'total' });
  const errorSlot = h('div');
  const btn = h('button', { class: 'btn btn-candy btn-lg btn-block', type: 'submit' }, 'Pay and make vouchers');
  const update = () => {
    const c = Math.floor(Number(count.value) || 0);
    const v = Number(each.value) || 0;
    total.textContent = c > 0 && v > 0 ? `Total: ${formatNim(Math.round(c * v * LUNA))} NIM for ${c} voucher${c === 1 ? '' : 's'}` : '';
  };
  count.addEventListener('input', update);
  each.addEventListener('input', update);
  update();

  mount(
    header('vouchers'),
    h(
      'main',
      { class: 'page' },
      h('h1', { class: 't-h2' }, 'NIM vouchers for your meetup.'),
      h('p', { class: 'lead' }, 'One payment becomes a sheet of QR codes. Each one holds NIM. Take back whatever nobody claims.'),
      h(
        'form',
        {
          class: 'panel-form',
          onSubmit: async (e: Event) => {
            e.preventDefault();
            errorSlot.replaceChildren();
            const c = Math.floor(Number(count.value));
            const v = Math.round(Number(each.value) * LUNA);
            if (!(c >= 1 && c <= MAX_VOUCHERS)) return errorSlot.append(errorBox(`Make between 1 and ${MAX_VOUCHERS} vouchers.`));
            if (!(v >= LUNA / 100)) return errorSlot.append(errorBox('Each voucher needs at least 0.01 NIM.'));
            const done = busy(btn, 'Check your wallet…');
            try {
              const batch = await fundBatch(c, v, label.value.trim(), 1);
              navigate(`/vouchers/${batch.index}`);
            } catch (err) {
              done();
              if (!(err instanceof Cancelled)) errorSlot.append(errorBox((err as Error).message));
            }
          },
        },
        h('label', { class: 'label' }, 'How many vouchers'),
        count,
        h('label', { class: 'label' }, 'NIM on each voucher'),
        each,
        h('label', { class: 'label' }, 'Event name (printed on the sheet)'),
        label,
        total,
        errorSlot,
        btn,
        h('p', { class: 'hint' }, `Up to ${MAX_VOUCHERS} vouchers per sheet. Each one has its own key, printed in its QR code. Giftlink never holds the NIM.`),
      ),
      listError ? errorBox(listError) : null,
      batches.length
        ? h(
            'section',
            {},
            h('h2', {}, 'Your voucher sheets'),
            h(
              'ul',
              { class: 'gift-list' },
              ...batches.map((b) =>
                h(
                  'li',
                  { class: 'gift-row' },
                  h('div', { class: 'icon-tile' }, icon('ticket')),
                  h(
                    'div',
                    { class: 'row-main' },
                    h('div', { class: 'row-title' }, `${b.count} × ${formatNim(b.value)} NIM${b.label ? ' · ' + b.label : ''}`),
                    h('div', { class: 'row-time' }, `Made ${timeAgo(b.createdAt)}`),
                    link(`/vouchers/${b.index}`, 'Open sheet', 'btn btn-sm btn-outline'),
                  ),
                ),
              ),
            ),
          )
        : null,
    ),
  );
}

async function batchPage(index: number) {
  mount(header('vouchers'), h('main', { class: 'page' }, spinner('Loading the voucher sheet…')));
  let batch: BatchInfo | undefined;
  try {
    batch = (await listBatches()).find((b) => b.index === index);
  } catch (e) {
    return mount(header('vouchers'), h('main', { class: 'page' }, errorBox((e as Error).message, () => batchPage(index))));
  }
  if (!batch) return mount(header('vouchers'), h('main', { class: 'page' }, errorBox('This voucher sheet was not found for your wallet.'), link('/vouchers', 'Back to vouchers', 'btn btn-outline btn-block')));

  const progress = h('p', { class: 'status pending' }, 'Making your vouchers on the Nimiq chain…');
  mount(header('vouchers'), h('main', { class: 'page' }, h('h1', { class: 't-h2' }, 'Making vouchers.'), progress));
  try {
    await splitBatch(batch, (done, total) => (progress.textContent = `Making your vouchers on the Nimiq chain… ${done} of ${total}`));
  } catch (e) {
    const cont = h('button', { class: 'btn btn-candy btn-lg btn-block', onClick: () => batchPage(index) }, 'Continue');
    return mount(header('vouchers'), h('main', { class: 'page' }, h('h1', { class: 't-h2' }, 'Almost there.'), errorBox((e as Error).message), cont));
  }
  renderSheet(batch);
}

async function renderSheet(batch: BatchInfo) {
  mount(header('vouchers'), h('main', { class: 'page' }, spinner('Checking which vouchers were claimed…')));
  let data: Awaited<ReturnType<typeof voucherStatuses>>;
  try {
    data = await voucherStatuses(batch);
  } catch (e) {
    return mount(header('vouchers'), h('main', { class: 'page' }, errorBox((e as Error).message, () => renderSheet(batch))));
  }
  const claimed = data.vouchers.filter((v) => v.claimedBy);
  const open = data.vouchers.filter((v) => v.balance > 0);
  const errorSlot = h('div');
  const reclaim = h('button', { class: 'btn btn-outline btn-block' }, `Take back ${open.length} unclaimed`);
  reclaim.disabled = open.length === 0 && data.fundingBalance === 0;
  reclaim.addEventListener('click', async () => {
    if (!confirm('Take back every unclaimed voucher? Their QR codes will stop working.')) return;
    errorSlot.replaceChildren();
    const done = busy(reclaim, 'Taking back…');
    try {
      const total = await reclaimBatch(batch, (n) => (reclaim.textContent = `Taking back… ${n} of ${open.length}`));
      alert(`${formatNim(total)} NIM is back in your wallet.`);
      renderSheet(batch);
    } catch (e) {
      done();
      if (!(e instanceof Cancelled)) errorSlot.append(errorBox((e as Error).message));
    }
  });

  const title = batch.label || 'NIM vouchers';
  mount(
    header('vouchers'),
    h(
      'main',
      { class: 'page wide' },
      h('h1', { class: 't-h2' }, title),
      h('p', { class: 'lead' }, `${batch.count} vouchers × ${formatNim(batch.value)} NIM · ${claimed.length} claimed · ${open.length} waiting`),
      h(
        'div',
        { class: 'row-actions' },
        h('button', { class: 'btn btn-candy', onClick: () => downloadSheet(batch, data.vouchers) }, 'Download sheet (PNG)'),
        h('button', { class: 'btn btn-outline btn-block', onClick: () => copy(data.vouchers.filter((v) => v.balance > 0).map((v) => v.link).join('\n'), 'All open voucher links copied') }, 'Copy all links'),
        reclaim,
      ),
      errorSlot,
      h('p', { class: 'hint' }, 'To print: download the sheet, or open this page on a computer with your wallet. Anyone holding a voucher can claim it, like cash.'),
      h('div', { class: 'sheet' }, ...data.vouchers.map((v) => voucherCard(batch, v))),
      link('/vouchers', 'Back to vouchers', 'btn btn-outline btn-block'),
    ),
  );
}

function voucherCard(batch: BatchInfo, v: VoucherStatus) {
  const used = !!v.claimedBy && v.balance === 0;
  return h(
    'div',
    { class: `voucher ${used ? 'used' : ''}` },
    h('div', { class: 'voucher-amount' }, `${formatNim(batch.value)} NIM`),
    h('div', { class: 'qr', html: renderSVG(v.link, { border: 1 }) }),
    h('div', { class: 'voucher-label' }, used ? 'Claimed' : `#${v.k + 1} · Scan to claim`),
    used && v.claimedBy ? h('a', { class: 'voucher-by', href: addrUrl(v.claimedBy), target: '_blank', rel: 'noopener' }, shortAddr(v.claimedBy)) : null,
  );
}

// Draws the sheet on a canvas so it can be saved as one image and printed anywhere.
function downloadSheet(batch: BatchInfo, vouchers: VoucherStatus[]) {
  const cols = 3;
  const cell = 360;
  const pad = 40;
  const rows = Math.ceil(vouchers.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell + pad * 2;
  canvas.height = rows * (cell + 60) + pad * 2 + 80;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 36px system-ui, sans-serif';
  ctx.fillText(batch.label || 'NIM vouchers', pad, pad + 36);
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillText(`Scan with your phone camera, then claim in Nimiq Pay · ${occasionByTheme(batch.theme).emoji}`, pad, pad + 70);
  vouchers.forEach((v, i) => {
    const x = pad + (i % cols) * cell;
    const y = pad + 100 + Math.floor(i / cols) * (cell + 60);
    ctx.strokeStyle = '#ccc';
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(x + 6, y, cell - 12, cell + 50);
    ctx.setLineDash([]);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText(`${formatNim(batch.value)} NIM`, x + 24, y + 38);
    const qr = encode(v.link, { border: 1 });
    const size = cell - 90;
    const px = size / qr.size;
    qr.data.forEach((row, r) =>
      row.forEach((on, c) => {
        if (on) ctx.fillRect(x + 45 + c * px, y + 55 + r * px, Math.ceil(px), Math.ceil(px));
      }),
    );
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText(v.balance > 0 ? `#${v.k + 1}` : `#${v.k + 1} · claimed`, x + 24, y + cell + 36);
  });
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `giftlink-vouchers-${batch.index + 1}.png`;
    document.body.append(a);
    a.click();
    a.remove();
    // In-app browsers may ignore downloads: show the image so it can be long-pressed and saved.
    const img = h('img', { src: url, alt: 'Voucher sheet', class: 'sheet-image' });
    const holder = document.querySelector('.sheet-preview') || h('div', { class: 'sheet-preview' });
    holder.replaceChildren(h('p', { class: 'hint' }, 'If nothing downloaded, press and hold the image to save it.'), img);
    document.querySelector('main')?.prepend(holder);
  }, 'image/png');
}
