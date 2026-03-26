import { describe, expect, it } from 'vitest';

import { renderMarkdownToHtml } from '@/popup/markdown-renderer';

describe('renderMarkdownToHtml', () => {
  it('renders headings, inline formatting, lists, tables, and code blocks', () => {
    const html = renderMarkdownToHtml(`
# Title

Intro with **bold** and \`code\`.

- Alpha
- Beta

| Name | Value |
| --- | --- |
| Foo | Bar |

\`\`\`
const x = 1;
\`\`\`
`);

    expect(html).toContain('<h1');
    expect(html).toContain('Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code class=');
    expect(html).toContain('<ul class=');
    expect(html).toContain('<table class=');
    expect(html).toContain('const x = 1;');
  });

  it('renders blockquotes as quote blocks', () => {
    const html = renderMarkdownToHtml('> quoted line');

    expect(html).toContain('<blockquote');
    expect(html).toContain('quoted line');
  });
});
