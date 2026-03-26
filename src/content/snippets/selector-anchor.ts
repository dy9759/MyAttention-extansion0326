import type { SnippetSelector } from '@/types';
import { matchQuote } from './quote-match';

function resolvePath(root: Node, path: string): Node | null {
  if (!path || path === '/') {
    return root;
  }

  let current: Node | null = root;
  const segments = path.split('/').filter(Boolean);
  for (const segment of segments) {
    if (!current) {
      return null;
    }

    const match = segment.match(/^(text\(\)|[a-z0-9_-]+)\[(\d+)\]$/i);
    if (!match) {
      return null;
    }

    const name = match[1].toLowerCase();
    const index = Math.max(0, Number(match[2]) - 1);
    const candidates: Node[] = Array.from(current.childNodes).filter((child) => {
      if (name === 'text()') {
        return child.nodeType === Node.TEXT_NODE;
      }
      return child.nodeType === Node.ELEMENT_NODE && child.nodeName.toLowerCase() === name;
    });
    current = candidates[index] || null;
  }

  return current;
}

function findRoot(selectors: SnippetSelector[]): Element | null {
  const rangeSelector = selectors.find((selector) => selector.type === 'RangeSelector');
  if (!rangeSelector || rangeSelector.type !== 'RangeSelector') {
    return document.body;
  }

  const root = resolvePath(document.body, rangeSelector.rootSelector);
  return root && root.nodeType === Node.ELEMENT_NODE ? (root as Element) : document.body;
}

function rangeFromPosition(root: Element, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let current: Node | null = walker.nextNode();
  let offset = 0;
  let startResolved = false;

  while (current) {
    const text = current.textContent || '';
    const nextOffset = offset + text.length;

    if (!startResolved && start >= offset && start <= nextOffset) {
      range.setStart(current, Math.max(0, start - offset));
      startResolved = true;
    }

    if (startResolved && end >= offset && end <= nextOffset) {
      range.setEnd(current, Math.max(0, end - offset));
      return range;
    }

    offset = nextOffset;
    current = walker.nextNode();
  }

  return null;
}

export function anchorRangeFromSelectors(selectors: SnippetSelector[]): Range | null {
  const root = findRoot(selectors);
  if (!root) {
    return null;
  }

  const rangeSelector = selectors.find((selector) => selector.type === 'RangeSelector');
  if (rangeSelector && rangeSelector.type === 'RangeSelector') {
    try {
      const startContainer = resolvePath(root, rangeSelector.startContainer);
      const endContainer = resolvePath(root, rangeSelector.endContainer);
      if (startContainer && endContainer) {
        const range = document.createRange();
        range.setStart(startContainer, rangeSelector.startOffset);
        range.setEnd(endContainer, rangeSelector.endOffset);
        if (!range.collapsed) {
          return range;
        }
      }
    } catch {
      // fall through
    }
  }

  const positionSelector = selectors.find((selector) => selector.type === 'TextPositionSelector');
  if (positionSelector && positionSelector.type === 'TextPositionSelector') {
    const range = rangeFromPosition(root, positionSelector.start, positionSelector.end);
    if (range && !range.collapsed) {
      return range;
    }
  }

  const quoteSelector = selectors.find((selector) => selector.type === 'TextQuoteSelector');
  if (quoteSelector && quoteSelector.type === 'TextQuoteSelector') {
    const text = root.textContent || '';
    const match = matchQuote(text, quoteSelector.exact, {
      prefix: quoteSelector.prefix,
      suffix: quoteSelector.suffix,
    });
    if (match) {
      return rangeFromPosition(root, match.start, match.end);
    }
  }

  return null;
}
