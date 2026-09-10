import type {
  Conversation,
  ConversationListItem,
  Message,
} from "./types";

export const toConversationListItem = (
  conversation: Conversation,
): ConversationListItem => ({
  id: conversation.id,
  title: conversation.title,
  updatedAt: conversation.updatedAt,
});

export const replaceConversationListItem = (
  current: ConversationListItem[],
  conversation: Conversation,
): ConversationListItem[] => {
  const existing = current.find((item) => item.id === conversation.id);
  if (existing && existing.updatedAt > conversation.updatedAt) return current;
  const replacement = toConversationListItem(conversation);
  return existing
    ? current.map((item) =>
        item.id === conversation.id ? replacement : item,
      )
    : [replacement, ...current];
};

export const mergeConversationPage = (
  current: Conversation,
  replacement: Conversation,
): Conversation => {
  const replacementIds = new Set(
    replacement.messages.map((message) => message.id),
  );
  const pendingIds = new Set(
    replacement.pendingTurns.map((turn) => turn.id),
  );
  const preservedMessages = current.messages.filter(
    (message) =>
      !replacementIds.has(message.id) &&
      ((replacement.oldestMessagePosition !== undefined &&
        message.position < replacement.oldestMessagePosition) ||
        (message.requestId !== undefined &&
          pendingIds.has(message.requestId))),
  );
  const preservedOlderMessages =
    current.oldestMessagePosition !== undefined &&
    replacement.oldestMessagePosition !== undefined &&
    current.oldestMessagePosition < replacement.oldestMessagePosition;
  return {
    ...replacement,
    messages: mergeMessages(preservedMessages, replacement.messages),
    hasMoreMessages: preservedOlderMessages
      ? current.hasMoreMessages
      : replacement.hasMoreMessages,
    oldestMessagePosition: preservedOlderMessages
      ? current.oldestMessagePosition
      : replacement.oldestMessagePosition,
  };
};

export const mergeMessages = (
  current: Message[],
  updates: Message[],
): Message[] => {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const update of updates) {
    const existing = byId.get(update.id);
    if (!existing || update.revision >= existing.revision) {
      byId.set(update.id, update);
    }
  }
  return [...byId.values()].sort((left, right) => left.position - right.position);
};
