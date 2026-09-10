import { useCallback, useEffect, useMemo, useState } from "react";
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

export function useConversationSync() {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [conversationDetails, setConversationDetails] = useState<
    Record<string, Conversation>
  >({});
  const [activeId, setActiveId] = useState<string>();
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [historyError, setHistoryError] = useState<string>();

  const activeConversation = useMemo(
    () => (activeId ? conversationDetails[activeId] : undefined),
    [activeId, conversationDetails],
  );

  const replaceConversation = useCallback((replacement: Conversation) => {
    setConversationDetails((current) => {
      const existing = current[replacement.id];
      if (existing && existing.updatedAt > replacement.updatedAt) {
        return current;
      }
      return {
        ...current,
        [replacement.id]: existing
          ? mergeConversationPage(existing, replacement)
          : replacement,
      };
    });
    setConversations((current) =>
      replaceConversationListItem(current, replacement),
    );
  }, []);

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
      setConversationDetails((current) => {
        const latest = current[conversation.id];
        if (!latest) return current;
        return {
          ...current,
          [conversation.id]: {
            ...latest,
            messages: mergeMessages(page.messages, latest.messages),
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
  };
}
