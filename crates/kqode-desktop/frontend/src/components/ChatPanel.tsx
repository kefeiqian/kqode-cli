import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { toast } from "react-toastify";
import type { Conversation, PendingTurn, Provider } from "../types";
import { RetryIcon, SendIcon, SparkIcon } from "./Icons";
import { MarkdownMessage } from "./MarkdownMessage";
import { MessageActions } from "./MessageActions";
import { ModelSelector } from "./ModelSelector";
import { ProviderSelector } from "./ProviderSelector";
import { QueuedTurns } from "./QueuedTurns";
import { WorkspaceSelector } from "./WorkspaceSelector";
import "./ChatPanel.css";
import "./Composer.css";

const COMPOSER_MAX_ROWS = 10;

type ChatPanelProps = {
  apiBaseUrl: string;
  hasApiKey: boolean;
  conversation: Conversation;
  error?: string;
  isSending: boolean;
  hasMoreMessages: boolean;
  isLoadingOlderMessages: boolean;
  model?: string;
  models: string[];
  modelsError?: string;
  modelsLoading: boolean;
  pendingTurns: PendingTurn[];
  onDeleteTurn: (turnId: string) => Promise<void>;
  onModelChange: (model: string) => Promise<void>;
  onLoadOlderMessages: () => Promise<boolean>;
  onOpenSettings: () => void;
  onProviderChange: (provider?: Provider) => Promise<void>;
  onSend: (content: string) => Promise<void>;
  onRetry: (errorMessageId: string) => Promise<void>;
  onSteerTurn: (turnId: string) => Promise<void>;
  onWorkspaceSelect: (workspacePath: string) => Promise<void>;
  provider?: Provider;
};

export function ChatPanel({
  apiBaseUrl,
  hasApiKey,
  conversation,
  error,
  isSending,
  hasMoreMessages,
  isLoadingOlderMessages,
  model,
  models,
  modelsError,
  modelsLoading,
  pendingTurns,
  onDeleteTurn,
  onModelChange,
  onLoadOlderMessages,
  onOpenSettings,
  onProviderChange,
  onSend,
  onRetry,
  onSteerTurn,
  onWorkspaceSelect,
  provider,
}: ChatPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [configurationError, setConfigurationError] = useState<string>();
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const restoreScrollHeightRef = useRef<number | undefined>(undefined);
  const stickToBottomRef = useRef(true);
  const previousConversationIdRef = useRef(conversation.id);
  const draft = drafts[conversation.id] ?? "";
  const retryErrorIds = new Set(
    pendingTurns.flatMap((turn) =>
      turn.retryErrorId ? [turn.retryErrorId] : [],
    ),
  );
  const startedTurnIds = new Set(
    conversation.messages.flatMap((message) =>
      message.role !== "user" && message.requestId
        ? [message.requestId]
        : [],
    ),
  );
  const visiblePendingTurnId =
    pendingTurns.find((turn) => turn.isActive)?.id ?? pendingTurns[0]?.id;
  const transcriptMessages = conversation.messages.filter(
    (message) =>
      !retryErrorIds.has(message.id) &&
      (message.role !== "user" ||
        !message.requestId ||
        !pendingTurns.some((turn) => turn.id === message.requestId) ||
        startedTurnIds.has(message.requestId) ||
        message.requestId === visiblePendingTurnId),
  );
  const displayedPendingTurns = pendingTurns.filter(
    (turn) => !startedTurnIds.has(turn.id),
  );
  const queuedTurnCount = displayedPendingTurns.filter(
    (turn) => !turn.isActive,
  ).length;

  const setDraft = useCallback(
    (update: string | ((current: string) => string)) => {
      const conversationId = conversation.id;
      setDrafts((currentDrafts) => {
        const currentDraft = currentDrafts[conversationId] ?? "";
        const nextDraft =
          typeof update === "function" ? update(currentDraft) : update;

        if (nextDraft === currentDraft) return currentDrafts;

        return {
          ...currentDrafts,
          [conversationId]: nextDraft,
        };
      });
    },
    [conversation.id],
  );

  const resizeComposer = useCallback(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight);
    const maxHeight = Math.ceil(lineHeight * COMPOSER_MAX_ROWS);
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    resizeComposer();
  }, [draft, resizeComposer]);

  useEffect(() => {
    window.addEventListener("resize", resizeComposer);
    return () => window.removeEventListener("resize", resizeComposer);
  }, [resizeComposer]);

  useLayoutEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) return;
    if (restoreScrollHeightRef.current !== undefined) {
      transcript.scrollTop +=
        transcript.scrollHeight - restoreScrollHeightRef.current;
      restoreScrollHeightRef.current = undefined;
      return;
    }
    if (
      previousConversationIdRef.current !== conversation.id ||
      stickToBottomRef.current
    ) {
      transcript.scrollTop = transcript.scrollHeight;
    }
    previousConversationIdRef.current = conversation.id;
  }, [conversation.id, conversation.messages, isSending]);

  useEffect(() => {
    setConfigurationError(undefined);
  }, [model, provider]);

  const copyConversationId = async () => {
    try {
      await navigator.clipboard.writeText(conversation.id);
      toast.success("Conversation ID copied");
    } catch {
      toast.error("Could not copy conversation ID");
    }
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const content = draft.trim();
    if (!content) return;
    if (!provider) {
      setConfigurationError("Select a provider before sending a message.");
      return;
    }
    if (!model?.trim()) {
      setConfigurationError("Select a model before sending a message.");
      return;
    }
    setConfigurationError(undefined);
    setDraft("");
    try {
      await onSend(content);
    } catch {
      setDraft((current) => current || content);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  const handleTranscriptScroll = () => {
    const transcript = transcriptRef.current;
    if (!transcript) return;
    stickToBottomRef.current =
      transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight <
      80;
    if (
      transcript.scrollTop <= 80 &&
      hasMoreMessages &&
      !isLoadingOlderMessages &&
      restoreScrollHeightRef.current === undefined
    ) {
      restoreScrollHeightRef.current = transcript.scrollHeight;
      void onLoadOlderMessages().then((loaded) => {
        if (!loaded) restoreScrollHeightRef.current = undefined;
      });
    }
  };

  return (
    <section className="chat-panel">
      <header className="chat-header">
        <div>
          <button
            aria-label={`Copy conversation ID ${conversation.id}`}
            className="conversation-id"
            onClick={() => void copyConversationId()}
            title="Copy conversation ID"
            type="button"
          >
            {conversation.id}
          </button>
          <h1>{conversation.title}</h1>
        </div>
        <span className="model-pill">{model || "No model selected"}</span>
      </header>

      <div
        className="transcript"
        onScroll={handleTranscriptScroll}
        ref={transcriptRef}
      >
        {error && <p className="settings-error">{error}</p>}
        {transcriptMessages.length === 0 && !isSending ? (
          <div className="empty-state">
            <div className="empty-icon">
              <SparkIcon />
            </div>
            <h2>What should we work on?</h2>
            <p>
              Start a conversation with KQode. The desktop UI keeps model
              credentials inside the Rust backend.
            </p>
          </div>
        ) : (
          <div className="message-list">
            {isLoadingOlderMessages && (
              <p className="older-messages-loading">Loading older messages…</p>
            )}
            {transcriptMessages.map((message, index) => {
              const actions = (
                <MessageActions
                  content={message.content}
                  model={message.model}
                />
              );

              return (
                <article className={`message ${message.role}`} key={message.id}>
                  {message.role === "user" ? (
                    <>
                      <div className="user-message-bubble">
                        <MarkdownMessage
                          content={message.content}
                          preserveLineBreaks
                        />
                      </div>
                      {actions}
                    </>
                  ) : (
                    <>
                      <div className="message-label">
                        {message.role === "error" ? "Error" : "KQode"}
                      </div>
                      <MarkdownMessage content={message.content} />
                      {message.role === "error" && (
                        <div className="error-actions">
                          <button
                            className="retry-message-button"
                            disabled={
                              index === 0 ||
                              transcriptMessages[index - 1].role !== "user"
                            }
                            onClick={() => void onRetry(message.id)}
                            type="button"
                          >
                            <RetryIcon />
                            Retry
                          </button>
                          <button
                            className="open-settings-button"
                            onClick={onOpenSettings}
                            type="button"
                          >
                            Open Settings
                          </button>
                        </div>
                      )}
                      {!message.streaming && actions}
                    </>
                  )}
                </article>
              );
            })}
            {isSending &&
              !transcriptMessages.some((message) => message.streaming) && (
                <article className="message assistant pending">
                  <div className="message-label">KQode</div>
                  <div
                    className="typing-indicator"
                    aria-label="KQode is replying"
                  >
                    <span />
                    <span />
                    <span />
                  </div>
                </article>
              )}
          </div>
        )}
      </div>

      <div className="composer-wrap">
        <div className="composer-controls">
          {conversation.messages.length === 0 && (
            <WorkspaceSelector
              disabled={isSending}
              onChange={onWorkspaceSelect}
              workspacePath={conversation.workspacePath}
            />
          )}
          <ProviderSelector
            apiBaseUrl={apiBaseUrl}
            disabled={isSending}
            onChange={onProviderChange}
            provider={provider}
          />
          <ModelSelector
            disabled={isSending}
            hasApiKey={hasApiKey}
            model={model ?? ""}
            models={models}
            modelsError={modelsError}
            modelsLoading={modelsLoading}
            onChange={onModelChange}
            onConfigureApiKey={onOpenSettings}
            providerSelected={Boolean(provider)}
          />
        </div>
        <QueuedTurns
          messages={displayedPendingTurns}
          onDelete={onDeleteTurn}
          onSteer={onSteerTurn}
        />
        <form className="composer" onSubmit={submit}>
          <textarea
            aria-label="Message KQode"
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message KQode"
            ref={composerTextareaRef}
            rows={1}
            value={draft}
          />
          <button
            aria-label="Send message"
            className="send-button"
            disabled={!draft.trim()}
            type="submit"
          >
            <SendIcon />
          </button>
        </form>
        {configurationError && (
          <p className="composer-config-error">{configurationError}</p>
        )}
        <p className="composer-hint">
          {queuedTurnCount > 0
            ? `${queuedTurnCount} message${queuedTurnCount === 1 ? "" : "s"} queued`
            : "Enter to send · Shift+Enter for a new line"}
        </p>
      </div>
    </section>
  );
}
