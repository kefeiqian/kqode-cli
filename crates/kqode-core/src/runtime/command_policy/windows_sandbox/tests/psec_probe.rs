use super::{
    psec_run, sbox_spec,
    support::{Fixture, TEST_TIMEOUT},
};
use crate::runtime::SandboxProfile;

#[tokio::test]
#[ignore = "requires enabled PSEC 1.0; temporary fixture only, no production dispatch"]
async fn native_psec_additive_grants_require_explicit_source_denial() {
    for deny_source in [false, true] {
        probe(deny_source).await;
    }
}

async fn probe(deny_source: bool) {
    let fixture = Fixture::new();
    super::native_boundaries::grant(&fixture.root, "(RX)");
    super::native_boundaries::grant(&fixture.source, "(RX)");
    super::native_boundaries::grant(&fixture.source.join("input.txt"), "(M)");
    let command = fixture.command(
        "[IO.File]::WriteAllText('created.txt','copy'); try { [IO.File]::WriteAllText($env:KQODE_ORIGINAL_INPUT,'outside-mutation'); [Console]::Write('outside-written') } catch [UnauthorizedAccessException] { [Console]::Write('outside-denied') }",
        SandboxProfile::WorkspaceWrite, TEST_TIMEOUT, 128);
    let context = command.context();
    let root = command
        .snapshot
        .root()
        .to_string_lossy()
        .strip_prefix(r"\\?\")
        .unwrap()
        .to_owned();
    let shell = std::path::Path::new(context.program())
        .parent()
        .unwrap()
        .to_string_lossy()
        .strip_prefix(r"\\?\")
        .unwrap()
        .to_owned();
    let windows = std::env::var("SystemRoot").unwrap();
    let source = fixture.source.to_string_lossy();
    let denied: Vec<&str> = if deny_source { vec![&source] } else { vec![] };
    let spec = sbox_spec::encode_psec(&[&root], &[&shell, &windows], &denied);
    let output = psec_run::run(context, &spec, None, 128).await.unwrap();
    assert_eq!(
        output.code, 0,
        "stdout={} stderr={}",
        output.stdout, output.stderr
    );
    assert_eq!(
        output.stdout,
        if deny_source {
            "outside-denied"
        } else {
            "outside-written"
        },
        "stderr={}",
        output.stderr
    );
    assert_eq!(
        std::fs::read_to_string(fixture.source.join("input.txt")).unwrap(),
        if deny_source {
            "original"
        } else {
            "outside-mutation"
        }
    );
    assert_eq!(
        std::fs::read_to_string(command.snapshot.root().join("created.txt")).unwrap(),
        "copy"
    );
}
