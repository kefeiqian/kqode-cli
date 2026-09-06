# KQode onboarding to Paseo

**Date:** 2026-09-04
**Status:** Proposed

## Goal

Make KQode available in Paseo as a locally installed coding-agent provider so
users can start and supervise KQode sessions from Paseo's desktop, mobile, web,
and CLI clients.

## Integration decision

Implement KQode as an ACP agent over stdio.

Paseo recommends the Agent Client Protocol (ACP) for external coding agents.
Paseo launches the configured binary as a subprocess, communicates with it over
JSON-RPC 2.0 on stdin/stdout, and manages the surrounding UI, remote access,
workspaces, and orchestration.

Do not integrate Paseo directly with Tauri commands or desktop-only state.
KQode's agent runtime must remain headless and reusable by multiple adapters:

```text
KQode core agent/session runtime
  |- desktop adapter
  |- headless CLI adapter
  `- ACP stdio adapter
       `- Paseo
```

## Current gap

The current KQode implementation is primarily a Tauri desktop chat application.
It can send chat-completion requests and persist desktop settings and
conversations, but it does not yet expose:

- a headless coding-agent process;
- ACP initialization and session methods;
- workspace-aware file and terminal tools;
- streamed agent and tool events;
- permission requests and cancellation;
- resumable agent sessions.

A text-only ACP wrapper can prove protocol compatibility, but KQode should not
request public Paseo catalog placement until it can perform useful coding work
inside a workspace.

## Phase 1: headless runtime seam

Extract application-independent behavior behind a KQode core runtime.

The runtime should accept:

- workspace root;
- prompt content;
- provider and model selection;
- session identifier;
- cancellation signal;
- client-provided MCP servers;
- permission decisions.

The runtime should emit typed events for:

- assistant text;
- reasoning, when available;
- tool start, progress, result, and failure;
- permission requests;
- session state changes;
- completion and stop reason.

The desktop application and future protocol adapters should consume this same
runtime rather than duplicating agent behavior.

## Phase 2: ACP MVP

Add a non-interactive command:

```text
kqode acp
```

Requirements:

- stdin and stdout are reserved for ACP JSON-RPC messages;
- diagnostics and logs are written to stderr;
- the process remains alive for the client connection;
- malformed requests return protocol errors instead of terminating the process;
- EOF and cancellation shut down active work cleanly.

Implement the stable ACP surface using the official Rust SDK rather than a
custom JSON-RPC codec.

Minimum methods and events:

1. `initialize`
2. `session/new`
3. `session/prompt`
4. `session/update`
5. `session/cancel`

The initialization response should expose KQode's implementation identity,
capabilities, available modes, and models. The first MVP may advertise only
capabilities that are fully implemented.

## Phase 3: coding-agent capabilities

Before public onboarding, support:

- the workspace path supplied by `session/new`;
- file reads and staged writes constrained to the workspace;
- terminal execution with timeout and output limits;
- tool-call streaming through ACP session updates;
- explicit permission requests for risky operations;
- cancellation during model and tool execution;
- client-provided MCP server configuration;
- stable model and mode identifiers;
- session persistence or an explicit declaration that resume is unsupported.

KQode should execute filesystem and terminal operations through its own VFS,
sandbox, and policy layers. Paseo client capabilities should only be enabled
when delegating those operations to Paseo is intentional and path-equivalent.

## Local Paseo configuration

Once `kqode acp` is installed and available on the Paseo daemon's `PATH`, users
can add this provider to `~/.paseo/config.json`:

```json
{
  "$schema": "https://paseo.sh/schemas/paseo.config.v1.json",
  "version": 1,
  "agents": {
    "providers": {
      "kqode": {
        "extends": "acp",
        "label": "KQode",
        "description": "Rust-first local coding agent",
        "command": ["kqode", "acp"]
      }
    }
  }
}
```

If the binary is not visible in the daemon environment, configure its absolute
path in `command`.

Reload and diagnose the provider:

```text
paseo reload
paseo provider diagnostic kqode
```

Run a smoke test:

```text
paseo run --provider kqode "Inspect this repository and summarize it."
```

Paseo diagnostics should confirm:

- the KQode executable is resolved;
- the executable reports a version;
- ACP `initialize` succeeds;
- `session/new` succeeds;
- at least one model is available;
- supported modes are returned;
- the final provider status is ready.

## Verification

Add deterministic protocol tests that launch `kqode acp` as a subprocess and
verify:

- initialization negotiation;
- session creation with a temporary workspace;
- prompt streaming and terminal stop response;
- multiple sequential prompts in one session;
- cancellation of an active prompt;
- invalid session and malformed-request errors;
- protocol-only stdout;
- graceful shutdown on EOF.

Also run KQode against a local Paseo daemon and complete one workspace task that
reads a file, changes a file, runs a focused test, and reports the result.

## Public Paseo onboarding

After the local custom-provider flow is stable:

1. Publish installable KQode binaries for supported platforms.
2. Document authentication and provider configuration.
3. Open an issue or discussion with the Paseo project describing KQode and its
   ACP command.
4. Submit the requested catalog/provider metadata, installation command, icon,
   documentation, and tests.
5. Verify one-click installation and launch from a clean Paseo environment.
6. Request inclusion on Paseo's supported-agents page only after the catalog
   integration is released.

KQode should prefer the generic ACP catalog path. A dedicated native Paseo
provider should only be considered if KQode requires behavior that cannot be
expressed through ACP.

## References

- Paseo providers: https://paseo.sh/docs/providers
- Paseo custom providers: https://paseo.sh/docs/custom-providers
- Paseo provider implementation guide:
  https://github.com/getpaseo/paseo/blob/main/docs/providers.md
- ACP project: https://agentclientprotocol.com/
- Official ACP Rust SDK:
  https://github.com/agentclientprotocol/rust-sdk
