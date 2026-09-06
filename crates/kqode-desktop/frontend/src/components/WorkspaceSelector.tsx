import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderIcon } from "./Icons";

type WorkspaceSelectorProps = {
  disabled: boolean;
  onChange: (workspacePath: string) => Promise<void>;
  workspacePath?: string;
};

const folderName = (path: string) => {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
};

export function WorkspaceSelector({
  disabled,
  onChange,
  workspacePath,
}: WorkspaceSelectorProps) {
  const [error, setError] = useState<string>();

  const selectWorkspace = async () => {
    setError(undefined);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select workspace folder",
      });
      if (selected) await onChange(selected);
    } catch (selectionError) {
      setError(`Could not select folder: ${String(selectionError)}`);
    }
  };

  const label = workspacePath ? folderName(workspacePath) : "Select folder";

  return (
    <div className="composer-control">
      <button
        className="composer-workspace-trigger"
        disabled={disabled}
        onClick={() => void selectWorkspace()}
        title={
          disabled
            ? workspacePath
              ? `${workspacePath} (locked after conversation started)`
              : "Workspace is locked after the conversation starts"
            : workspacePath
        }
        type="button"
      >
        <FolderIcon size={17} />
        <span>{label}</span>
      </button>
      {error && <span className="composer-model-error">{error}</span>}
    </div>
  );
}
