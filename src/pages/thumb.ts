// Square card render used for store thumbnails and social images.
import { LUNA } from '../chain';
import { giftCard } from '../card';
import { h, mount } from '../ui';

export function thumbPage() {
  const theme = Number(new URLSearchParams(location.search).get('t')) || 6;
  mount(h('div', { class: 'thumb' }, giftCard({ value: 25 * LUNA, theme, message: 'Happy birthday, Ada.' })));
}
