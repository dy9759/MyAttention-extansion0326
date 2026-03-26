import type { DomRangeSelector, SnippetSelector, TextPositionSelector, TextQuoteSelector } from '@/types';

function xpathFromNode(node: Node, root: Node): string {
  let xpath = '';
  let current: Node | null = node;

  while (current && current !== root) {
    const name = current.nodeName.toLowerCase() === '#text' ? 'text()' : current.nodeName.toLowerCase();
    let pos = 0;
    let sibling: Node | null = current;
    while (sibling) {
      if (sibling.nodeName === current.nodeName) {
        pos += 1;
      }
      sibling = sibling.previousSibling;
    }

    xpath = `/${name}[${pos}]${xpath}`;
    current = current.parentNode;
  }

  return xpath || '/';
}

function rangeTextLength(root: Element, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function getRootText(root: Element): string {
  return (root.textContent || '').replace(/\s+/g, ' ').trim();
}

export function describeRange(root: Element, range: Range): SnippetSelector[] {
  const rootText = getRootText(root);
  const start = rangeTextLength(root, range.startContainer, range.startOffset);
  const end = rangeTextLength(root, range.endContainer, range.endOffset);
  const exact = range.toString().replace(/\s+/g, ' ').trim();
  const prefix = rootText.slice(Math.max(0, start - 32), start).trim();
  const suffix = rootText.slice(end, Math.min(rootText.length, end + 32)).trim();

  const quoteSelector: TextQuoteSelector = {
    type: 'TextQuoteSelector',
    exact,
    prefix: prefix || undefined,
    suffix: suffix || undefined,
  };
  const positionSelector: TextPositionSelector = {
    type: 'TextPositionSelector',
    start,
    end,
  };
  const rangeSelector: DomRangeSelector = {
    type: 'RangeSelector',
    rootSelector: xpathFromNode(root, document.body),
    startContainer: xpathFromNode(range.startContainer, root),
    endContainer: xpathFromNode(range.endContainer, root),
    startOffset: range.startOffset,
    endOffset: range.endOffset,
  };

  return [quoteSelector, positionSelector, rangeSelector];
}
