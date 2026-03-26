import type { PlatformName, SnippetBlockKind } from '@/types';
import { elementToMarkdown } from './dom-to-markdown';

export interface SemanticSelectionContext {
  root: Element;
  rootSelector: string;
  headingPath: string[];
  blockKind: SnippetBlockKind;
  semanticBlockKey: string;
  rawContextText: string;
  rawContextMarkdown: string;
}

function hashString(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(index);
  }
  return Math.abs(hash >>> 0).toString(16);
}

function textOf(element: Element | null): string {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim();
}

function xpathFromNode(node: Node, root: Node): string {
  let xpath = '';
  let current: Node | null = node;

  while (current && current !== root) {
    const name =
      current.nodeName.toLowerCase() === '#text' ? 'text()' : current.nodeName.toLowerCase();
    let position = 0;
    let sibling: Node | null = current;
    while (sibling) {
      if (sibling.nodeName === current.nodeName) {
        position += 1;
      }
      sibling = sibling.previousSibling;
    }
    xpath = `/${name}[${position}]${xpath}`;
    current = current.parentNode;
  }

  return xpath || '/';
}

function getHeadingPathForElement(element: Element): string[] {
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  const active = new Map<number, string>();

  headings.forEach((heading) => {
    const relation = heading.compareDocumentPosition(element);
    const comesBefore =
      relation === 0 || Boolean(relation & Node.DOCUMENT_POSITION_FOLLOWING);

    if (!comesBefore) {
      return;
    }

    const level = Number(heading.tagName.slice(1));
    active.set(level, textOf(heading));
    for (let next = level + 1; next <= 6; next += 1) {
      active.delete(next);
    }
  });

  return Array.from(active.entries())
    .sort((a, b) => a[0] - b[0])
    .map((entry) => entry[1])
    .filter(Boolean)
    .slice(-3);
}

function findSectionRoot(element: Element): Element {
  const root =
    element.closest('section') ||
    element.closest('article') ||
    element.closest('main') ||
    element.closest('[role="main"]');

  if (root && textOf(root).length >= 80) {
    return root;
  }

  const paragraph = element.closest('p');
  if (paragraph && textOf(paragraph).length >= 20) {
    return paragraph;
  }

  return element;
}

function resolveRootAndKind(element: Element, sourceKind: 'web_page' | 'ai_conversation'): {
  root: Element;
  blockKind: SnippetBlockKind;
} {
  const table = element.closest('table');
  if (table) {
    return { root: table, blockKind: 'table' };
  }

  const pre = element.closest('pre');
  if (pre) {
    return { root: pre, blockKind: 'code' };
  }

  const code = element.closest('code');
  if (code && code.textContent && code.textContent.trim().length >= 20) {
    return { root: code, blockKind: 'code' };
  }

  const blockquote = element.closest('blockquote');
  if (blockquote) {
    return { root: blockquote, blockKind: 'quote' };
  }

  const list = element.closest('ul, ol');
  if (list) {
    return { root: list, blockKind: 'list' };
  }

  if (sourceKind === 'ai_conversation') {
    return { root: findSectionRoot(element), blockKind: 'ai_message' };
  }

  return { root: findSectionRoot(element), blockKind: 'section' };
}

function findMediaRoot(element: Element): Element {
  return (
    element.closest('figure') ||
    element.closest('section') ||
    element.closest('article') ||
    element.closest('main') ||
    element.closest('[role="main"]') ||
    element
  );
}

export function resolveSemanticElementContext(options: {
  element: Element;
  sourceKind: 'web_page' | 'ai_conversation';
  platform?: PlatformName;
  conversationId?: string;
  preferredRoot?: Element | null;
  preferredBlockKind?: SnippetBlockKind;
}): SemanticSelectionContext | null {
  const anchorElement = options.element || options.preferredRoot;
  if (!anchorElement) {
    return null;
  }

  const resolved =
    options.preferredBlockKind && options.preferredRoot
      ? {
          root: options.preferredRoot,
          blockKind: options.preferredBlockKind,
        }
      : options.preferredBlockKind === 'media'
      ? {
          root: options.preferredRoot || findMediaRoot(anchorElement),
          blockKind: 'media' as SnippetBlockKind,
        }
      : resolveRootAndKind(options.preferredRoot || anchorElement, options.sourceKind);
  const headingPath = getHeadingPathForElement(resolved.root);
  const rawContextMarkdown = elementToMarkdown(resolved.root);
  const rawContextText = textOf(resolved.root);
  const rootSelector = xpathFromNode(resolved.root, document.body);
  const semanticBlockKey = hashString(
    [
      window.location.href.split('#')[0].split('?')[0],
      options.sourceKind,
      options.platform || '',
      options.conversationId || '',
      headingPath.join(' > '),
      resolved.blockKind,
      rootSelector,
      rawContextMarkdown.slice(0, 500),
    ].join('||')
  );

  return {
    root: resolved.root,
    rootSelector,
    headingPath,
    blockKind: resolved.blockKind,
    semanticBlockKey,
    rawContextText,
    rawContextMarkdown,
  };
}

export function resolveSemanticSelectionContext(options: {
  range: Range;
  sourceKind: 'web_page' | 'ai_conversation';
  platform?: PlatformName;
  conversationId?: string;
  preferredRoot?: Element | null;
}): SemanticSelectionContext | null {
  const anchorElement =
    options.preferredRoot ||
    (options.range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (options.range.startContainer as Element)
      : options.range.startContainer.parentElement);

  if (!anchorElement) {
    return null;
  }

  return resolveSemanticElementContext({
    element: anchorElement,
    sourceKind: options.sourceKind,
    platform: options.platform,
    conversationId: options.conversationId,
    preferredRoot: options.preferredRoot || undefined,
  });
}
