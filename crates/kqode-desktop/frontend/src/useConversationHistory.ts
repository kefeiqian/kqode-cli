import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  Conversation,
  ConversationMessageStream,
  ConversationListItem,
  Provider,
} from "./types";

const CONVERSATION_UPDATED_EVENT = "conversation-updated";
const CONVERSATION_MESSAGE_STREAM_EVENT = "conversation-message-stream";
const createStoredConversation = (
  workspacePath?: string,
  provider?: Provider,
  model?: string,
) =>
  invoke<Conversation>("create_conversation", {
    workspacePath: workspacePath ?? null,
    provider: provider ?? null,
    model: model ?? null,
  });

const updateStoredConversation = (
  conversation: Conversation,
  title?: string,
) =>
  invoke<Conversation>("update_conversation", {
    conversationId: conversation.id,
    title: title ?? null,
    provider: conversation.provider ?? null,
    model: conversation.model ?? null,
  });

const archiveStoredConversation = (conversationId: string) =>
  invoke<void>("archive_conversation", { conversationId });

const loadStoredConversation = (conversationId: string) =>
  invoke<Conversation>("load_conversation", { conversationId });

const steerStoredTurn = (
  conversationId: string,
  turnId: string,
) =>
  invoke<Conversation>("steer_conversation_turn", { conversationId, turnId });

const deleteStoredTurn = (
  conversationId: string,
  turnId: string,
) =>
  invoke<Conversation>("delete_conversation_turn", { conversationId, turnId });

export function useConversationHistory() {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [conversationDetails, setConversationDetails] = useState<
    Record<string, Conversation>
  >({});
  const [activeId, setActiveId] = useState<string>();
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState<string>();

  const activeConversation = useMemo(
    () => (activeId ? conversationDetails[activeId] : undefined),
    [activeId, conversationDetails],
  );
  const replaceConversation = (replacement: Conversation) => {
    setConversationDetails((current) => {
      const existing = current[replacement.id];
      if (existing && existing.updatedAt > replacement.updatedAt) {
        return current;
      }
      return {
        ...current,
        [replacement.id]: existing
          ? mergePendingMessages(existing, replacement)
          : replacement,
      };
    });
    setConversations((current) =>
      replaceConversationListItem(current, replacement),
    );
  };

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listen<Conversation>(CONVERSATION_UPDATED_EVENT, ({ payload }) => {
      replaceConversation(payload);
    }).then((stopListening) => {
      if (disposed) {
        stopListening();
      } else {
        unlisten = stopListening;
      }
    }).catch((error: unknown) => {
      if (!disposed) {
        setHistoryError(error instanceof Error ? error.message : String(error));
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listen<ConversationMessageStream>(
      CONVERSATION_MESSAGE_STREAM_EVENT,
      ({ payload }) => {
        setConversationDetails((current) => {
          const conversation = current[payload.conversationId];
          if (!conversation) return current;
          return {
            ...current,
            [payload.conversationId]: applyStreamUpdate(conversation, payload),
          };
        });
      },
    ).then((stopListening) => {
      if (disposed) {
        stopListening();
      } else {
        unlisten = stopListening;
      }
    }).catch((error: unknown) => {
      if (!disposed) {
        setHistoryError(error instanceof Error ? error.message : String(error));
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      try {
        let stored =
          await invoke<ConversationListItem[]>("list_conversations");
        if (cancelled) return;

        let active: Conversation;
        if (stored.length === 0) {
          active = await createStoredConversation();
          stored = [toConversationListItem(active)];
        } else {
          active = await loadStoredConversation(stored[0].id);
        }
        if (cancelled) return;
        setConversations(stored);
        setActiveId(active.id);
        setConversationDetails((current) => ({
          ...current,
          [active.id]: active,
        }));
      } catch (error) {
        if (cancelled) return;
        setHistoryError(`Could not load conversation history: ${String(error)}`);
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
    void loadStoredConversation(conversationId)
      .then((conversation) => {
        replaceConversation(conversation);
        setHistoryError(undefined);
      })
      .catch((error: unknown) => {
        setHistoryError(
          `Could not load conversation: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  };

  const createNewConversation = async () => {
    try {
      const conversation = await createStoredConversation(
        activeConversation?.workspacePath,
        activeConversation?.provider,
        activeConversation?.model,
      );
      replaceConversation(conversation);
      setActiveId(conversation.id);
    } catch (error) {
      setHistoryError(`Could not create conversation: ${String(error)}`);
    }
  };

  const selectWorkspace = async (workspacePath: string) => {
    const conversation = await createStoredConversation(
      workspacePath,
      activeConversation?.provider,
      activeConversation?.model,
    );
    replaceConversation(conversation);
    setActiveId(conversation.id);
  };

  const archiveConversation = async (conversationId: string) => {
    const archivedConversation =
      conversationDetails[conversationId] ??
      (await loadStoredConversation(conversationId));
    if (
      archivedConversation.messages.length === 0 &&
      archivedConversation.pendingTurns.length === 0
    ) {
      return;
    }

    await archiveStoredConversation(conversationId);
    let remaining = conversations.filter(
      (conversation) => conversation.id !== conversationId,
    );
    setConversationDetails((current) => {
      const next = { ...current };
      delete next[conversationId];
      return next;
    });
    if (remaining.length === 0) {
      const replacement = await createStoredConversation(
        archivedConversation.workspacePath,
        archivedConversation.provider,
        archivedConversation.model,
      );
      remaining = [toConversationListItem(replacement)];
      setConversationDetails((current) => ({
        ...current,
        [replacement.id]: replacement,
      }));
    }
    setConversations(remaining);
    if (activeId === conversationId) activateConversation(remaining[0].id);
  };

  const setConversationModel = async (model: string) => {
    if (!activeConversation) return;
    const updatedConversation = {
      ...activeConversation,
      model,
    };
    replaceConversation(await updateStoredConversation(updatedConversation));
  };

  const setConversationProvider = async (
    provider?: Provider,
    model?: string,
  ) => {
    if (!activeConversation) return;
    const updatedConversation = {
      ...activeConversation,
      provider,
      model,
    };
    replaceConversation(await updateStoredConversation(updatedConversation));
  };

  const setConversationTitle = async (
    conversationId: string,
    title: string,
  ) => {
    const conversation =
      conversationDetails[conversationId] ??
      (await loadStoredConversation(conversationId));
    replaceConversation(
      await updateStoredConversation(conversation, title),
    );
  };

  const sendMessage = async (content: string) => {
    if (!activeConversation) return;
    const conversationId = activeConversation.id;
    const turnId = crypto.randomUUID();
    setHistoryError(undefined);
    setConversationDetails((current) => {
      const conversation = current[conversationId];
      if (!conversation) return current;
      const startsImmediately = !conversation.pendingTurns.some(
        (turn) => turn.isActive,
      );
      return {
        ...current,
        [conversationId]: {
          ...conversation,
          messages: startsImmediately
            ? [
                ...conversation.messages,
                {
                  id: turnId,
                  role: "user",
                  content,
                  requestId: turnId,
                },
              ]
            : conversation.messages,
          pendingTurns: [
            ...conversation.pendingTurns,
            {
              id: turnId,
              content,
              isActive: startsImmediately,
            },
          ],
        },
      };
    });

    try {
      const completedConversation = await invoke<Conversation>("send_message", {
        conversationId,
        messageId: turnId,
        content,
      });
      replaceConversation(completedConversation);
      setHistoryError(undefined);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : String(error));
      setConversationDetails((current) => {
        const conversation = current[conversationId];
        if (!conversation) return current;
        return {
          ...current,
          [conversationId]: {
            ...conversation,
            messages: conversation.messages.filter(
              (message) => message.requestId !== turnId,
            ),
            pendingTurns: conversation.pendingTurns.filter(
              (turn) => turn.id !== turnId,
            ),
          },
        };
      });
      throw error;
    }
  };

  const steerTurn = async (turnId: string) => {
    if (!activeConversation) return;
    const conversationId = activeConversation.id;
    try {
      replaceConversation(await steerStoredTurn(conversationId, turnId));
    } catch (error) {
      setHistoryError(
        `Could not steer the queued message: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  const deleteTurn = async (turnId: string) => {
    if (!activeConversation) return;
    try {
      replaceConversation(
        await deleteStoredTurn(activeConversation.id, turnId),
      );
    } catch (error) {
      setHistoryError(
        `Could not delete the queued message: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  const retryMessage = async (errorMessageId: string) => {
    if (!activeConversation) return;
    const conversationId = activeConversation.id;
    const errorIndex = activeConversation.messages.findIndex(
      (message) => message.id === errorMessageId,
    );
    if (
      errorIndex <= 0 ||
      activeConversation.messages[errorIndex - 1].role !== "user"
    ) {
      return;
    }
    const content = activeConversation.messages[errorIndex - 1].content;
    const turnId = crypto.randomUUID();
    const snapshot = activeConversation;
    setConversationDetails((current) => ({
      ...current,
      [conversationId]: {
        ...activeConversation,
        messages: activeConversation.messages.filter(
          (message) => message.id !== errorMessageId,
        ),
        pendingTurns: [
          ...activeConversation.pendingTurns,
          {
            id: turnId,
            content,
            retryErrorId: errorMessageId,
            isActive: !activeConversation.pendingTurns.some(
              (turn) => turn.isActive,
            ),
          },
        ],
      },
    }));
    try {
      replaceConversation(
        await invoke<Conversation>("retry_message", {
          conversationId,
          errorMessageId,
          turnId,
        }),
      );
    } catch (error) {
      setConversationDetails((current) => ({
        ...current,
        [conversationId]: snapshot,
      }));
      setHistoryError(
        `Could not retry the message: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  return {
    activeConversation,
    conversations,
    createNewConversation,
    archiveConversation,
    historyError,
    deleteTurn,
    isSending:
      !isHistoryLoaded ||
      Boolean(activeConversation?.pendingTurns.some((turn) => turn.isActive)) ||
      Boolean(
        activeConversation?.messages.some((message) => message.streaming),
      ),
    pendingTurns: activeConversation?.pendingTurns ?? [],
    retryMessage,
    sendMessage,
    setActiveId: activateConversation,
    setConversationModel,
    setConversationProvider,
    setConversationTitle,
    selectWorkspace,
    steerTurn,
  };
}

const toConversationListItem = (
  conversation: Conversation,
): ConversationListItem => ({
  id: conversation.id,
  title: conversation.title,
  updatedAt: conversation.updatedAt,
});

const replaceConversationListItem = (
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

const mergePendingMessages = (
  current: Conversation,
  replacement: Conversation,
): Conversation => {
  const replacementIds = new Set(
    replacement.messages.map((message) => message.id),
  );
  const pendingIds = new Set(replacement.pendingTurns.map((turn) => turn.id));
  const pendingMessages = current.messages.filter(
    (message) =>
      message.requestId &&
      pendingIds.has(message.requestId) &&
      !replacementIds.has(message.id),
  );
  return pendingMessages.length === 0
    ? replacement
    : {
        ...replacement,
        messages: [...replacement.messages, ...pendingMessages],
      };
};

const applyStreamUpdate = (
  conversation: Conversation,
  update: ConversationMessageStream,
): Conversation => {
  const pendingTurn = conversation.pendingTurns.find(
    (turn) => turn.id === update.turnId,
  );
  const existingAssistantIndex = conversation.messages.findIndex(
    (message) => message.id === update.messageId,
  );
  const existingAssistant =
    existingAssistantIndex >= 0
      ? conversation.messages[existingAssistantIndex]
      : undefined;
  if (!pendingTurn && !existingAssistant?.streaming) {
    return conversation;
  }

  const messages = [...conversation.messages];
  let userIndex = messages.findIndex(
    (message) => message.id === update.userMessageId,
  );
  if (userIndex < 0) {
    messages.push({
      id: update.userMessageId,
      role: "user",
      content: update.userContent,
      requestId: update.turnId,
    });
    userIndex = messages.length - 1;
  } else {
    messages[userIndex] = {
      ...messages[userIndex],
      requestId: update.turnId,
    };
  }

  if (!update.content) {
    return {
      ...conversation,
      messages,
    };
  }

  if (existingAssistantIndex >= 0) {
    if (
      messages[existingAssistantIndex].content.length > update.content.length
    ) {
      return conversation;
    }
    messages[existingAssistantIndex] = {
      ...messages[existingAssistantIndex],
      content: update.content,
      model: update.model,
      requestId: update.turnId,
      streaming: true,
    };
  } else {
    const insertionIndex =
      update.userMessageId === update.turnId ? userIndex + 1 : messages.length;
    messages.splice(insertionIndex, 0, {
      id: update.messageId,
      role: "assistant",
      content: update.content,
      model: update.model,
      requestId: update.turnId,
      streaming: true,
    });
  }

  return {
    ...conversation,
    messages,
  };
};
