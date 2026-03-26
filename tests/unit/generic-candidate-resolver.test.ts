import { describe, expect, it } from 'vitest';

import {
  findGenericContextRoot,
  getPrimaryPageContent,
} from '@/content/snippets/generic-candidate-resolver';

function createRangeForText(container: Element, searchText: string): Range {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();

  while (current) {
    const text = current.textContent || '';
    const index = text.indexOf(searchText);
    if (index >= 0) {
      const range = document.createRange();
      range.setStart(current, index);
      range.setEnd(current, index + searchText.length);
      return range;
    }
    current = walker.nextNode();
  }

  throw new Error(`Text not found: ${searchText}`);
}

describe('generic-candidate-resolver', () => {
  it('finds markdown paragraph roots on GitHub README-like pages', () => {
    document.body.innerHTML = `
      <main>
        <article class="markdown-body">
          <h1>Repo</h1>
          <p id="target">GitHub README content that should be captured as a snippet.</p>
        </article>
      </main>
    `;

    const target = document.getElementById('target') as HTMLParagraphElement;
    const root = findGenericContextRoot(createRangeForText(target, 'README'));
    const primary = getPrimaryPageContent();

    expect(root).toBe(target);
    expect(primary).not.toBeNull();
    expect((primary === target) || primary?.classList.contains('markdown-body')).toBe(true);
  });

  it('finds code containers on GitHub blob pages', () => {
    document.body.innerHTML = `
      <main>
        <div class="blob-wrapper">
          <table class="js-file-line-container" id="code-root">
            <tbody>
              <tr>
                <td class="blob-num">1</td>
                <td class="blob-code blob-code-inner">const importantValue = 42;</td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>
    `;

    const codeRoot = document.getElementById('code-root') as HTMLTableElement;
    const root = findGenericContextRoot(createRangeForText(codeRoot, 'importantValue'));

    expect(root).not.toBeNull();
    expect(codeRoot.contains(root as Node) || root === codeRoot).toBe(true);
    expect(getPrimaryPageContent()).toBe(codeRoot);
  });
});
