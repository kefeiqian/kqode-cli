import {
  archiveStoredConversation,
  createStoredConversation,
  deleteStoredTurn,
  loadStoredConversation,
  retryStoredMessage,
  sendStoredMessage,
  steerStoredTurn,
  updateStoredConversation,
} from "./conversationStorage";
import { toConversationListItem } from "./conversationMerge";
import type { Provider } from "./types";
import { useConversationSync } from "./useConversationSync";

export function useConversationHistory() {
  const sync = useConversationSync();
  const {
    activeConversation,
    activeId,
    activateConversation,
    conversationDetails,
    conversations,
    isHistoryLoaded,
    replaceConversation,
    setActiveId,
    setConversationDetails,
    setConversations,
    setHistoryError,
  } = sync;

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
      replaceConversation(replacement);
    }
    setConversations(remaining);
    if (activeId === conversationId) activateConversation(remaining[0].id);
  };

  const setConversationModel = async (model: string) => {
    if (!activeConversation) return;
    replaceConversation(
      await updateStoredConversation({ ...activeConversation, model }),
    );
  };

  const setConversationProvider = async (
    provider?: Provider,
    model?: string,
  ) => {
    if (!activeConversation) return;
    replaceConversation(
      await updateStoredConversation({
        ...activeConversation,
        provider,
        model,
      }),
    );
  };

  const setConversationTitle = async (
    conversationId: string,
    title: string,
  ) => {
    const conversation =
      conversationDetails[conversationId] ??
      (await loadStoredConversation(conversationId));
    replaceConversation(await updateStoredConversation(conversation, title));
  };

  const sendMessage = async (content: string) => {
    if (!activeConversation) return;
    const conversationId = activeConversation.id;
    setHistoryError(undefined);
    try {
      replaceConversation(
        await sendStoredMessage(conversationId, content),
      );
    } catch (error) {
      setHistoryError(String(error));
      await sync.refreshConversation(conversationId);
      throw error;
    }
  };

  const steerTurn = async (turnId: string) => {
    if (!activeConversation) return;
    try {
      replaceConversation(
        await steerStoredTurn(activeConversation.id, turnId),
      );
    } catch (error) {
      setHistoryError(`Could not steer the queued message: ${String(error)}`);
    }
  };

  const deleteTurn = async (turnId: string) => {
    if (!activeConversation) return;
    const retryErrorId = activeConversation.pendingTurns.find(
      (turn) => turn.id === turnId,
    )?.retryErrorId;
    try {
      const replacement = await deleteStoredTurn(
        activeConversation.id,
        turnId,
      );
      if (retryErrorId) {
        await sync.restoreMessage(activeConversation.id, retryErrorId);
      }
      replaceConversation(replacement);
    } catch (error) {
      setHistoryError(`Could not delete the queued message: ${String(error)}`);
    }
  };

  const retryMessage = async (errorMessageId: string) => {
    if (!activeConversation) return;
    const errorIndex = activeConversation.messages.findIndex(
      (message) => message.id === errorMessageId,
    );
    if (
      errorIndex <= 0 ||
      activeConversation.messages[errorIndex - 1].role !== "user"
    ) {
      return;
    }
    try {
      const replacement = await retryStoredMessage(
        activeConversation.id,
        errorMessageId,
      );
      const retryTurnId = replacement.pendingTurns.find(
        (turn) => turn.retryErrorId === errorMessageId,
      )?.id;
      sync.tombstoneMessage(
        activeConversation.id,
        errorMessageId,
        retryTurnId,
      );
      replaceConversation(replacement);
    } catch (error) {
      setHistoryError(`Could not retry the message: ${String(error)}`);
    }
  };

  return {
    activeConversation,
    conversations,
    createNewConversation,
    archiveConversation,
    historyError: sync.historyError,
    deleteTurn,
    hasMoreMessages: activeConversation?.hasMoreMessages ?? false,
    isLoadingOlderMessages: sync.isLoadingOlderMessages,
    isSending:
      !isHistoryLoaded ||
      Boolean(activeConversation?.pendingTurns.some((turn) => turn.isActive)) ||
      Boolean(activeConversation?.messages.some((message) => message.streaming)),
    loadOlderMessages: sync.loadOlderMessages,
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
