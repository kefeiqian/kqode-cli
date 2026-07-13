import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME } from '@theme/themeConfig.ts';
import { PRODUCT_NAME } from '@constants/product.ts';
import { createAppRuntime, type AppRuntime } from '@/bootstrap.ts';

const SESSION_ID = '019f5a2b-15e0-7ef1-9ad2-10a132448b7';
const WORKSPACE_CWD = '/workspace';
const PRODUCT_VERSION = '0.1.3';

const {
  mockClient,
  mockCreateSessionLogger,
  mockCreateSourceBackendClient,
  mockDisableTerminalKeyboardProtocol,
  mockEnableTerminalKeyboardProtocol,
  mockEnterAlternateScreen,
  mockLeaveAlternateScreen,
  mockResetTerminalBackground,
  mockResetTerminalWindowTitle,
  mockResolveInitialTheme,
  mockResolveProductVersion,
  mockResolveRepoRoot,
  mockResolveSessionSeed,
  mockResolveWorkspaceCwd,
  mockSetSessionWindowTitle,
  mockSetTerminalBackground,
  mockSetTerminalWindowTitle,
  mockUnsubscribeTranscript
} = vi.hoisted(() => {
  const mockUnsubscribeTranscript = vi.fn();
  const mockClient = {
    submit: vi.fn(),
    onTranscriptEvent: vi.fn(),
    clearConversation: vi.fn(),
    cancelTurn: vi.fn(),
    gitStatus: vi.fn(),
    listProviders: vi.fn(),
    getActiveSelection: vi.fn(),
    setActiveSelection: vi.fn(),
    clearProviderKey: vi.fn(),
    setProviderKey: vi.fn(),
    listModels: vi.fn(),
    listSessions: vi.fn(),
    resumeSession: vi.fn(),
    getTheme: vi.fn(),
    setTheme: vi.fn(),
    listMemories: vi.fn(),
    editMemory: vi.fn(),
    onReady: vi.fn(),
    ensureStarted: vi.fn(),
    relaunch: vi.fn(),
    dispose: vi.fn()
  };
  const mockLogger = {
    log: vi.fn(),
    openSession: vi.fn(),
    openOrphan: vi.fn(),
    close: vi.fn()
  };
  return {
    mockClient,
    mockCreateSessionLogger: vi.fn(() => mockLogger),
    mockCreateSourceBackendClient: vi.fn(() => mockClient),
    mockDisableTerminalKeyboardProtocol: vi.fn(),
    mockEnableTerminalKeyboardProtocol: vi.fn(),
    mockEnterAlternateScreen: vi.fn(),
    mockLeaveAlternateScreen: vi.fn(),
    mockResetTerminalBackground: vi.fn(),
    mockResetTerminalWindowTitle: vi.fn(),
    mockResolveInitialTheme: vi.fn(),
    mockResolveProductVersion: vi.fn(),
    mockResolveRepoRoot: vi.fn(),
    mockResolveSessionSeed: vi.fn(),
    mockResolveWorkspaceCwd: vi.fn(),
    mockSetSessionWindowTitle: vi.fn(),
    mockSetTerminalBackground: vi.fn(),
    mockSetTerminalWindowTitle: vi.fn(),
    mockUnsubscribeTranscript
  };
});

vi.mock('@backend/client/sourceBackendClient.ts', () => ({
  createSourceBackendClient: mockCreateSourceBackendClient
}));
vi.mock('@backend/log/sessionLogger.ts', () => ({
  createSessionLogger: mockCreateSessionLogger
}));
vi.mock('@components/AppExitSummary/resolveSessionSeed.ts', () => ({
  resolveSessionSeed: mockResolveSessionSeed
}));
vi.mock('@libs/path/runtimePaths.ts', () => ({
  resolveRepoRoot: mockResolveRepoRoot,
  resolveWorkspaceCwd: mockResolveWorkspaceCwd
}));
vi.mock('@libs/product/productMetadata.ts', () => ({
  resolveProductVersion: mockResolveProductVersion
}));
vi.mock('@libs/terminal/alternateScreen.ts', () => ({
  enterAlternateScreen: mockEnterAlternateScreen,
  leaveAlternateScreen: mockLeaveAlternateScreen
}));
vi.mock('@libs/terminal/keyboardProtocol.ts', () => ({
  disableTerminalKeyboardProtocol: mockDisableTerminalKeyboardProtocol,
  enableTerminalKeyboardProtocol: mockEnableTerminalKeyboardProtocol
}));
vi.mock('@libs/terminal/terminalBackground.ts', () => ({
  resetTerminalBackground: mockResetTerminalBackground,
  setTerminalBackground: mockSetTerminalBackground
}));
vi.mock('@libs/terminal/windowTitle.ts', () => ({
  resetTerminalWindowTitle: mockResetTerminalWindowTitle,
  setSessionWindowTitle: mockSetSessionWindowTitle,
  setTerminalWindowTitle: mockSetTerminalWindowTitle
}));
vi.mock('@theme/resolveInitialTheme.ts', () => ({
  resolveInitialTheme: mockResolveInitialTheme
}));

describe('createAppRuntime window title', () => {
  let runtime: AppRuntime | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.onTranscriptEvent.mockReturnValue(mockUnsubscribeTranscript);
    mockClient.ensureStarted.mockResolvedValue(undefined);
    mockClient.gitStatus.mockResolvedValue(null);
    mockClient.relaunch.mockResolvedValue(undefined);
    mockClient.listSessions.mockResolvedValue({ sessions: [] });
    mockClient.resumeSession.mockResolvedValue({
      sessionId: SESSION_ID,
      workspaceCwd: WORKSPACE_CWD,
      canonicalWorkspaceCwd: WORKSPACE_CWD,
      turns: []
    });
    mockResolveInitialTheme.mockResolvedValue(DEFAULT_THEME);
    mockResolveProductVersion.mockReturnValue(PRODUCT_VERSION);
    mockResolveRepoRoot.mockReturnValue('/repo');
    mockResolveSessionSeed.mockReturnValue({ startedAt: 1, baseline: undefined });
    mockResolveWorkspaceCwd.mockReturnValue(WORKSPACE_CWD);
  });

  afterEach(() => {
    runtime?.dispose();
    runtime = undefined;
  });

  it('writes the product title on a fresh launch', async () => {
    runtime = await createAppRuntime({ entryUrl: import.meta.url });

    expect(mockEnterAlternateScreen).toHaveBeenCalledOnce();
    expect(mockEnableTerminalKeyboardProtocol).toHaveBeenCalledOnce();
    expect(mockSetTerminalWindowTitle).toHaveBeenCalledWith(PRODUCT_NAME, PRODUCT_VERSION);
    expect(mockSetSessionWindowTitle).not.toHaveBeenCalled();
  });

  it('restores keyboard mode before leaving the alternate screen on dispose', async () => {
    runtime = await createAppRuntime({ entryUrl: import.meta.url });

    runtime.dispose();
    runtime = undefined;

    expect(mockDisableTerminalKeyboardProtocol).toHaveBeenCalledOnce();
    expect(mockLeaveAlternateScreen).toHaveBeenCalledOnce();
    expect(mockDisableTerminalKeyboardProtocol.mock.invocationCallOrder[0]).toBeLessThan(
      mockLeaveAlternateScreen.mock.invocationCallOrder[0] ?? 0
    );
  });

  it('keeps a boot-resumed session title instead of overwriting it with the product title', async () => {
    mockClient.listSessions.mockResolvedValue({
      sessions: [
        {
          sessionId: SESSION_ID,
          summary: 'Fix resume title',
          status: 'Idle',
          modifiedAt: 1,
          createdAt: 1,
          folder: WORKSPACE_CWD
        }
      ]
    });

    runtime = await createAppRuntime({ entryUrl: import.meta.url, resumeSessionId: SESSION_ID });

    expect(mockSetSessionWindowTitle).toHaveBeenCalledWith(PRODUCT_NAME, 'Fix resume title');
    expect(mockSetTerminalWindowTitle).not.toHaveBeenCalled();
  });
});
