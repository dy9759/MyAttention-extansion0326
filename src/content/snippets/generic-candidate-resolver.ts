const INLINE_CONTEXT_SELECTORS = 'p, li, blockquote, pre, td, th, h1, h2, h3, h4';
const SECTION_CONTEXT_SELECTORS = 'article, section, main, [role="main"], div, table';
const DWELL_SELECTORS = 'p, li, blockquote, pre, td, th, h1, h2, h3, h4';
const GITHUB_CONTAINER_SELECTORS = [
  '.markdown-body',
  '.comment-body',
  '.js-comment-body',
  '.js-file-line-container',
  '.react-code-lines',
  '.blob-wrapper',
  '.Box-body',
  '[data-snippet-clipboard-copy-content]',
].join(', ');
const EXCLUDED_ANCESTOR_SELECTORS =
  'nav, header, footer, aside, form, button, dialog, [aria-hidden="true"], [data-sayso-tag="true"], .sayso-float, #sayso-sidebar';

function isGitHubPage(): boolean {
  return (
    window.location.hostname === 'github.com' ||
    window.location.hostname.endsWith('.github.com') ||
    Boolean(document.querySelector(GITHUB_CONTAINER_SELECTORS))
  );
}

function getDefaultRoot(): Element {
  return (
    document.querySelector('article') ||
    document.querySelector('main') ||
    document.querySelector('[role="main"]') ||
    document.body
  );
}

function getPrimaryContentRoot(): Element {
  if (isGitHubPage()) {
    return (
      document.querySelector('.markdown-body') ||
      document.querySelector('.comment-body') ||
      document.querySelector('.js-comment-body') ||
      document.querySelector('.js-file-line-container') ||
      document.querySelector('.react-code-lines') ||
      document.querySelector('.blob-wrapper') ||
      getDefaultRoot()
    );
  }

  return getDefaultRoot();
}

function findGitHubContextRoot(startElement: Element): Element | null {
  const inlineRoot = startElement.closest(INLINE_CONTEXT_SELECTORS);
  if (inlineRoot && getElementText(inlineRoot).length >= 8) {
    return inlineRoot;
  }

  const githubContainer = startElement.closest(GITHUB_CONTAINER_SELECTORS);
  if (githubContainer && getElementText(githubContainer).length >= 8) {
    return githubContainer;
  }

  return null;
}

export function getElementText(element: Element | null): string {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim();
}

export function isExcludedElement(element: Element | null): boolean {
  return !!element?.closest(EXCLUDED_ANCESTOR_SELECTORS);
}

export function findGenericContextRoot(range: Range): Element | null {
  const startElement =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement;

  if (!startElement || isExcludedElement(startElement)) {
    return null;
  }

  if (isGitHubPage()) {
    const githubRoot = findGitHubContextRoot(startElement);
    if (githubRoot && !isExcludedElement(githubRoot)) {
      return githubRoot;
    }
  }

  const inlineRoot = startElement.closest(INLINE_CONTEXT_SELECTORS);
  if (inlineRoot && getElementText(inlineRoot).length >= 24) {
    return inlineRoot;
  }

  const sectionRoot = startElement.closest(SECTION_CONTEXT_SELECTORS);
  if (sectionRoot && getElementText(sectionRoot).length >= 24) {
    return sectionRoot;
  }

  return startElement;
}

export function getGenericDwellCandidates(): Element[] {
  const root = getPrimaryContentRoot();

  const candidates = Array.from(root.querySelectorAll(DWELL_SELECTORS)).filter((element) => {
    const text = getElementText(element);
    return !isExcludedElement(element) && text.length >= 80;
  });

  return candidates.filter((element) => !candidates.some((other) => other !== element && other.contains(element)));
}

export function getPrimaryPageContent(): Element | null {
  const root = getPrimaryContentRoot();

  const candidates = Array.from(root.querySelectorAll(DWELL_SELECTORS)).filter((element) => {
    const text = getElementText(element);
    return !isExcludedElement(element) && text.length >= 80;
  });

  if (candidates[0]) {
    return candidates[0];
  }

  if (isGitHubPage()) {
    const fallback =
      root.closest('.js-file-line-container') ||
      root.querySelector('.js-file-line-container') ||
      root.closest('.react-code-lines') ||
      root.querySelector('.react-code-lines') ||
      root.closest('.markdown-body') ||
      root.querySelector('.markdown-body') ||
      root;

    return fallback && !isExcludedElement(fallback) ? fallback : null;
  }

  return null;
}
