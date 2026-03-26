import { afterEach, describe, expect, it, vi } from 'vitest';

import { HighlightManager } from '@/content/snippets/highlight-manager';

function buildRange(): { target: HTMLParagraphElement; range: Range } {
  document.body.innerHTML = '<p id="target">alpha beta gamma</p>';
  const target = document.getElementById('target') as HTMLParagraphElement;
  const textNode = target.firstChild as Text;
  const range = document.createRange();
  range.setStart(textNode, 6);
  range.setEnd(textNode, 10);
  return { target, range };
}

describe('HighlightManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    const cssDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'CSS');
    if (cssDescriptor?.configurable) {
      delete (globalThis as any).CSS;
    }
    const highlightDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Highlight');
    if (highlightDescriptor?.configurable) {
      delete (globalThis as any).Highlight;
    }
  });

  it('wraps a single text-node selection with fallback markup when CSS highlights are unavailable', () => {
    const { target, range } = buildRange();

    const manager = new HighlightManager();
    const elements = manager.registerRange('group-1', 'item-1', range);

    expect(elements).toHaveLength(1);
    const highlight = target.querySelector('sayso-highlight');
    expect(highlight).not.toBeNull();
    expect(highlight?.textContent).toBe('beta');
  });

  it('uses CSS highlights without mutating the DOM when the browser API is available', () => {
    const { target, range } = buildRange();
    const registry = new Map<string, { ranges: Range[] }>();

    Object.defineProperty(globalThis, 'CSS', {
      configurable: true,
      value: {
        highlights: {
          set: vi.fn((name: string, highlight: { ranges: Range[] }) => registry.set(name, highlight)),
          delete: vi.fn((name: string) => registry.delete(name)),
        },
      },
    });
    Object.defineProperty(globalThis, 'Highlight', {
      configurable: true,
      value: class Highlight {
        ranges: Range[];

        constructor(...ranges: Range[]) {
          this.ranges = ranges;
        }
      },
    });

    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range.cloneRange());

    const manager = new HighlightManager();
    const elements = manager.registerRange('group-1', 'item-1', range);
    manager.focusItem('item-1');

    expect(elements).toHaveLength(0);
    expect(target.querySelector('sayso-highlight')).toBeNull();
    expect(selection?.toString()).toBe('beta');
    expect(registry.has('sayso-highlight-focused')).toBe(true);
  });
});
