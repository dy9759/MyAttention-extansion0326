import type { Conversation, PlatformName } from '@/types';

export interface ConversationFilterCriteria {
  startDate: string | null;
  endDate: string | null;
  platforms: Set<PlatformName>;
}

/**
 * 纯函数：按关键词搜索对话（标题 + 消息内容）。
 */
export function searchConversationsByTerm(
  conversations: Conversation[],
  searchTerm: string
): Conversation[] {
  if (!searchTerm) {
    return conversations;
  }

  const lowerSearchTerm = searchTerm.toLowerCase();
  const keywords = lowerSearchTerm.split(/\s+/).filter((keyword) => keyword.length > 0);

  return conversations.filter((conversation) => {
    const titleMatch =
      conversation.title &&
      keywords.every((keyword) => conversation.title.toLowerCase().includes(keyword));

    const contentMatch =
      conversation.messages &&
      conversation.messages.some((message) => {
        return (
          message.content &&
          keywords.every((keyword) => message.content.toLowerCase().includes(keyword))
        );
      });

    return titleMatch || contentMatch;
  });
}

/**
 * 纯函数：按日期和平台组合筛选。
 */
export function filterConversationsByDateAndPlatform(
  conversations: Conversation[],
  filter: ConversationFilterCriteria
): Conversation[] {
  return conversations.filter((conversation) => {
    if (filter.startDate || filter.endDate) {
      const conversationDate = new Date(conversation.createdAt);

      if (filter.startDate && conversationDate < new Date(filter.startDate)) {
        return false;
      }

      if (filter.endDate && conversationDate > new Date(filter.endDate)) {
        return false;
      }
    }

    if (filter.platforms.size > 0) {
      return filter.platforms.has(conversation.platform);
    }

    return true;
  });
}
