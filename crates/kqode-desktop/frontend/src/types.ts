export type MessageRole = "user" | "assistant" | "error";

export type Message = {
  id: string;
  role: MessageRole;
  content: string;
  model?: string;
  requestId?: string;
  streaming?: boolean;
  revision: number;
  position: number;
};

export type ConversationMessageStream = {
  conversationId: string;
  turnId: string;
  messageId: string;
  revision: number;
};

export type ConversationUpdated = {
  conversationId: string;
};

export type MessagePage = {
  messages: Message[];
  hasMoreMessages: boolean;
  oldestMessagePosition?: number;
};

export type PendingTurn = {
  id: string;
  content: string;
  retryErrorId?: string;
  isActive: boolean;
};

export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  workspacePath?: string;
  provider?: Provider;
  model?: string;
  messages: Message[];
  pendingTurns: PendingTurn[];
  hasMoreMessages: boolean;
  oldestMessagePosition?: number;
};

export type ConversationListItem = {
  id: string;
  title: string;
  updatedAt: number;
};

export type Provider =
  | "kimi"
  | "openai"
  | "anthropic"
  | "deepseek"
  | "copilot"
  | "copilot_sdk"
  | "custom";

export type LlmSettings = {
  provider: Provider;
  apiBaseUrl: string;
  apiKey: string;
  apiKeyPreview: string;
  highlightedModels: string[];
  model: string;
};

export type ProviderConnectionStatus = {
  provider: Provider;
  models: string[];
};
