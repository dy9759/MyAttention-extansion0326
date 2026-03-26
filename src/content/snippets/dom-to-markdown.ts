function escapeInlineMarkdown(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}

function textOf(node: Node | null): string {
  return (node?.textContent || '').replace(/\s+/g, ' ').trim();
}

function inlineMarkdown(node: Node | null): string {
  if (!node) {
    return '';
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return escapeInlineMarkdown(node.textContent || '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  const children = Array.from(element.childNodes).map((child) => inlineMarkdown(child)).join('');

  if (tag === 'strong' || tag === 'b') {
    return children ? `**${children}**` : '';
  }
  if (tag === 'em' || tag === 'i') {
    return children ? `*${children}*` : '';
  }
  if (tag === 'code' && element.parentElement?.tagName.toLowerCase() !== 'pre') {
    return children ? `\`${children}\`` : '';
  }
  if (tag === 'a') {
    const href = element.getAttribute('href') || '';
    return href ? `[${children || href}](${href})` : children;
  }
  if (tag === 'br') {
    return '\n';
  }
  if (tag === 'img') {
    return '[image omitted]';
  }

  return children;
}

function renderList(element: Element, ordered: boolean, depth = 0): string {
  const items = Array.from(element.children)
    .filter((child) => child.tagName.toLowerCase() === 'li')
    .map((child, index) => {
      const prefix = ordered ? `${index + 1}. ` : '- ';
      const content = renderNode(child, depth + 1)
        .split('\n')
        .filter(Boolean)
        .join('\n');
      return `${'  '.repeat(depth)}${prefix}${content}`;
    });

  return items.join('\n');
}

function renderTable(element: Element): string {
  const rows = Array.from(element.querySelectorAll('tr')).map((row) =>
    Array.from(row.querySelectorAll('th, td')).map((cell) => textOf(cell))
  );

  if (!rows.length) {
    return '';
  }

  const header = rows[0];
  const separator = header.map(() => '---');
  const body = rows.slice(1);
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ];

  return lines.join('\n');
}

function renderNode(node: Node | null, depth = 0): string {
  if (!node) {
    return '';
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return escapeInlineMarkdown((node.textContent || '').replace(/\s+/g, ' '));
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as Element;
  const tag = element.tagName.toLowerCase();

  if (tag === 'script' || tag === 'style' || tag === 'noscript') {
    return '';
  }

  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1));
    return `${'#'.repeat(level)} ${textOf(element)}\n\n`;
  }

  if (tag === 'p') {
    return `${inlineMarkdown(element).trim()}\n\n`;
  }

  if (tag === 'blockquote') {
    return inlineMarkdown(element)
      .split('\n')
      .filter(Boolean)
      .map((line) => `> ${line}`)
      .join('\n')
      .concat('\n\n');
  }

  if (tag === 'pre') {
    return `\`\`\`\n${element.textContent || ''}\n\`\`\`\n\n`;
  }

  if (tag === 'code') {
    return `\`${inlineMarkdown(element)}\``;
  }

  if (tag === 'ul') {
    return `${renderList(element, false, depth)}\n\n`;
  }

  if (tag === 'ol') {
    return `${renderList(element, true, depth)}\n\n`;
  }

  if (tag === 'table') {
    return `${renderTable(element)}\n\n`;
  }

  if (tag === 'li') {
    return inlineMarkdown(element).trim();
  }

  const childBlocks = Array.from(element.childNodes)
    .map((child) => renderNode(child, depth))
    .filter(Boolean)
    .join('');

  if (tag === 'section' || tag === 'article' || tag === 'main' || tag === 'figure') {
    return `${childBlocks}\n`;
  }

  return childBlocks || inlineMarkdown(element);
}

export function elementToMarkdown(element: Element | null): string {
  if (!element) {
    return '';
  }

  return renderNode(element)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
