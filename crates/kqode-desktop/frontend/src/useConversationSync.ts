import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  createStoredConversation,
  listStoredConversations,
  loadOlderStoredMessages,
  loadStoredConversation,
  loadStoredMessage,
} from "./conversationStorage";
import {
  mergeConversationPage,
  mergeMessages,
  replaceConversationListItem,
  toConversationListItem,
} from "./conversationMerge";
import type {
  Conversation,
  ConversationListItem,
  ConversationMessageStream,
  ConversationUpdated,
} from "./types";

const CONVERSATION_UPDATED_EVENT = "conversation-updated";
const CONVERSATION_MESSAGE_STREAM_EVENT = "conversation-message-stream";

type RetryTombstone = {
  errorMessageId: string;
  responseRequestId?: string;
};

export function useConversationSync() {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [conversationDetails, setConversationDetails] = useState<
    Record<string, Conversation>
  >({});
  const [activeId, setActiveId] = useState<string>();
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [historyError, setHistoryError] = useState<string>();
  const deletedMessageIds = useRef(new Map<string, Set<string>>());
  const conversationRevisions = useRef(new Map<string, number>());
  const retryTombstones = useRef(
    new Map<string, Map<string, RetryTombstone>>(),
  );

  const activeConversation = useMemo(
    () => (activeId ? conversationDetails[activeId] : undefined),
    [activeId, conversationDetails],
  );

  const restoreMessage = useCallback(
    async (conversationId: string, messageId: string) => {
      const message = await loadStoredMessage(conversationId, messageId);
      deletedMessageIds.current.get(conversationId)?.delete(messageId);
      const retries = retryTombstones.current.get(conversationId);
      if (retries) {
        for (const [turnId, tombstone] of retries) {
          if (tombstone.errorMessageId === messageId) retries.delete(turnId);
        }
      }
      setConversationDetails((current) => {
        const conversation = current[conversationId];
        if (!conversation) return current;
        return {
          ...current,
          [conversationId]: {
            ...conversation,
            messages: mergeMessages(conversation.messages, [message]),
          },
        };
      });
    },
    [],
  );

  const replaceConversation = useCallback(
    (replacement: Conversation) => {
      const currentRevision = conversationRevisions.current.get(replacement.id);
      if (
        currentRevision !== undefined &&
        currentRevision > replacement.updatedAt
      ) {
        return;
      }
      conversationRevisions.current.set(replacement.id, replacement.updatedAt);
      const retries = retryTombstones.current.get(replacement.id);
      if (retries) {
        for (const [turnId, tombstone] of retries) {
          if (
            replacement.pendingTurns.some((pending) => pending.id === turnId)
          ) {
            continue;
          }
          const responseRequestId = tombstone.responseRequestId ?? turnId;
          const hasResponse = replacement.messages.some(
            (message) =>
              message.id !== tombstone.errorMessageId &&
              message.requestId === responseRequestId &&
              message.role !== "user",
          );
          if (hasResponse) {
            retries.delete(turnId);
          } else {
            void restoreMessage(
              replacement.id,
              tombstone.errorMessageId,
            ).catch(
              (error: unknown) => {
                setHistoryError(
                  `Could not restore the retryable error: ${String(error)}`,
                );
              },
            );
          }
        }
      }
      setConversationDetails((current) => {
        const existing = current[replacement.id];
        const deleted = deletedMessageIds.current.get(replacement.id);
        const filtered = deleted
          ? {
              ...replacement,
              messages: replacement.messages.filter(
                (message) => !deleted.has(message.id),
              ),
            }
          : replacement;
        if (existing && existing.updatedAt > filtered.updatedAt) {
          return current;
        }
        const merged = existing
          ? mergeConversationPage(existing, filtered)
          : filtered;
        return {
          ...current,
          [filtered.id]: merged,
        };
      });
      setConversations((current) =>
        replaceConversationListItem(current, replacement),
      );
    },
    [restoreMessage],
  );

  const tombstoneMessage = useCallback(
    (
      conversationId: string,
      messageId: string,
      retryTurnId?: string,
      responseRequestId?: string,
    ) => {
      const deleted =
        deletedMessageIds.current.get(conversationId) ?? new Set<string>();
      deleted.add(messageId);
      deletedMessageIds.current.set(conversationId, deleted);
      if (retryTurnId) {
        const retries =
          retryTombstones.current.get(conversationId) ??
          new Map<string, RetryTombstone>();
        retries.set(retryTurnId, { errorMessageId: messageId, responseRequestId });
        retryTombstones.current.set(conversationId, retries);
      }
      setConversationDetails((current) => {
        const conversation = current[conversationId];
        if (!conversation) return current;
        return {
          ...current,
          [conversationId]: {
            ...conversation,
            messages: conversation.messages.filter(
              (message) => message.id !== messageId,
            ),
          },
        };
      });
    },
    [],
  );

  const refreshConversation = useCallback(
    async (conversationId: string) => {
      try {
        replaceConversation(await loadStoredConversation(conversationId));
        setHistoryError(undefined);
      } catch (error) {
        setHistoryError(`Could not refresh conversation: ${String(error)}`);
      }
    },
    [replaceConversation],
  );

  const refreshMessage = useCallback(
    async (event: ConversationMessageStream) => {
      try {
        const message = await loadStoredMessage(
          event.conversationId,
          event.messageId,
        );
        if (
          deletedMessageIds.current
            .get(event.conversationId)
            ?.has(message.id)
        ) {
          return;
        }
        setConversationDetails((current) => {
          const conversation = current[event.conversationId];
          if (!conversation) return current;
          const activeTurn = conversation.pendingTurns.find(
            (turn) => turn.isActive,
          );
          if (activeTurn && activeTurn.id !== event.turnId) return current;
          const existing = conversation.messages.find(
            (candidate) => candidate.id === message.id,
          );
          if (existing && existing.revision >= message.revision) return current;
          return {
            ...current,
            [event.conversationId]: {
              ...conversation,
              messages: mergeMessages(conversation.messages, [message]),
            },
          };
        });
      } catch (error) {
        setHistoryError(`Could not refresh streamed message: ${String(error)}`);
      }
    },
    [],
  );

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<ConversationUpdated>(
      CONVERSATION_UPDATED_EVENT,
      ({ payload }) => void refreshConversation(payload.conversationId),
    )
      .then((stopListening) => {
        if (disposed) stopListening();
        else unlisten = stopListening;
      })
      .catch((error: unknown) => {
        if (!disposed) setHistoryError(String(error));
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [refreshConversation]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<ConversationMessageStream>(
      CONVERSATION_MESSAGE_STREAM_EVENT,
      ({ payload }) => void refreshMessage(payload),
    )
      .then((stopListening) => {
        if (disposed) stopListening();
        else unlisten = stopListening;
      })
      .catch((error: unknown) => {
        if (!disposed) setHistoryError(String(error));
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [refreshMessage]);

  useEffect(() => {
    let cancelled = false;
    const loadHistory = async () => {
      try {
        let stored = await listStoredConversations();
        if (cancelled) return;
        const active =
          stored.length === 0
            ? await createStoredConversation()
            : await loadStoredConversation(stored[0].id);
        if (cancelled) return;
        if (stored.length === 0) stored = [toConversationListItem(active)];
        setConversations(stored);
        setActiveId(active.id);
        conversationRevisions.current.set(active.id, active.updatedAt);
        setConversationDetails((current) => ({
          ...current,
          [active.id]: active,
        }));
      } catch (error) {
        if (!cancelled) {
          setHistoryError(
            `Could not load conversation history: ${String(error)}`,
          );
        }
      } finally {
        if (!cancelled) setIsHistoryLoaded(true);
      }
    };
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  const activateConversation = (conversationId: string) => {
    setActiveId(conversationId);
    void refreshConversation(conversationId);
  };

  const loadOlderMessages = async () => {
    const conversation = activeConversation;
    if (
      !conversation ||
      !conversation.hasMoreMessages ||
      conversation.oldestMessagePosition === undefined ||
      isLoadingOlderMessages
    ) {
      return false;
    }
    setIsLoadingOlderMessages(true);
    try {
      const page = await loadOlderStoredMessages(
        conversation.id,
        conversation.oldestMessagePosition,
      );
      const deleted = deletedMessageIds.current.get(conversation.id);
      const messages = deleted
        ? page.messages.filter((message) => !deleted.has(message.id))
        : page.messages;
      setConversationDetails((current) => {
        const latest = current[conversation.id];
        if (!latest) return current;
        return {
          ...current,
          [conversation.id]: {
            ...latest,
            messages: mergeMessages(messages, latest.messages),
            hasMoreMessages: page.hasMoreMessages,
            oldestMessagePosition:
              page.oldestMessagePosition ?? latest.oldestMessagePosition,
          },
        };
      });
      return true;
    } catch (error) {
      setHistoryError(`Could not load older messages: ${String(error)}`);
      return false;
    } finally {
      setIsLoadingOlderMessages(false);
    }
  };

  return {
    activeConversation,
    activeId,
    activateConversation,
    conversationDetails,
    conversations,
    historyError,
    isHistoryLoaded,
    isLoadingOlderMessages,
    loadOlderMessages,
    refreshConversation,
    replaceConversation,
    setActiveId,
    setConversationDetails,
    setConversations,
    setHistoryError,
    restoreMessage,
    tombstoneMessage,
  };
}
