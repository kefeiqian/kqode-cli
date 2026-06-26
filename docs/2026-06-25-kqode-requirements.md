---
date: 2026-06-25
topic: kqode
---

# KQode Feature List

## Core product

- [R1. Terminal-first AI Coding / Code Agent CLI/TUI.](features/r001_terminal_first_ai_coding_code_agent_cli_tui.md)
- [R2. Standalone product inspired by Codex, Claude Code, Copilot CLI, Kimi Code, Gemini CLI, Aider, OpenCode, OpenHands, Cline, Goose, SWE-agent, and AutoCodeRover.](features/r002_standalone_product_inspired_by_codex_claude_code_copilot_cli_kimi_code_g.md)
- [R3. Interactive TUI, one-shot prompt mode, and headless/script mode.](features/r003_interactive_tui_one_shot_prompt_mode_and_headless_script_mode.md)
- [R4. End-to-end coding tasks: implement, debug, refactor, test, explain, review, and summarize.](features/r004_end_to_end_coding_tasks_implement_debug_refactor_test_explain_review_and.md)
- [R5. User-switchable modes: code, ask, help, architect, plan, act, read-only, supervised, and autonomous.](features/r005_user_switchable_modes_code_ask_help_architect_plan_act_read_only_supervi.md)
- [R6. Reviewable diffs, checks, and final change summaries for every meaningful code task.](features/r006_reviewable_diffs_checks_and_final_change_summaries_for_every_meaningful.md)
- [R7. Dogfooding on KQode's own codebase as the first flagship demo.](features/r007_dogfooding_on_kqode_s_own_codebase_as_the_first_flagship_demo.md)
- [R8. Low-friction install, fast startup, and shell completions.](features/r008_low_friction_install_fast_startup_and_shell_completions.md)

## Agent harness

- [R9. Owned agent harness and agent loop.](features/r009_owned_agent_harness_and_agent_loop.md)
- [R10. Planning before action for non-trivial work.](features/r010_planning_before_action_for_non_trivial_work.md)
- [R11. Tool calling / Function Calling until completion, blockage, or clarification.](features/r011_tool_calling_function_calling_until_completion_blockage_or_clarification.md)
- [R12. Explicit completion, partial-completion, and blocked signals.](features/r012_explicit_completion_partial_completion_and_blocked_signals.md)
- [R13. Turn, step, cost, context, and max-step budgets.](features/r013_turn_step_cost_context_and_max_step_budgets.md)
- [R14. Rich tool results with recoverable errors.](features/r014_rich_tool_results_with_recoverable_errors.md)
- [R15. Structured step logs and audit trail.](features/r015_structured_step_logs_and_audit_trail.md)
- [R16. Goal mode for longer autonomous objectives.](features/r016_goal_mode_for_longer_autonomous_objectives.md)
- [R17. Todo/task tracking with status, priority, and ordering.](features/r017_todo_task_tracking_with_status_priority_and_ordering.md)
- [R18. Hidden system agents for title generation, summaries, and compaction.](features/r018_hidden_system_agents_for_title_generation_summaries_and_compaction.md)

## Tools and editing

- [R19. Core tools: read, write, patch, list, glob, search, shell, test, git, ask-user, web fetch/search, and complete-task.](features/r019_core_tools_read_write_patch_list_glob_search_shell_test_git_ask_user_web.md)
- [R20. VFS / vfs layer for staged edits, path checks, conflict checks, and diff previews.](features/r020_vfs_vfs_layer_for_staged_edits_path_checks_conflict_checks_and_diff_prev.md)
- [R21. Safe multi-file editing with whole-file, diff, unified-diff, and editor-diff modes.](features/r021_safe_multi_file_editing_with_whole_file_diff_unified_diff_and_editor_dif.md)
- [R22. Git-aware diff, commit, commit-push-PR, branch, and PR comment workflows.](features/r022_git_aware_diff_commit_commit_push_pr_branch_and_pr_comment_workflows.md)
- [R23. LSP diagnostics and symbol-aware navigation as later code-intelligence features.](features/r023_lsp_diagnostics_and_symbol_aware_navigation_as_later_code_intelligence_f.md)
- [R24. Notebook, image, PDF, DOCX, and XLSX handling as deferred developer-artifact features.](features/r024_notebook_image_pdf_docx_and_xlsx_handling_as_deferred_developer_artifact.md)
- [R25. Shell commands with cwd control, timeout, output capture, and approval policy.](features/r025_shell_commands_with_cwd_control_timeout_output_capture_and_approval_poli.md)
- [R26. Structured output generation for machine-readable results.](features/r026_structured_output_generation_for_machine_readable_results.md)
- [R27. Deferred tool discovery for uncommon or optional tools.](features/r027_deferred_tool_discovery_for_uncommon_or_optional_tools.md)

## Context engineering and memory

- [R28. Project instructions through AGENTS.md, GEMINI.md, `.clinerules`, and similar layered guidance files.](features/r028_project_instructions_through_agents_md_gemini_md_clinerules_and_similar.md)
- [R29. `/init`-style generation of project instruction files.](features/r029_init_style_generation_of_project_instruction_files.md)
- [R30. File, folder, error, screenshot, URL, issue, and inline-comment context attachments.](features/r030_file_folder_error_screenshot_url_issue_and_inline_comment_context_attach.md)
- [R31. Targeted file reads and workspace search instead of whole-repo indexing.](features/r031_targeted_file_reads_and_workspace_search_instead_of_whole_repo_indexing.md)
- [R32. Token-budget-aware repo map and symbol/dependency-ranked summaries as later context features.](features/r032_token_budget_aware_repo_map_and_symbol_dependency_ranked_summaries_as_la.md)
- [R33. Context Engineering with active working set tracking.](features/r033_context_engineering_with_active_working_set_tracking.md)
- [R34. Long Context handling with context compaction, summaries, and reset.](features/r034_long_context_handling_with_context_compaction_summaries_and_reset.md)
- [R35. Memory for user preferences, repo conventions, prior decisions, and recurring badcases.](features/r035_memory_for_user_preferences_repo_conventions_prior_decisions_and_recurri.md)
- [R36. User-inspectable and user-correctable memory.](features/r036_user_inspectable_and_user_correctable_memory.md)
- [R37. Separate user-level, project-level, and team-level memory.](features/r037_separate_user_level_project_level_and_team_level_memory.md)
- [R38. Automatic memory extraction and team memory sync as deferred features.](features/r038_automatic_memory_extraction_and_team_memory_sync_as_deferred_features.md)
- [R39. System prompt override and generation settings for advanced users.](features/r039_system_prompt_override_and_generation_settings_for_advanced_users.md)
- [R40. Ignore files, trusted folders, and context exclusion rules.](features/r040_ignore_files_trusted_folders_and_context_exclusion_rules.md)
- [R41. Advanced code RAG, vector retrieval, knowledge-base RAG, and GraphRAG remain optional later proof-of-depth features.](features/r041_advanced_code_rag_vector_retrieval_knowledge_base_rag_and_graphrag_remai.md)

## Safety, permissions, and sandbox

- [R42. Approval modes: read-only, plan-only, supervised, auto, and full-access-style operation.](features/r042_approval_modes_read_only_plan_only_supervised_auto_and_full_access_style.md)
- [R43. Per-tool allow, deny, and ask permissions.](features/r043_per_tool_allow_deny_and_ask_permissions.md)
- [R44. Workspace root as the default trust boundary.](features/r044_workspace_root_as_the_default_trust_boundary.md)
- [R45. Gates for risky edits, shell commands, network actions, high-cost calls, ambiguous instructions, and destructive actions.](features/r045_gates_for_risky_edits_shell_commands_network_actions_high_cost_calls_amb.md)
- [R46. Detection for secret exposure, out-of-workspace paths, destructive commands, and untrusted tool context.](features/r046_detection_for_secret_exposure_out_of_workspace_paths_destructive_command.md)
- [R47. Sandbox execution for commands, checks, tests, and untrusted code.](features/r047_sandbox_execution_for_commands_checks_tests_and_untrusted_code.md)
- [R48. Execution isolation with time, resource, path, and network controls.](features/r048_execution_isolation_with_time_resource_path_and_network_controls.md)
- [R49. Policy engine for command, tool, path, network, and permission decisions.](features/r049_policy_engine_for_command_tool_path_network_and_permission_decisions.md)
- [R50. Inline, full-screen, desktop-integrated, and file-IPC approval surfaces.](features/r050_inline_full_screen_desktop_integrated_and_file_ipc_approval_surfaces.md)
- [R51. Non-TTY flows fail closed when fresh approval is required.](features/r051_non_tty_flows_fail_closed_when_fresh_approval_is_required.md)
- [R52. Sandbox, VFS, permission, and policy events appear in traces.](features/r052_sandbox_vfs_permission_and_policy_events_appear_in_traces.md)

## Sessions and replay

- [R53. Local session transcripts grouped by workspace.](features/r053_local_session_transcripts_grouped_by_workspace.md)
- [R54. Session list, resume, continue, delete, rename, and title.](features/r054_session_list_resume_continue_delete_rename_and_title.md)
- [R55. Checkpoint, rewind, fork, side-chat, and replay.](features/r055_checkpoint_rewind_fork_side_chat_and_replay.md)
- [R56. Durable session state with interruption recovery.](features/r056_durable_session_state_with_interruption_recovery.md)
- [R57. No double-applied side effects after resume.](features/r057_no_double_applied_side_effects_after_resume.md)
- [R58. Trajectory files with messages, actions, observations, exit status, config, and model stats.](features/r058_trajectory_files_with_messages_actions_observations_exit_status_config_a.md)
- [R59. Trajectory replay in fresh environments.](features/r059_trajectory_replay_in_fresh_environments.md)
- [R60. Trajectory-to-demo conversion.](features/r060_trajectory_to_demo_conversion.md)
- [R61. Timeline, visual inspector, and replay UI as deferred features.](features/r061_timeline_visual_inspector_and_replay_ui_as_deferred_features.md)
- [R62. Session export as debug ZIP and human-readable Markdown.](features/r062_session_export_as_debug_zip_and_human_readable_markdown.md)
- [R63. Session sharing, unsharing, and deletion as deferred features.](features/r063_session_sharing_unsharing_and_deletion_as_deferred_features.md)

## CLI and TUI experience

- [R64. Syntax-highlighted markdown, code, diffs, and tool output.](features/r064_syntax_highlighted_markdown_code_diffs_and_tool_output.md)
- [R65. Themes, terminal-background-aware themes, and project/user theme directories.](features/r065_themes_terminal_background_aware_themes_and_project_user_theme_directori.md)
- [R66. Configurable keybindings, Vim mode, and which-key help overlay.](features/r066_configurable_keybindings_vim_mode_and_which_key_help_overlay.md)
- [R67. Prompt drafts, prompt history, history search, previous-message edit, and queued follow-up.](features/r067_prompt_drafts_prompt_history_history_search_previous_message_edit_and_qu.md)
- [R68. Full-editor prompt composer for long prompts.](features/r068_full_editor_prompt_composer_for_long_prompts.md)
- [R69. Copy latest output and clear visible terminal without losing state.](features/r069_copy_latest_output_and_clear_visible_terminal_without_losing_state.md)
- [R70. Status, usage, cost, bug report, doctor, login, logout, provider, model, permissions, and settings commands.](features/r070_status_usage_cost_bug_report_doctor_login_logout_provider_model_permissi.md)
- [R71. Custom slash commands from markdown or config.](features/r071_custom_slash_commands_from_markdown_or_config.md)
- [R72. Custom commands can accept arguments, include shell output, include file content, and route to a model or agent.](features/r072_custom_commands_can_accept_arguments_include_shell_output_include_file_c.md)

## Models, providers, and configuration

- [R73. Model switching and reasoning/thinking level control.](features/r073_model_switching_and_reasoning_thinking_level_control.md)
- [R74. Model variant cycling within a session.](features/r074_model_variant_cycling_within_a_session.md)
- [R75. Automatic model routing and fallback.](features/r075_automatic_model_routing_and_fallback.md)
- [R76. Local model routing as a deferred feature.](features/r076_local_model_routing_as_a_deferred_feature.md)
- [R77. Provider management for OAuth, API keys, subscriptions, and OpenAI-compatible endpoints.](features/r077_provider_management_for_oauth_api_keys_subscriptions_and_openai_compatib.md)
- [R78. Provider plugins and curated model catalogs as deferred features.](features/r078_provider_plugins_and_curated_model_catalogs_as_deferred_features.md)
- [R79. User-level, project-level, profile-level, and isolated data-directory configuration.](features/r079_user_level_project_level_profile_level_and_isolated_data_directory_confi.md)
- [R80. Feature flags and release channels for experimental capabilities.](features/r080_feature_flags_and_release_channels_for_experimental_capabilities.md)
- [R81. Token caching / prompt caching.](features/r081_token_caching_prompt_caching.md)
- [R82. Quota, usage-limit, and hard cost-limit awareness.](features/r082_quota_usage_limit_and_hard_cost_limit_awareness.md)
- [R83. Secure credential storage.](features/r083_secure_credential_storage.md)
- [R84. Startup prefetch and lazy loading for heavy integrations.](features/r084_startup_prefetch_and_lazy_loading_for_heavy_integrations.md)

## MCP, skills, plugins, and extensions

- [R85. MCP client and at least one KQode MCP server/tool.](features/r085_mcp_client_and_at_least_one_kqode_mcp_server_tool.md)
- [R86. MCP transports: stdio, HTTP, SSE, and remote MCP with OAuth.](features/r086_mcp_transports_stdio_http_sse_and_remote_mcp_with_oauth.md)
- [R87. Conversational MCP configuration, status, auth, enable/disable, allowlist, and blocklist.](features/r087_conversational_mcp_configuration_status_auth_enable_disable_allowlist_an.md)
- [R88. MCP forwarding from editor/IDE clients.](features/r088_mcp_forwarding_from_editor_ide_clients.md)
- [R89. Skills-style reusable workflows.](features/r089_skills_style_reusable_workflows.md)
- [R90. Skill token-cost visibility.](features/r090_skill_token_cost_visibility.md)
- [R91. Installable plugins/extensions with trust levels.](features/r091_installable_plugins_extensions_with_trust_levels.md)
- [R92. Plugins can package Skills, MCP servers, commands, hooks, policies, themes, and session-start instructions.](features/r092_plugins_can_package_skills_mcp_servers_commands_hooks_policies_themes_an.md)
- [R93. Plugin installation from local path, URL, GitHub repo, marketplace, or registry.](features/r093_plugin_installation_from_local_path_url_github_repo_marketplace_or_regis.md)
- [R94. Plugin enable, disable, update, remove, reload, inspect, validate, and diagnostics flows.](features/r094_plugin_enable_disable_update_remove_reload_inspect_validate_and_diagnost.md)
- [R95. Untrusted plugin confirmation, no install-time code execution, and plugin-root path constraints.](features/r095_untrusted_plugin_confirmation_no_install_time_code_execution_and_plugin.md)
- [R96. Custom distributions with preconfigured providers, extensions, branding, and defaults as deferred product features.](features/r096_custom_distributions_with_preconfigured_providers_extensions_branding_an.md)
- [R97. Reusable recipe templates with parameters, secret discovery, GitHub loading, and explain-without-run.](features/r097_reusable_recipe_templates_with_parameters_secret_discovery_github_loadin.md)

## Multi-agent and swarm

- [R98. Multi-agent / agent swarm workflows with specialist sub-agents.](features/r098_multi_agent_agent_swarm_workflows_with_specialist_sub_agents.md)
- [R99. Built-in roles: explorer, coder, tester, reviewer, debugger, context scout, and general worker.](features/r099_built_in_roles_explorer_coder_tester_reviewer_debugger_context_scout_and.md)
- [R100. Custom agents with name, description, model, reasoning, sandbox, permissions, max steps, and prompt body.](features/r100_custom_agents_with_name_description_model_reasoning_sandbox_permissions.md)
- [R101. Per-agent thread, depth, budget, and concurrency limits.](features/r101_per_agent_thread_depth_budget_and_concurrency_limits.md)
- [R102. Subagent inspection, steering, stopping, closing, and result consolidation.](features/r102_subagent_inspection_steering_stopping_closing_and_result_consolidation.md)
- [R103. Child-session tree navigation for subagent sessions.](features/r103_child_session_tree_navigation_for_subagent_sessions.md)
- [R104. Inter-agent messaging and delegate tools.](features/r104_inter_agent_messaging_and_delegate_tools.md)
- [R105. Ask-human-expert tool for escalation.](features/r105_ask_human_expert_tool_for_escalation.md)
- [R106. Named multi-agent teams with persistent state as a deferred feature.](features/r106_named_multi_agent_teams_with_persistent_state_as_a_deferred_feature.md)
- [R107. Kanban-style multi-agent task boards, task dependencies, and per-task worktrees as deferred features.](features/r107_kanban_style_multi_agent_task_boards_task_dependencies_and_per_task_work.md)
- [R108. Batch fan-out over structured task lists as a deferred feature.](features/r108_batch_fan_out_over_structured_task_lists_as_a_deferred_feature.md)

## Runtime, workspace, and automation

- [R109. Workspace backend is local-first through KQode-owned VFS and sandbox-lite; remote VM, cloud, and remote API are deferred.](features/r109_workspace_backend_is_local_first_through_kqode_owned_vfs_and_sandbox_lit.md)
- [R110. Ephemeral per-task workspaces and worktree-aware execution as deferred isolation features.](features/r110_ephemeral_per_task_workspaces_and_worktree_aware_execution_as_deferred_i.md)
- [R111. Self-hosted agent server, REST API, WebSocket, and local hub/daemon as deferred features.](features/r111_self_hosted_agent_server_rest_api_websocket_and_local_hub_daemon_as_defe.md)
- [R112. Background daemon mode where tasks continue after the CLI exits.](features/r112_background_daemon_mode_where_tasks_continue_after_the_cli_exits.md)
- [R113. Automation server for scheduled, webhook-triggered, and recurring tasks.](features/r113_automation_server_for_scheduled_webhook_triggered_and_recurring_tasks.md)
- [R114. Lifecycle hooks for prompt submit, pre/post tool use, permission request/result, session start/end, subagent start/stop, compaction, interruption, and notification.](features/r114_lifecycle_hooks_for_prompt_submit_pre_post_tool_use_permission_request_r.md)
- [R115. Hooks can append context, block operations, trigger notifications, audit decisions, and call user automation.](features/r115_hooks_can_append_context_block_operations_trigger_notifications_audit_de.md)
- [R116. Hook failures are visible and never the only security barrier.](features/r116_hook_failures_are_visible_and_never_the_only_security_barrier.md)
- [R117. YAML import/export for schedules.](features/r117_yaml_import_export_for_schedules.md)
- [R118. Remote triggers and proactive wait/sleep workflows as deferred features.](features/r118_remote_triggers_and_proactive_wait_sleep_workflows_as_deferred_features.md)

## IDE, protocol, and ecosystem integrations

- [R119. ACP / Agent Client Protocol integration as a deferred IDE surface.](features/r119_acp_agent_client_protocol_integration_as_a_deferred_ide_surface.md)
- [R120. Editor clients can create, load, resume, prompt, cancel, list, and configure sessions.](features/r120_editor_clients_can_create_load_resume_prompt_cancel_list_and_configure_s.md)
- [R121. Editor clients can route file reads/writes and stream messages, plans, tool calls, approvals, and commands.](features/r121_editor_clients_can_route_file_reads_writes_and_stream_messages_plans_too.md)
- [R122. VS Code, JetBrains, Zed, and ACP-compatible clients as deferred integrations.](features/r122_vs_code_jetbrains_zed_and_acp_compatible_clients_as_deferred_integration.md)
- [R123. IDE diff UX where edits can be accepted, modified, or reverted before landing.](features/r123_ide_diff_ux_where_edits_can_be_accepted_modified_or_reverted_before_land.md)
- [R124. GitHub Action automation for PR review, issue triage, mention-triggered help, and scheduled workflows as deferred features.](features/r124_github_action_automation_for_pr_review_issue_triage_mention_triggered_he.md)
- [R125. Chat connectors for Slack, Telegram, Discord, Google Chat, WhatsApp, and Linear as deferred features.](features/r125_chat_connectors_for_slack_telegram_discord_google_chat_whatsapp_and_line.md)
- [R126. Access control for messaging-platform agents.](features/r126_access_control_for_messaging_platform_agents.md)
- [R127. Desktop app, mobile handoff, desktop approval, and browser companion as deferred surfaces.](features/r127_desktop_app_mobile_handoff_desktop_approval_and_browser_companion_as_def.md)
- [R128. Local AI gateway/proxy for routing across providers as a deferred feature.](features/r128_local_ai_gateway_proxy_for_routing_across_providers_as_a_deferred_featur.md)

## Multimodal and non-code automation

- [R129. Multimodal input for screenshots, UI states, terminal output, design references, images, PDFs, and sketches.](features/r129_multimodal_input_for_screenshots_ui_states_terminal_output_design_refere.md)
- [R130. Video and screen-recording input as deferred features.](features/r130_video_and_screen_recording_input_as_deferred_features.md)
- [R131. Voice input as a deferred feature.](features/r131_voice_input_as_a_deferred_feature.md)
- [R132. Image generation and image editing as deferred features.](features/r132_image_generation_and_image_editing_as_deferred_features.md)
- [R133. Browser automation with Playwright/browser-use and session recording as deferred features.](features/r133_browser_automation_with_playwright_browser_use_and_session_recording_as.md)
- [R134. Native computer-control tools as deferred features.](features/r134_native_computer_control_tools_as_deferred_features.md)
- [R135. Office document tools for DOCX, PDF, and XLSX as deferred features.](features/r135_office_document_tools_for_docx_pdf_and_xlsx_as_deferred_features.md)
- [R136. Automated chart and visualization generation as deferred features.](features/r136_automated_chart_and_visualization_generation_as_deferred_features.md)

## Observability and evaluation

- [R137. Traces for prompts, model outputs, tool calls, approvals, context, costs, latency, and outcomes.](features/r137_traces_for_prompts_model_outputs_tool_calls_approvals_context_costs_late.md)
- [R138. OpenTelemetry-style export as a deferred observability feature.](features/r138_opentelemetry_style_export_as_a_deferred_observability_feature.md)
- [R139. Opt-in analytics with permanent opt-out.](features/r139_opt_in_analytics_with_permanent_opt_out.md)
- [R140. Badcase capture and regression workflows.](features/r140_badcase_capture_and_regression_workflows.md)
- [R141. Local task-suite evaluation on KQode's own codebase.](features/r141_local_task_suite_evaluation_on_kqode_s_own_codebase.md)
- [R142. Evaluations for coding success, context selection, safety gates, multi-agent coordination, replay fidelity, and prompt-injection resistance.](features/r142_evaluations_for_coding_success_context_selection_safety_gates_multi_agen.md)
- [R143. Deterministic contract tests for parser, tool, policy, and non-LLM behavior.](features/r143_deterministic_contract_tests_for_parser_tool_policy_and_non_llm_behavior.md)
- [R144. Provider smoke tests across multiple models and trials.](features/r144_provider_smoke_tests_across_multiple_models_and_trials.md)
- [R145. pass@k, pass^k, flakiness, task-success, latency, throughput, and reliability metrics.](features/r145_pass_k_pass_k_flakiness_task_success_latency_throughput_and_reliability.md)
- [R146. SWE-bench Lite, SWE-bench Verified, and selected local benchmarks as deferred evaluation targets.](features/r146_swe_bench_lite_swe_bench_verified_and_selected_local_benchmarks_as_defer.md)
- [R147. Batch benchmark runs with skip, redo, resume, frozen configs, run comparison, and prediction merging.](features/r147_batch_benchmark_runs_with_skip_redo_resume_frozen_configs_run_comparison.md)
- [R148. Single-issue, local-issue, GitHub-issue, and benchmark-task execution modes.](features/r148_single_issue_local_issue_github_issue_and_benchmark_task_execution_modes.md)
- [R149. Fix-location-only mode, AST/symbol-aware localization, and statistical fault localization as deferred evaluation features.](features/r149_fix_location_only_mode_ast_symbol_aware_localization_and_statistical_fau.md)
- [R150. Candidate patch generation, patch applicability classification, patch selection, and reviewer agents.](features/r150_candidate_patch_generation_patch_applicability_classification_patch_sele.md)
- [R151. Generated reproducer tests and submit-review checks as deferred validation features.](features/r151_generated_reproducer_tests_and_submit_review_checks_as_deferred_validati.md)
- [R152. Per-task metadata, timestamped outputs, per-instance logs, and per-run cost summaries.](features/r152_per_task_metadata_timestamped_outputs_per_instance_logs_and_per_run_cost.md)
- [R153. Reproducible benchmark environments use KQode-owned sandbox-lite first; prebuilt remote or VM environments are deferred.](features/r153_reproducible_benchmark_environments_use_kqode_owned_sandbox_lite_first_p.md)
- [R154. Public benchmark evidence: pass rate, cost per task, and runtime per task.](features/r154_public_benchmark_evidence_pass_rate_cost_per_task_and_runtime_per_task.md)

## Portfolio and scope boundaries

- [R155. KQode demonstrates agent harness, Context Engineering, Memory, tool calling, Planning, Workflow, sandbox, VFS, execution isolation, multi-agent, MCP, Skills, eval, badcase, observability, stability, and engineering productivity.](features/r155_kqode_demonstrates_agent_harness_context_engineering_memory_tool_calling.md)
- [R156. KQode maps features to JD signals from `job/all-jds.md`.](features/r156_kqode_maps_features_to_jd_signals_from_job_all_jds_md.md)
- [R157. KQode keeps advanced RAG, model fine-tuning, model serving, cloud-native deployment, enterprise policy, GitHub automation, and cross-device ecosystem features as later proof-of-depth areas.](features/r157_kqode_keeps_advanced_rag_model_fine_tuning_model_serving_cloud_native_de.md)
- [R158. KQode remains a standalone product, not a fork of any reference coding agent.](features/r158_kqode_remains_a_standalone_product_not_a_fork_of_any_reference_coding_ag.md)
- [R159. KQode has a flagship demo where it solves a real task on its own codebase.](features/r159_kqode_has_a_flagship_demo_where_it_solves_a_real_task_on_its_own_codebas.md)
- [R160. KQode can show an interviewer the task, diff, checks, trace, approvals, and outcome.](features/r160_kqode_can_show_an_interviewer_the_task_diff_checks_trace_approvals_and_o.md)
