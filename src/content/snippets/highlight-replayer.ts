import type { SnippetGroupDetail } from '@/types';
import { anchorRangeFromSelectors } from './selector-anchor';
import { HighlightManager } from './highlight-manager';

export function replaySnippetHighlights(
  highlightManager: HighlightManager,
  snippets: SnippetGroupDetail[]
): Array<{ groupId: string; itemId: string }> {
  highlightManager.clearAll();

  const restored: Array<{ groupId: string; itemId: string }> = [];
  snippets.forEach((detail) => {
    detail.items.forEach((item) => {
      const range = anchorRangeFromSelectors(item.selectors || []);
      if (!range) {
        return;
      }

      const elements = highlightManager.registerRange(detail.group.id, item.id, range);
      if (elements.length) {
        restored.push({
          groupId: detail.group.id,
          itemId: item.id,
        });
      }
    });
  });

  return restored;
}
