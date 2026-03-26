import { describe, expect, it } from 'vitest';

import { elementToMarkdown } from '@/content/snippets/dom-to-markdown';

describe('elementToMarkdown', () => {
  it('renders headings, lists, tables, and code blocks to markdown', () => {
    document.body.innerHTML = `
      <article id="root">
        <h2>Overview</h2>
        <p>Hello <strong>world</strong>.</p>
        <ul>
          <li>Alpha</li>
          <li>Beta</li>
        </ul>
        <table>
          <tr><th>Name</th><th>Value</th></tr>
          <tr><td>Foo</td><td>Bar</td></tr>
        </table>
        <pre><code>const x = 1;</code></pre>
      </article>
    `;

    const markdown = elementToMarkdown(document.getElementById('root'));

    expect(markdown).toContain('## Overview');
    expect(markdown).toContain('Hello **world**.');
    expect(markdown).toContain('- Alpha');
    expect(markdown).toContain('| Name | Value |');
    expect(markdown).toContain('```');
    expect(markdown).toContain('const x = 1;');
  });
});
