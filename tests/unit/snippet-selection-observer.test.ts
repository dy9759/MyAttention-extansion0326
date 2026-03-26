import { afterEach, describe, expect, it, vi } from 'vitest';

import { SelectionObserver } from '@/content/snippets/selection-observer';

function createRange(): Range {
  document.body.innerHTML = '<div id="root">observer selection text</div>';
  const textNode = document.getElementById('root')?.firstChild as Text;
  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, 8);
  return range;
}

describe('SelectionObserver', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('buffers selection updates until mouseup completes', () => {
    vi.useFakeTimers();

    const range = createRange();
    vi.spyOn(document, 'getSelection').mockReturnValue({
      rangeCount: 1,
      getRangeAt: () => range,
    } as unknown as Selection);

    const callback = vi.fn();
    const observer = new SelectionObserver(callback, document);

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);

    callback.mockClear();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(100);
    expect(callback).not.toHaveBeenCalled();

    document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    vi.advanceTimersByTime(9);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);

    observer.disconnect();
  });
});
