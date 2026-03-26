import { describe, expect, it } from 'vitest';

import { describeRange } from '@/content/snippets/selector-describer';

describe('describeRange', () => {
  it('builds quote, position, and range selectors in order', () => {
    document.body.innerHTML = '<div id="root">alpha beta gamma delta</div>';
    const root = document.getElementById('root') as HTMLDivElement;
    const textNode = root.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 6);
    range.setEnd(textNode, 10);

    const selectors = describeRange(root, range);

    expect(selectors).toHaveLength(3);
    expect(selectors[0]).toMatchObject({
      type: 'TextQuoteSelector',
      exact: 'beta',
    });
    expect(selectors[1]).toMatchObject({
      type: 'TextPositionSelector',
      start: 6,
      end: 10,
    });
    expect(selectors[2]).toMatchObject({
      type: 'RangeSelector',
      startOffset: 6,
      endOffset: 10,
    });
  });
});
