import { invoke } from "@tauri-apps/api/core";
import type {
  Conversation,
  ConversationListItem,
  Message,
  MessagePage,
  Provider,
} from "./types";

export const listStoredConversations = () =>
  invoke<ConversationListItem[]>("list_conversations");

export const createStoredConversation = (
  workspacePath?: string,
  provider?: Provider,
  model?: string,
) =>
  invoke<Conversation>("create_conversation", {
    workspacePath: workspacePath ?? null,
    provider: provider ?? null,
    model: model ?? null,
  });

export const updateStoredConversation = (
  conversation: Conversation,
  title?: string,
) =>
  invoke<Conversation>("update_conversation", {
    conversationId: conversation.id,
    title: title ?? null,
    provider: conversation.provider ?? null,
    model: conversation.model ?? null,
  });

export const archiveStoredConversation = (conversationId: string) =>
  invoke<void>("archive_conversation", { conversationId });

export const loadStoredConversation = (conversationId: string) =>
  invoke<Conversation>("load_conversation", { conversationId });

export const loadStoredMessage = (
  conversationId: string,
  messageId: string,
) =>
  invoke<Message>("load_conversation_message", {
    conversationId,
    messageId,
  });

export const loadOlderStoredMessages = (
  conversationId: string,
  beforePosition: number,
) =>
  invoke<MessagePage>("load_older_conversation_messages", {
    conversationId,
    beforePosition,
  });

export const sendStoredMessage = (
  conversationId: string,
  content: string,
) =>
  invoke<Conversation>("send_message", {
  conversationId,
  content,
  });

export const retryStoredMessage = (
  conversationId: string,
  errorMessageId: string,
) =>
  invoke<Conversation>("retry_message", {
  conversationId,
  errorMessageId,
  });

export const steerStoredTurn = (
  conversationId: string,
  turnId: string,
) =>
  invoke<Conversation>("steer_conversation_turn", {
    conversationId,
    turnId,
  });

export const deleteStoredTurn = (
  conversationId: string,
  turnId: string,
) =>
  invoke<Conversation>("delete_conversation_turn", {
    conversationId,
    turnId,
  });
