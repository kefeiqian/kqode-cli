use super::{
    native_boundaries::grant,
    psec_precedence::{conventional, quote},
    psec_run, sbox_spec,
    support::{Fixture, TEST_TIMEOUT},
};
use crate::runtime::SandboxProfile;
use std::path::Path;

#[tokio::test]
#[ignore = "PSEC read-only probe; modifies only fresh fixture/copy ACEs"]
async fn native_psec_readonly_grant_reopens_ambient_copy_writes() {
    for ambient_write in [false, true] {
        let fixture = Fixture::new();
        grant(&fixture.root, "(RX)");
        grant(&fixture.source, "(RX)");
        grant(&fixture.source.join("input.txt"), "(M)");
        let command = fixture.command("exit 0", SandboxProfile::ReadOnly, TEST_TIMEOUT, 4096);
        if ambient_write {
            grant(command.snapshot.root(), "(OI)(CI)(M)");
        }
        let context = command.context();
        let root = conventional(command.snapshot.root());
        let shell = conventional(Path::new(context.program()).parent().unwrap());
        let windows = std::env::var("SystemRoot").unwrap();
        let volume = conventional(fixture.root.ancestors().last().unwrap());
        let spec = sbox_spec::encode_psec(&[], &[&root, &shell, &windows], &[&volume]);
        let input = quote(&format!("{root}\\input.txt"));
        let created = quote(&format!("{root}\\scratch\\created.txt"));
        let script = format!(
            "$ErrorActionPreference='Stop'; \
         if ((Get-Content -LiteralPath {input} -Raw) -ne 'original') {{ exit 9 }}; Write-Output 'read:ok'; \
         try {{ Set-Content -LiteralPath {input} -Value 'changed' -NoNewline; Write-Output 'edit:ok' }} \
         catch [System.UnauthorizedAccessException] {{ Write-Output 'edit:denied' }}; \
         try {{ Set-Content -LiteralPath {created} -Value 'created' -NoNewline; Write-Output 'create:ok' }} \
         catch [System.UnauthorizedAccessException] {{ Write-Output 'create:denied' }}; exit 0"
        );
        let output = psec_run::run(context, &spec, Some(&script), 4096)
            .await
            .unwrap();
        assert_eq!(
            output.code, 0,
            "stdout={} stderr={}",
            output.stdout, output.stderr
        );
        assert_eq!(
            output.stdout.lines().collect::<Vec<_>>(),
            [
                "read:ok",
                if ambient_write {
                    "edit:ok"
                } else {
                    "edit:denied"
                },
                if ambient_write {
                    "create:ok"
                } else {
                    "create:denied"
                }
            ]
        );
        assert_eq!(
            std::fs::read_to_string(command.snapshot.root().join("input.txt")).unwrap(),
            if ambient_write { "changed" } else { "original" }
        );
        assert_eq!(
            command
                .snapshot
                .root()
                .join("scratch\\created.txt")
                .exists(),
            ambient_write
        );
        if ambient_write {
            assert_eq!(
                std::fs::read_to_string(command.snapshot.root().join("scratch\\created.txt"))
                    .unwrap(),
                "created"
            );
        }
    }
}

#[tokio::test]
#[ignore = "PSEC outside-write counterexample; only fresh fixture ACEs are modified"]
async fn native_psec_readonly_exception_reopens_denied_outside_writes() {
    for allow_source_read in [false, true] {
        let fixture = Fixture::new();
        grant(&fixture.root, "(RX)");
        grant(&fixture.source, "(RX)");
        grant(&fixture.source.join("input.txt"), "(M)");
        let command = fixture.command("exit 0", SandboxProfile::WorkspaceWrite, TEST_TIMEOUT, 4096);
        let context = command.context();
        let root = conventional(command.snapshot.root());
        let source = conventional(&fixture.source);
        let shell = conventional(Path::new(context.program()).parent().unwrap());
        let windows = std::env::var("SystemRoot").unwrap();
        let volume = conventional(fixture.root.ancestors().last().unwrap());
        let mut read = vec![shell.as_str(), windows.as_str()];
        if allow_source_read {
            read.push(&source);
        }
        let spec = sbox_spec::encode_psec(&[&root], &read, &[&volume]);
        let input = quote(&format!("{source}\\input.txt"));
        let script = format!(
            "$ErrorActionPreference='Stop'; \
             try {{ Set-Content -LiteralPath {input} -Value 'outside-mutation' -NoNewline; Write-Output 'outside-write:ok' }} \
             catch [System.UnauthorizedAccessException] {{ Write-Output 'outside-write:denied' }}; exit 0"
        );
        let output = psec_run::run(context, &spec, Some(&script), 4096)
            .await
            .unwrap();
        assert_eq!(
            output.code, 0,
            "stdout={} stderr={}",
            output.stdout, output.stderr
        );
        assert_eq!(
            output.stdout.lines().collect::<Vec<_>>(),
            [if allow_source_read {
                "outside-write:ok"
            } else {
                "outside-write:denied"
            }]
        );
        assert_eq!(
            std::fs::read_to_string(fixture.source.join("input.txt")).unwrap(),
            if allow_source_read {
                "outside-mutation"
            } else {
                "original"
            }
        );
    }
}
