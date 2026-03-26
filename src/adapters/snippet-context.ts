import type { PlatformAdapter } from '@/types';

function getNormalizedText(element: Element | null): string {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim();
}

function getLeafMessageCandidates(adapter: PlatformAdapter): Element[] {
  const all = Array.from(document.body.querySelectorAll('*')).filter((element) => {
    return adapter.isMessageElement(element) && getNormalizedText(element).length > 0;
  });

  return all.filter((element) => {
    return !all.some((other) => other !== element && element.contains(other));
  });
}

function resolveAnchorNode(range: Range): Node | null {
  if (range.startContainer) {
    return range.startContainer;
  }

  return range.commonAncestorContainer || null;
}

export function getAdapterSelectionContext(
  adapter: PlatformAdapter,
  range: Range
): { root: Element; contextText: string; messageIndex?: number; selectionText?: string } | null {
  const candidates = getLeafMessageCandidates(adapter);
  if (!candidates.length) {
    return null;
  }

  const anchorNode = resolveAnchorNode(range);
  if (!anchorNode) {
    return null;
  }

  const root =
    candidates.find((candidate) => candidate.contains(anchorNode)) ||
    candidates.find((candidate) => candidate.contains(range.commonAncestorContainer));

  if (!root) {
    return null;
  }

  return {
    root,
    contextText: getNormalizedText(root),
    selectionText: range.toString().replace(/\s+/g, ' ').trim(),
    messageIndex: candidates.findIndex((candidate) => candidate === root),
  };
}

export function getAdapterDwellCandidates(adapter: PlatformAdapter): Element[] {
  return getLeafMessageCandidates(adapter);
}
