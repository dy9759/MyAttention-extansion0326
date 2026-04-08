import { escapeHtml } from './utils/index';

function renderInline(text: string): string {
  let html = escapeHtml(text || '');

  html = html.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-gray-100 text-amber-700">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer" class="text-[#5e6ad2] underline">$1</a>'
  );

  return html;
}

function renderParagraph(lines: string[]): string {
  const text = lines.join(' ').trim();
  if (!text) {
    return '';
  }
  return `<p class="mb-3 leading-7">${renderInline(text)}</p>`;
}

function renderBlockquote(lines: string[]): string {
  const content = lines
    .map((line) => line.replace(/^>\s?/, ''))
    .map((line) => renderInline(line))
    .join('<br>');
  return `<blockquote class="mb-3 border-l-4 border-yellow-300 bg-yellow-50 px-4 py-2 text-gray-700">${content}</blockquote>`;
}

function renderTable(lines: string[]): string {
  const rows = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\||\|$/g, '').split('|').map((cell) => renderInline(cell.trim())));

  if (rows.length < 2) {
    return renderParagraph(lines);
  }

  const header = rows[0];
  const body = rows.slice(2);

  return `
    <div class="mb-4 overflow-x-auto">
      <table class="min-w-full border border-gray-200 text-sm">
        <thead class="bg-gray-50">
          <tr>${header.map((cell) => `<th class="border border-gray-200 px-3 py-2 text-left font-medium">${cell}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${body
            .map(
              (row) =>
                `<tr>${row.map((cell) => `<td class="border border-gray-200 px-3 py-2 align-top">${cell}</td>`).join('')}</tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderList(lines: string[]): string {
  const items = lines
    .map((line) => line.replace(/^(\s*)([-*]|\d+\.)\s+/, '').trim())
    .filter(Boolean)
    .map((line) => `<li class="mb-1">${renderInline(line)}</li>`)
    .join('');

  return `<ul class="mb-4 list-disc pl-5 text-gray-700">${items}</ul>`;
}

export function renderMarkdownToHtml(markdown: string): string {
  const lines = (markdown || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push(
        `<pre class="mb-4 overflow-x-auto rounded-lg bg-gray-900 px-4 py-3 text-sm text-gray-100"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`
      );
      index += 1;
      continue;
    }

    if (/^#{1,6}\s/.test(trimmed)) {
      const level = Math.min(6, trimmed.match(/^#+/)?.[0].length || 1);
      const content = renderInline(trimmed.replace(/^#{1,6}\s+/, ''));
      const className =
        level === 1
          ? 'text-2xl font-semibold mt-2 mb-3'
          : level === 2
          ? 'text-xl font-semibold mt-4 mb-3'
          : 'text-lg font-semibold mt-3 mb-2';
      blocks.push(`<h${level} class="${className}">${content}</h${level}>`);
      index += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quoteLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderBlockquote(quoteLines));
      continue;
    }

    if (trimmed.startsWith('|') && index + 1 < lines.length && /^\|\s*[-:]/.test(lines[index + 1].trim())) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        tableLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderTable(tableLines));
      continue;
    }

    if (/^(\s*)([-*]|\d+\.)\s+/.test(line)) {
      const listLines: string[] = [];
      while (index < lines.length && /^(\s*)([-*]|\d+\.)\s+/.test(lines[index])) {
        listLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderList(listLines));
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index].trim();
      if (
        !candidate ||
        candidate.startsWith('```') ||
        /^#{1,6}\s/.test(candidate) ||
        candidate.startsWith('>') ||
        (/^(\s*)([-*]|\d+\.)\s+/.test(lines[index])) ||
        (candidate.startsWith('|') && index + 1 < lines.length && /^\|\s*[-:]/.test(lines[index + 1].trim()))
      ) {
        break;
      }
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(renderParagraph(paragraphLines));
  }

  if (!blocks.length) {
    return '<span class="text-gray-400">No context available</span>';
  }

  return blocks.join('');
}
