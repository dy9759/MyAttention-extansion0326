type HighlightRecord = {
  groupId: string;
  itemId: string;
  ranges: Range[];
  elements: HTMLElement[];
};

const STYLE_ID = 'sayso-highlight-style';
const BASE_HIGHLIGHT_NAME = 'sayso-highlight';
const FOCUSED_HIGHLIGHT_NAME = 'sayso-highlight-focused';

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    sayso-highlight {
      background: rgba(250, 204, 21, 0.72);
      color: inherit;
      border-radius: 2px;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
    sayso-highlight[data-focused="true"] {
      background: rgba(245, 158, 11, 0.82);
    }
    ::highlight(${BASE_HIGHLIGHT_NAME}) {
      background: rgba(250, 204, 21, 0.72);
      color: inherit;
    }
    ::highlight(${FOCUSED_HIGHLIGHT_NAME}) {
      background: rgba(245, 158, 11, 0.82);
      color: inherit;
    }
  `;
  document.documentElement.appendChild(style);
}

function supportsCssHighlights(): boolean {
  const cssHighlights = (globalThis as any).CSS?.highlights;
  const highlightCtor = (globalThis as any).Highlight;
  return !!cssHighlights && typeof cssHighlights.set === 'function' && typeof highlightCtor === 'function';
}

function unwrap(element: HTMLElement): void {
  const parent = element.parentNode;
  if (!parent) {
    return;
  }

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

function textNodesInRange(range: Range): Text[] {
  const root =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode || document.body
      : range.commonAncestorContainer;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.textContent || '';
      if (!text.trim()) {
        return NodeFilter.FILTER_REJECT;
      }
      try {
        return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      } catch {
        return NodeFilter.FILTER_REJECT;
      }
    },
  });

  const nodes: Text[] = [];
  if (range.commonAncestorContainer.nodeType === Node.TEXT_NODE) {
    const textNode = range.commonAncestorContainer as Text;
    if ((textNode.textContent || '').trim()) {
      nodes.push(textNode);
    }
  }
  let current = walker.nextNode();
  while (current) {
    if (!nodes.includes(current as Text)) {
      nodes.push(current as Text);
    }
    current = walker.nextNode();
  }
  return nodes;
}

function wrapTextRange(range: Range, groupId: string, itemId: string): HTMLElement[] {
  const wrapped: HTMLElement[] = [];
  const textNodes = textNodesInRange(range);

  textNodes.forEach((node) => {
    const nodeRange = document.createRange();
    nodeRange.selectNodeContents(node);

    if (node === range.startContainer) {
      nodeRange.setStart(node, range.startOffset);
    }
    if (node === range.endContainer) {
      nodeRange.setEnd(node, range.endOffset);
    }
    if (nodeRange.collapsed) {
      return;
    }

    const mark = document.createElement('sayso-highlight');
    mark.dataset.groupId = groupId;
    mark.dataset.itemId = itemId;
    nodeRange.surroundContents(mark);
    wrapped.push(mark);
  });

  return wrapped;
}

function cloneRange(range: Range): Range {
  return range.cloneRange();
}

export class HighlightManager {
  private readonly records = new Map<string, HighlightRecord>();

  private focusedItemId: string | null = null;

  private readonly useCssHighlights: boolean;

  constructor() {
    ensureStyle();
    this.useCssHighlights = supportsCssHighlights();
  }

  clearAll(): void {
    this.records.forEach((record) => {
      record.elements.forEach((element) => unwrap(element));
    });
    this.records.clear();
    this.focusedItemId = null;
    this.refreshCssHighlights();
  }

  removeItem(itemId: string): void {
    const record = this.records.get(itemId);
    if (!record) {
      return;
    }

    record.elements.forEach((element) => unwrap(element));
    this.records.delete(itemId);
    if (this.focusedItemId === itemId) {
      this.focusedItemId = null;
    }
    this.refreshCssHighlights();
  }

  focusItem(itemId: string): void {
    this.focusedItemId = itemId;

    this.records.forEach((record, key) => {
      record.elements.forEach((element) => {
        if (key === itemId) {
          element.dataset.focused = 'true';
        } else {
          delete element.dataset.focused;
        }
      });
    });

    this.refreshCssHighlights();

    const record = this.records.get(itemId);
    const range = record?.ranges[0];
    const targetNode =
      range?.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : (range?.startContainer as HTMLElement | null);
    if (targetNode && typeof targetNode.scrollIntoView === 'function') {
      targetNode.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    if (record?.elements[0] && typeof record.elements[0].scrollIntoView === 'function') {
      record.elements[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  registerRange(groupId: string, itemId: string, range: Range): HTMLElement[] {
    this.removeItem(itemId);

    const ranges = [cloneRange(range)];
    const elements = this.useCssHighlights ? [] : wrapTextRange(range, groupId, itemId);

    if (ranges.length || elements.length) {
      this.records.set(itemId, {
        groupId,
        itemId,
        ranges,
        elements,
      });
    }

    this.refreshCssHighlights();
    return elements;
  }

  private refreshCssHighlights(): void {
    if (!this.useCssHighlights) {
      return;
    }

    const cssHighlights = (globalThis as any).CSS?.highlights;
    const HighlightCtor = (globalThis as any).Highlight;
    if (!cssHighlights || typeof cssHighlights.set !== 'function' || typeof HighlightCtor !== 'function') {
      return;
    }

    const baseRanges: Range[] = [];
    const focusedRanges: Range[] = [];

    this.records.forEach((record, itemId) => {
      if (itemId === this.focusedItemId) {
        focusedRanges.push(...record.ranges.map((range) => cloneRange(range)));
      } else {
        baseRanges.push(...record.ranges.map((range) => cloneRange(range)));
      }
    });

    if (baseRanges.length > 0) {
      cssHighlights.set(BASE_HIGHLIGHT_NAME, new HighlightCtor(...baseRanges));
    } else {
      cssHighlights.delete(BASE_HIGHLIGHT_NAME);
    }

    if (focusedRanges.length > 0) {
      cssHighlights.set(FOCUSED_HIGHLIGHT_NAME, new HighlightCtor(...focusedRanges));
    } else {
      cssHighlights.delete(FOCUSED_HIGHLIGHT_NAME);
    }
  }
}
