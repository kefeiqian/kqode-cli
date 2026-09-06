# KQode Detailed Requirements Index

This doc set expands `2026-06-25-kqode-requirements.md` into implementation-oriented requirements and a build path. The original feature list stays unchanged.

## Documents

- `kqode_build_path.md` - milestone sequence, delivery order, acceptance evidence, and first-scope vs deferred scope.
- `kqode_architecture_spec.md` - language choices, repository shape, runtime boundaries, storage, protocols, and core flows.
- `kqode_core_implementation_details.md` - detailed build guidance for R1-R84: core product, harness, tools, context, safety, sessions, TUI, and providers.
- `kqode_platform_implementation_details.md` - detailed build guidance for R85-R160: MCP, plugins, multi-agent, runtime, IDE, multimodal, eval, and portfolio proof.
- `kqode_evaluation_spec.md` - evaluation layers, metrics, artifacts, task schema, local task suite, and benchmark progression.
- `kqode_reference_implementations.md` - referenced open-source and public coding-agent implementations, what KQode borrows, and what to avoid.

## Language strategy

- Rust owns the core harness, tool execution, VFS, sandbox-lite, session store, policy engine, provider abstraction, and benchmark runner.
- TypeScript owns the first rich TUI, plugin authoring ergonomics, editor/protocol adapters, and any web/desktop companion surfaces.
- Python is optional and limited to benchmark/eval adapters when existing ecosystems such as SWE-bench or AutoCodeRover-style scripts make Python cheaper than rewriting.
- Shell and small config formats are supporting surfaces, not primary application languages.

## First-scope principle

Build a working local coding agent before building the platform around it. KQode should first solve real tasks on its own codebase with a safe edit loop, then expand into context, sandbox, replay, MCP, subagents, and evaluation.
