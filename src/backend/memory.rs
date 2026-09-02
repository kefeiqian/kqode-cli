//! Backend JSON-RPC handlers for `/memory`.
//!
//! Each handler parses and validates params, constructs a per-request
//! [`MemoryService`] anchored beside the store DB, invokes the backend-owned
//! operation, and maps store rows to redacted wire types. Errors carry only
//! [`crate::memory::MemoryError`] labels, never raw memory content (R18).

use std::path::PathBuf;

use lsp_server::{Request, Response};

use crate::memory::{
    InboxAction, InboxStatus, MemoryError, MemoryScope, MemoryService, MemoryType,
};
use crate::protocol::{
    JSON_RPC_INVALID_PARAMS, MemoryAddParams, MemoryEditParams, MemoryForgetParams,
    MemoryForgetResult, MemoryInboxApplyParams, MemoryInboxApplyResult, MemoryInboxEntryWire,
    MemoryInboxListParams, MemoryInboxListResult, MemoryInboxUndoParams, MemoryInboxUndoResult,
    MemoryItemWire, MemoryListParams, MemoryListResult, MemoryMutationResult, MemoryShowParams,
    MemoryShowResult,
};
use crate::store::{Store, StoredInboxEntry, StoredMemoryItem};

pub(super) fn handle_memory_list(request: Request, store: &Store) -> Response {
    let params = match parse::<MemoryListParams>(&request, "memory list") {
        Ok(params) => params,
        Err(response) => return response,
    };
    let scope = match params.scope.as_deref().map(parse_scope).transpose() {
        Ok(scope) => scope,
        Err(()) => return unknown(request.id, "scope"),
    };
    let service = match service(store) {
        Ok(service) => service,
        Err(error) => return err_response(request, error),
    };
    match service.list(scope, params.active_only.unwrap_or(false)) {
        Ok(items) => Response::new_ok(
            request.id,
            MemoryListResult {
                items: item_wires(items),
            },
        ),
        Err(error) => err_response(request, error),
    }
}

pub(super) fn handle_memory_show(request: Request, store: &Store) -> Response {
    let params = match parse::<MemoryShowParams>(&request, "memory show") {
        Ok(params) => params,
        Err(response) => return response,
    };
    let Ok(scope) = parse_scope(&params.scope) else {
        return unknown(request.id, "scope");
    };
    let service = match service(store) {
        Ok(service) => service,
        Err(error) => return err_response(request, error),
    };
    match service.show(scope, params.scope_id.as_deref(), &params.id) {
        Ok((item, body)) => Response::new_ok(
            request.id,
            MemoryShowResult {
                item: item_wire(item),
                body,
            },
        ),
        Err(error) => err_response(request, error),
    }
}

pub(super) fn handle_memory_add(request: Request, store: &Store) -> Response {
    let params = match parse::<MemoryAddParams>(&request, "memory add") {
        Ok(params) => params,
        Err(response) => return response,
    };
    let Ok(scope) = parse_scope(&params.scope) else {
        return unknown(request.id, "scope");
    };
    let Some(memory_type) = MemoryType::parse(&params.memory_type) else {
        return unknown(request.id, "type");
    };
    let service = match service(store) {
        Ok(service) => service,
        Err(error) => return err_response(request, error),
    };
    match service.add(
        scope,
        params.scope_id.as_deref(),
        memory_type,
        params.title,
        params.body,
    ) {
        Ok(item) => Response::new_ok(
            request.id,
            MemoryMutationResult {
                item: item_wire(item),
            },
        ),
        Err(error) => err_response(request, error),
    }
}

pub(super) fn handle_memory_edit(request: Request, store: &Store) -> Response {
    let params = match parse::<MemoryEditParams>(&request, "memory edit") {
        Ok(params) => params,
        Err(response) => return response,
    };
    let Ok(scope) = parse_scope(&params.scope) else {
        return unknown(request.id, "scope");
    };
    let service = match service(store) {
        Ok(service) => service,
        Err(error) => return err_response(request, error),
    };
    match service.edit(
        scope,
        params.scope_id.as_deref(),
        &params.id,
        params.title,
        params.body,
    ) {
        Ok(item) => Response::new_ok(
            request.id,
            MemoryMutationResult {
                item: item_wire(item),
            },
        ),
        Err(error) => err_response(request, error),
    }
}

pub(super) fn handle_memory_forget(request: Request, store: &Store) -> Response {
    let params = match parse::<MemoryForgetParams>(&request, "memory forget") {
        Ok(params) => params,
        Err(response) => return response,
    };
    let Ok(scope) = parse_scope(&params.scope) else {
        return unknown(request.id, "scope");
    };
    let service = match service(store) {
        Ok(service) => service,
        Err(error) => return err_response(request, error),
    };
    let id = params.id.clone();
    match service.forget(scope, params.scope_id.as_deref(), &params.id) {
        Ok(forgotten) => Response::new_ok(request.id, MemoryForgetResult { id, forgotten }),
        Err(error) => err_response(request, error),
    }
}

pub(super) fn handle_memory_reload(request: Request, store: &Store) -> Response {
    let service = match service(store) {
        Ok(service) => service,
        Err(error) => return err_response(request, error),
    };
    match service.reload() {
        Ok(items) => Response::new_ok(
            request.id,
            MemoryListResult {
                items: item_wires(items),
            },
        ),
        Err(error) => err_response(request, error),
    }
}

pub(super) fn handle_memory_inbox_list(request: Request, store: &Store) -> Response {
    let params = match parse::<MemoryInboxListParams>(&request, "memory inbox list") {
        Ok(params) => params,
        Err(response) => return response,
    };
    let status = match params.status.as_deref().map(parse_status).transpose() {
        Ok(status) => status,
        Err(()) => return unknown(request.id, "status"),
    };
    let service = match service(store) {
        Ok(service) => service,
        Err(error) => return err_response(request, error),
    };
    match service.inbox_list(status) {
        Ok(entries) => Response::new_ok(
            request.id,
            MemoryInboxListResult {
                entries: inbox_wires(entries),
            },
        ),
        Err(error) => err_response(request, error),
    }
}

pub(super) fn handle_memory_inbox_apply(request: Request, store: &Store) -> Response {
    let params = match parse::<MemoryInboxApplyParams>(&request, "memory inbox apply") {
        Ok(params) => params,
        Err(response) => return response,
    };
    let Some(action) = InboxAction::parse(&params.action) else {
        return unknown(request.id, "action");
    };
    let service = match service(store) {
        Ok(service) => service,
        Err(error) => return err_response(request, error),
    };
    match service.inbox_apply(&params.entry_id, action) {
        Ok(entry) => Response::new_ok(
            request.id,
            MemoryInboxApplyResult {
                entry: inbox_wire(entry),
            },
        ),
        Err(error) => err_response(request, error),
    }
}

pub(super) fn handle_memory_inbox_undo(request: Request, store: &Store) -> Response {
    let params = match parse::<MemoryInboxUndoParams>(&request, "memory inbox undo") {
        Ok(params) => params,
        Err(response) => return response,
    };
    let service = match service(store) {
        Ok(service) => service,
        Err(error) => return err_response(request, error),
    };
    match service.inbox_undo(&params.entry_id) {
        Ok((entry, restored)) => Response::new_ok(
            request.id,
            MemoryInboxUndoResult {
                entry: inbox_wire(entry),
                restored,
            },
        ),
        Err(error) => err_response(request, error),
    }
}

fn service(store: &Store) -> Result<MemoryService, MemoryError> {
    let workspace_cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    MemoryService::new(store.clone(), &workspace_cwd, None)
}

fn parse<T: serde::de::DeserializeOwned>(request: &Request, context: &str) -> Result<T, Response> {
    serde_json::from_value::<T>(request.params.clone()).map_err(|error| {
        Response::new_err(
            request.id.clone(),
            JSON_RPC_INVALID_PARAMS,
            format!("invalid {context} params: {error}"),
        )
    })
}

fn parse_scope(value: &str) -> Result<MemoryScope, ()> {
    MemoryScope::parse(value).ok_or(())
}

fn parse_status(value: &str) -> Result<InboxStatus, ()> {
    InboxStatus::parse(value).ok_or(())
}

fn unknown(id: lsp_server::RequestId, field: &str) -> Response {
    Response::new_err(
        id,
        JSON_RPC_INVALID_PARAMS,
        format!("unknown memory {field}"),
    )
}

fn err_response(request: Request, error: MemoryError) -> Response {
    Response::new_err(request.id, JSON_RPC_INVALID_PARAMS, error.to_string())
}

fn item_wires(items: Vec<StoredMemoryItem>) -> Vec<MemoryItemWire> {
    items.into_iter().map(item_wire).collect()
}

fn item_wire(item: StoredMemoryItem) -> MemoryItemWire {
    MemoryItemWire {
        id: item.id,
        scope: item.scope.as_str().to_owned(),
        scope_id: item.scope_id,
        memory_type: item.memory_type.as_str().to_owned(),
        title: item.title,
        active: item.active,
        source: item.source.as_str().to_owned(),
        source_session_id: item.source_session_id,
        source_turn_start: item.source_turn_start,
        source_turn_end: item.source_turn_end,
        content_hash: item.content_hash,
        created_at: item.created_at,
        updated_at: item.updated_at,
    }
}

fn inbox_wires(entries: Vec<StoredInboxEntry>) -> Vec<MemoryInboxEntryWire> {
    entries.into_iter().map(inbox_wire).collect()
}

fn inbox_wire(entry: StoredInboxEntry) -> MemoryInboxEntryWire {
    MemoryInboxEntryWire {
        id: entry.id,
        status: entry.status.as_str().to_owned(),
        scope: entry.scope.as_str().to_owned(),
        scope_id: entry.scope_id,
        target_item_id: entry.target_item_id,
        memory_type: entry
            .memory_type
            .map(|memory_type| memory_type.as_str().to_owned()),
        title: entry.title,
        confidence: entry.confidence,
        reason: entry.reason,
        created_at: entry.created_at,
        updated_at: entry.updated_at,
    }
}
