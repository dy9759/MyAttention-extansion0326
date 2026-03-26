import { describe, expect, it } from 'vitest';

import { resolveSemanticSelectionContext } from '@/content/snippets/semantic-block-resolver';

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

describe('resolveSemanticSelectionContext', () => {
  it('returns the same semantic block key for multiple selections in the same paragraph', () => {
    document.body.innerHTML = `
      <main>
        <h2>Section A</h2>
        <p id="target">Alpha beta gamma delta epsilon.</p>
      </main>
    `;

    const paragraph = document.getElementById('target') as HTMLParagraphElement;
    const first = resolveSemanticSelectionContext({
      range: createRangeForText(paragraph, 'beta'),
      sourceKind: 'web_page',
    });
    const second = resolveSemanticSelectionContext({
      range: createRangeForText(paragraph, 'delta'),
      sourceKind: 'web_page',
    });

    expect(first?.semanticBlockKey).toBeTruthy();
    expect(second?.semanticBlockKey).toBe(first?.semanticBlockKey);
    expect(first?.headingPath).toEqual(['Section A']);
  });

  it('uses different semantic block keys across heading sections', () => {
    document.body.innerHTML = `
      <main>
        <section>
          <h2>Section A</h2>
          <p id="a">Alpha beta gamma.</p>
        </section>
        <section>
          <h2>Section B</h2>
          <p id="b">Alpha beta gamma.</p>
        </section>
      </main>
    `;

    const first = resolveSemanticSelectionContext({
      range: createRangeForText(document.getElementById('a') as Element, 'beta'),
      sourceKind: 'web_page',
    });
    const second = resolveSemanticSelectionContext({
      range: createRangeForText(document.getElementById('b') as Element, 'beta'),
      sourceKind: 'web_page',
    });

    expect(first?.semanticBlockKey).not.toBe(second?.semanticBlockKey);
    expect(first?.headingPath).toEqual(['Section A']);
    expect(second?.headingPath).toEqual(['Section B']);
  });

  it('classifies code and table roots correctly', () => {
    document.body.innerHTML = `
      <main>
        <pre id="code"><code>const answer = 42;</code></pre>
        <table id="table">
          <tr><th>Name</th><th>Value</th></tr>
          <tr><td>Foo</td><td>Bar</td></tr>
        </table>
      </main>
    `;

    const code = resolveSemanticSelectionContext({
      range: createRangeForText(document.getElementById('code') as Element, 'answer'),
      sourceKind: 'web_page',
    });
    const table = resolveSemanticSelectionContext({
      range: createRangeForText(document.getElementById('table') as Element, 'Foo'),
      sourceKind: 'web_page',
    });

    expect(code?.blockKind).toBe('code');
    expect(table?.blockKind).toBe('table');
  });
});
