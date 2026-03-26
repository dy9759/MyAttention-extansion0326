import { describe, expect, it } from 'vitest';

import { selectedRange } from '@/content/snippets/range-utils';

describe('selectedRange', () => {
  it('returns null for collapsed selections', () => {
    document.body.innerHTML = '<div id="root">collapsed</div>';
    const textNode = document.getElementById('root')?.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 2);
    range.setEnd(textNode, 2);

    const selection = {
      rangeCount: 1,
      getRangeAt: () => range,
    } as unknown as Selection;

    expect(selectedRange(selection)).toBeNull();
  });

  it('unions multiple ranges into one selection', () => {
    document.body.innerHTML = '<div id="root">first second third</div>';
    const textNode = document.getElementById('root')?.firstChild as Text;

    const firstRange = document.createRange();
    firstRange.setStart(textNode, 0);
    firstRange.setEnd(textNode, 5);

    const secondRange = document.createRange();
    secondRange.setStart(textNode, 6);
    secondRange.setEnd(textNode, 12);

    const selection = {
      rangeCount: 2,
      getRangeAt: (index: number) => (index === 0 ? firstRange : secondRange),
    } as unknown as Selection;

    const merged = selectedRange(selection);
    expect(merged?.toString()).toBe('first second');
  });
});
