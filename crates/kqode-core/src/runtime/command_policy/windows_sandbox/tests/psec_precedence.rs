use super::{
    native_boundaries::grant,
    psec_run, sbox_spec,
    support::{Fixture, TEST_TIMEOUT},
};
use crate::runtime::SandboxProfile;
use std::path::Path;

/// Fixed cmdlets distinguish access denial from the production bootstrap's CLM failure.
#[tokio::test]
#[ignore = "fixed PSEC denial-precedence probe; fixture ACEs only, no elevation or host ACL changes"]
async fn native_psec_ancestor_denial_precedence() {
    for scope in ["none", "source", "fixture", "volume"] {
        let fixture = Fixture::new();
        grant(&fixture.root, "(RX)");
        grant(&fixture.source, "(RX)");
        grant(&fixture.source.join("input.txt"), "(M)");
        let command = fixture.command("exit 0", SandboxProfile::WorkspaceWrite, TEST_TIMEOUT, 4096);
        let context = command.context();
        let root = conventional(command.snapshot.root());
        let shell = conventional(Path::new(context.program()).parent().unwrap());
        let windows = std::env::var("SystemRoot").unwrap();
        let source = conventional(&fixture.source);
        let ancestor = conventional(&fixture.root);
        let volume = conventional(fixture.root.ancestors().last().unwrap());
        let denied = match scope {
            "none" => vec![],
            "source" => vec![source.as_str()],
            "fixture" => vec![ancestor.as_str()],
            "volume" => vec![volume.as_str()],
            _ => unreachable!(),
        };
        let spec = sbox_spec::encode_psec(&[&root], &[&shell, &windows], &denied);
        let read = quote(&format!("{root}\\input.txt"));
        let write = quote(&format!("{root}\\scratch\\created.txt"));
        let outside = quote(&format!("{source}\\input.txt"));
        let script = format!(
            "$ErrorActionPreference='Stop'; \
             try {{ $value=Get-Content -LiteralPath {read} -Raw; if ($value -ne 'original') {{ exit 9 }}; Write-Output 'copy-read:ok' }} \
             catch [System.UnauthorizedAccessException] {{ Write-Output 'copy-read:denied' }}; \
             try {{ Set-Content -LiteralPath {write} -Value 'copy' -NoNewline; Write-Output 'copy-write:ok' }} \
             catch [System.UnauthorizedAccessException] {{ Write-Output 'copy-write:denied' }}; \
             try {{ Set-Content -LiteralPath {outside} -Value 'outside-mutation' -NoNewline; Write-Output 'outside-write:ok' }} \
             catch [System.UnauthorizedAccessException] {{ Write-Output 'outside-write:denied' }}; exit 0"
        );
        let output = psec_run::run(context, &spec, Some(&script), 4096)
            .await
            .unwrap();
        assert_eq!(
            output.code, 0,
            "scope={scope} stdout={} stderr={}",
            output.stdout, output.stderr
        );
        let lines: Vec<_> = output.stdout.lines().collect();
        assert_eq!(
            lines,
            [
                "copy-read:ok",
                "copy-write:ok",
                if scope == "none" {
                    "outside-write:ok"
                } else {
                    "outside-write:denied"
                },
            ],
            "scope={scope}"
        );
        assert_eq!(
            std::fs::read_to_string(fixture.source.join("input.txt")).unwrap(),
            if lines[2] == "outside-write:ok" {
                "outside-mutation"
            } else {
                "original"
            }
        );
        assert_eq!(
            command
                .snapshot
                .root()
                .join("scratch\\created.txt")
                .exists(),
            lines[1] == "copy-write:ok"
        );
        assert_eq!(
            std::fs::read_to_string(command.snapshot.root().join("scratch\\created.txt")).unwrap(),
            "copy"
        );
    }
}

pub(super) fn conventional(path: &Path) -> String {
    let text = path.to_string_lossy();
    text.strip_prefix(r"\\?\").unwrap_or(&text).to_owned()
}

pub(super) fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}
