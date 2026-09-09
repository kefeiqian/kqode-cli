import { useCallback, useEffect, useState } from "react";
import { ToastContainer } from "react-toastify";
import { ChatPanel } from "./components/ChatPanel";
import { ProviderPicker } from "./components/ProviderPicker";
import { SettingsPage } from "./components/SettingsPage";
import { Sidebar } from "./components/Sidebar";
import { useConversationHistory } from "./useConversationHistory";
import { useLlmSettings } from "./useLlmSettings";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";

function App() {
  const [activePage, setActivePage] = useState<"chat" | "settings">("chat");
  const [settingsDirty, setSettingsDirty] = useState(false);
  const {
    activateChatConfiguration,
    chatModels,
    isLoading: isLoadingSettings,
    loadError: settingsLoadError,
    loadProviderSettings,
    models,
    modelsError,
    modelsLoading,
    refreshModels,
    saveSettings,
    settings,
    testProviderConnection,
  } = useLlmSettings();
  const {
    activeConversation,
    conversations,
    createNewConversation,
    deleteTurn,
    archiveConversation,
    historyError,
    isSending,
    pendingTurns,
    retryMessage,
    sendMessage,
    setActiveId,
    setConversationModel,
    setConversationProvider,
    setConversationTitle,
    selectWorkspace,
    steerTurn,
  } = useConversationHistory();

  useEffect(() => {
    if (
      isLoadingSettings ||
      activePage !== "chat" ||
      !activeConversation ||
      !activeConversation.provider
    ) {
      return;
    }
    if (
      settings?.provider === activeConversation.provider &&
      (!activeConversation.model ||
        settings.model === activeConversation.model)
    ) {
      return;
    }

    void activateChatConfiguration(
      activeConversation.provider,
      activeConversation.model,
    );
  }, [
    activeConversation?.id,
    activeConversation?.model,
    activeConversation?.provider,
    activePage,
    isLoadingSettings,
    settings?.provider,
  ]);

  useEffect(() => {
    if (!settingsDirty) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [settingsDirty]);

  const confirmLeaveSettings = () => {
    if (activePage !== "settings" || !settingsDirty) return true;
    return window.confirm(
      "You have unsaved settings changes. Discard them?",
    );
  };

  const createNewConversationAndOpenChat = () => {
    if (!confirmLeaveSettings()) return;
    createNewConversation();
    setSettingsDirty(false);
    setActivePage("chat");
  };

  const selectConversationAndOpenChat = (id: string) => {
    if (!confirmLeaveSettings()) return;
    setActiveId(id);
    setSettingsDirty(false);
    setActivePage("chat");
  };

  const handleSettingsDirtyChange = useCallback((isDirty: boolean) => {
    setSettingsDirty(isDirty);
  }, []);

  if (!activeConversation) {
    return (
      <main className="app-shell">
        <p>{settingsLoadError ?? historyError ?? "Loading KQode..."}</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <Sidebar
        activeId={activeConversation.id}
        conversations={conversations}
        isSettingsOpen={activePage === "settings"}
        onCreate={createNewConversationAndOpenChat}
        onArchive={archiveConversation}
        onOpenSettings={() => setActivePage("settings")}
        onRename={setConversationTitle}
        onSelect={selectConversationAndOpenChat}
      />
      {activePage === "settings" ? (
        settings ? (
          <SettingsPage
            initialSettings={settings}
            isLoading={isLoadingSettings}
            key={isLoadingSettings ? "settings-loading" : "settings-loaded"}
            loadError={settingsLoadError}
            onLoadProvider={loadProviderSettings}
            models={models}
            modelsError={modelsError}
            modelsLoading={modelsLoading}
            onDirtyChange={handleSettingsDirtyChange}
            onRefreshModels={refreshModels}
            onSave={saveSettings}
            onTestProvider={testProviderConnection}
          />
        ) : (
          <section className="settings-page">
            <div className="settings-card">
              <h2>Select a provider</h2>
              <p>Choose which provider settings to configure.</p>
              <ProviderPicker
                disabled={isLoadingSettings}
                onChange={(provider) =>
                  void activateChatConfiguration(provider)
                }
              />
              {settingsLoadError && (
                <p className="settings-error">{settingsLoadError}</p>
              )}
            </div>
          </section>
        )
      ) : (
        <ChatPanel
          apiBaseUrl={
            settings?.provider === activeConversation.provider
              ? (settings?.apiBaseUrl ?? "")
              : ""
          }
          conversation={activeConversation}
          error={historyError}
          hasApiKey={Boolean(
            activeConversation.provider &&
              settings &&
              settings.provider === activeConversation.provider &&
              (settings.provider === "copilot" ||
                settings.provider === "copilot_sdk" ||
                settings.apiKey.trim() ||
                settings.apiKeyPreview),
          )}
          isSending={isSending}
          pendingTurns={pendingTurns}
          model={activeConversation.model}
          models={activeConversation.provider ? chatModels : []}
          modelsError={activeConversation.provider ? modelsError : undefined}
          modelsLoading={
            Boolean(activeConversation.provider) && modelsLoading
          }
          onModelChange={setConversationModel}
          onDeleteTurn={deleteTurn}
          onOpenSettings={() => setActivePage("settings")}
          onProviderChange={async (provider) => {
            await setConversationProvider(provider, undefined);
          }}
          onSend={sendMessage}
          onRetry={retryMessage}
          onSteerTurn={steerTurn}
          onWorkspaceSelect={selectWorkspace}
          provider={activeConversation.provider}
        />
      )}
      <ToastContainer
        autoClose={2000}
        closeOnClick
        newestOnTop
        position="top-right"
        theme="dark"
      />
    </main>
  );
}

export default App;
