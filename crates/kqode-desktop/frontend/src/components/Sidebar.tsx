import { MouseEvent, useEffect, useState } from "react";
import type { ConversationListItem } from "../types";
import { ComposeIcon, SettingsIcon } from "./Icons";
import "./Sidebar.css";

type ConversationGroup = {
  key: string;
  label: string;
  conversations: ConversationListItem[];
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const groupConversationsByDay = (
  conversations: ConversationListItem[],
): ConversationGroup[] => {
  const now = new Date();
  const todayKey = localDateKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = localDateKey(yesterday);
  const groups = new Map<string, ConversationGroup>();

  [...conversations]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .forEach((conversation) => {
      const updatedDate = new Date(conversation.updatedAt);
      const key = localDateKey(updatedDate);
      const label =
        key === todayKey
          ? "Today"
          : key === yesterdayKey
            ? "Yesterday"
            : dateFormatter.format(updatedDate);
      const group = groups.get(key);
      if (group) {
        group.conversations.push(conversation);
      } else {
        groups.set(key, { key, label, conversations: [conversation] });
      }
    });

  return [...groups.values()];
};

type SidebarProps = {
  activeId: string;
  conversations: ConversationListItem[];
  isSettingsOpen: boolean;
  onArchive: (id: string) => Promise<void>;
  onCreate: () => void;
  onOpenSettings: () => void;
  onRename: (id: string, title: string) => Promise<void>;
  onSelect: (id: string) => void;
};

export function Sidebar({
  activeId,
  conversations,
  isSettingsOpen,
  onArchive,
  onCreate,
  onOpenSettings,
  onRename,
  onSelect,
}: SidebarProps) {
  const [contextMenu, setContextMenu] = useState<{
    conversation: ConversationListItem;
    x: number;
    y: number;
  }>();
  const [pendingArchive, setPendingArchive] =
    useState<ConversationListItem>();
  const [archiveError, setArchiveError] = useState<string>();
  const [isArchiving, setIsArchiving] = useState(false);
  const [pendingRename, setPendingRename] =
    useState<ConversationListItem>();
  const [renameTitle, setRenameTitle] = useState("");
  const [renameError, setRenameError] = useState<string>();
  const [isRenaming, setIsRenaming] = useState(false);
  const conversationGroups = groupConversationsByDay(conversations);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(undefined);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  const openContextMenu = (
    event: MouseEvent,
    conversation: ConversationListItem,
  ) => {
    event.preventDefault();
    setContextMenu({
      conversation,
      x: Math.min(event.clientX, window.innerWidth - 190),
      y: Math.min(event.clientY, window.innerHeight - 60),
    });
  };

  const updateConversationTooltip = (
    event: MouseEvent<HTMLButtonElement>,
    title: string,
  ) => {
    const titleElement = event.currentTarget.querySelector<HTMLElement>(
      ".conversation-title",
    );
    event.currentTarget.title =
      titleElement && titleElement.scrollWidth > titleElement.clientWidth
        ? title
        : "";
  };

  const confirmArchive = async () => {
    if (!pendingArchive) return;
    setIsArchiving(true);
    setArchiveError(undefined);
    try {
      await onArchive(pendingArchive.id);
      setPendingArchive(undefined);
    } catch (error) {
      setArchiveError(String(error));
    } finally {
      setIsArchiving(false);
    }
  };

  const confirmRename = async () => {
    const title = renameTitle.trim();
    if (!pendingRename || !title) return;
    setIsRenaming(true);
    setRenameError(undefined);
    try {
      await onRename(pendingRename.id, title);
      setPendingRename(undefined);
    } catch (error) {
      setRenameError(String(error));
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">KQ</div>
        <span>KQode</span>
        <button
          aria-label="Open settings"
          className={`settings-button ${isSettingsOpen ? "active" : ""}`}
          onClick={onOpenSettings}
          type="button"
        >
          <SettingsIcon />
        </button>
      </div>

      <button className="new-chat-button" onClick={onCreate} type="button">
        <ComposeIcon />
        <span>New conversation</span>
      </button>

      <div className="conversation-section">
        <p className="section-label">Conversations</p>
        <nav className="conversation-list" aria-label="Conversations">
          {conversationGroups.map((group) => (
            <section className="conversation-group" key={group.key}>
              <p className="conversation-group-label">{group.label}</p>
              {group.conversations.map((conversation) => (
                <button
                  className={`conversation-item ${
                    conversation.id === activeId ? "active" : ""
                  }`}
                  key={conversation.id}
                  onClick={() => onSelect(conversation.id)}
                  onContextMenu={(event) =>
                    openContextMenu(event, conversation)
                  }
                  onMouseEnter={(event) =>
                    updateConversationTooltip(event, conversation.title)
                  }
                  type="button"
                >
                  <span className="conversation-title">
                    {conversation.title}
                  </span>
                </button>
              ))}
            </section>
          ))}
        </nav>
      </div>

      <div className="sidebar-footer">
        <span className="status-dot" />
        Local Rust backend
      </div>

      {contextMenu && (
        <div
          className="conversation-context-menu"
          role="menu"
          style={{
            left: contextMenu.x,
            top: Math.min(contextMenu.y, window.innerHeight - 100),
          }}
        >
          <button
            className="rename"
            onClick={() => {
              setPendingRename(contextMenu.conversation);
              setRenameTitle(contextMenu.conversation.title);
              setRenameError(undefined);
              setContextMenu(undefined);
            }}
            role="menuitem"
            type="button"
          >
            Rename
          </button>
          <button
            className="archive"
            onClick={() => {
              setPendingArchive(contextMenu.conversation);
              setArchiveError(undefined);
              setContextMenu(undefined);
            }}
            role="menuitem"
            type="button"
          >
            Archive
          </button>
        </div>
      )}

      {pendingRename && (
        <div
          className="conversation-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isRenaming) {
              setPendingRename(undefined);
            }
          }}
          role="presentation"
        >
          <form
            aria-labelledby="rename-conversation-title"
            aria-modal="true"
            className="conversation-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              void confirmRename();
            }}
            role="dialog"
          >
            <h2 id="rename-conversation-title">Rename conversation</h2>
            <input
              aria-label="Conversation title"
              autoFocus
              disabled={isRenaming}
              onChange={(event) => setRenameTitle(event.currentTarget.value)}
              value={renameTitle}
            />
            {renameError && (
              <p className="conversation-dialog-error">{renameError}</p>
            )}
            <div className="conversation-dialog-actions">
              <button
                disabled={isRenaming}
                onClick={() => setPendingRename(undefined)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rename"
                disabled={isRenaming || !renameTitle.trim()}
                type="submit"
              >
                {isRenaming ? "Renaming..." : "Rename"}
              </button>
            </div>
          </form>
        </div>
      )}

      {pendingArchive && (
        <div
          className="conversation-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isArchiving) {
              setPendingArchive(undefined);
            }
          }}
          role="presentation"
        >
          <div
            aria-labelledby="archive-conversation-title"
            aria-modal="true"
            className="conversation-dialog"
            role="dialog"
          >
            <h2 id="archive-conversation-title">Archive conversation?</h2>
            <p>
              "{pendingArchive.title}" will be removed from the conversation
              list, but its messages will remain stored locally.
            </p>
            {archiveError && (
              <p className="conversation-dialog-error">{archiveError}</p>
            )}
            <div className="conversation-dialog-actions">
              <button
                disabled={isArchiving}
                onClick={() => setPendingArchive(undefined)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="archive"
                disabled={isArchiving}
                onClick={() => void confirmArchive()}
                type="button"
              >
                {isArchiving ? "Archiving..." : "Archive"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
