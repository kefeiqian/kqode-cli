use std::sync::{Mutex, MutexGuard};

use lsp_server::{Connection, Message, Request, Response};

use crate::protocol::{JSON_RPC_INVALID_PARAMS, ModelListParams, SetKeyParams};
use crate::provider::ProviderId;
use crate::store::Store;

static KIMI_PROVIDER_LOCK: Mutex<()> = Mutex::new(());
static CUSTOM_PROVIDER_LOCK: Mutex<()> = Mutex::new(());

pub(super) fn handle_provider_set_key(
    request: Request,
    connection: &Connection,
    store: &Store,
) -> Option<Response> {
    let params = match serde_json::from_value::<SetKeyParams>(request.params) {
        Ok(params) => params,
        Err(error) => {
            return Some(Response::new_err(
                request.id,
                JSON_RPC_INVALID_PARAMS,
                format!("invalid provider setKey params: {error}"),
            ));
        }
    };
    let key = crate::secrets::ApiKey::new(params.api_key);
    let work = match crate::login::prepare_set_key_work(
        &params.provider_id,
        params.base_url,
        params.label,
        key,
    ) {
        Ok(work) => work,
        Err(error) => {
            return Some(Response::new_err(
                request.id,
                JSON_RPC_INVALID_PARAMS,
                format!("invalid provider setKey params: {error}"),
            ));
        }
    };
    let id = request.id;
    let sender = connection.sender.clone();
    let store = store.clone();
    std::thread::spawn(move || {
        let response = match tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
        {
            Ok(runtime) => Response::new_ok(id, {
                let _guard = provider_lock(work.provider);
                runtime.block_on(crate::login::set_provider_key(store, work))
            }),
            Err(error) => Response::new_err(
                id,
                JSON_RPC_INVALID_PARAMS,
                format!("failed to create validation runtime: {error}"),
            ),
        };
        let _ = sender.send(Message::Response(response));
    });
    None
}

pub(super) fn handle_provider_models(
    request: Request,
    connection: &Connection,
    store: &Store,
) -> Option<Response> {
    let params = match serde_json::from_value::<ModelListParams>(request.params) {
        Ok(params) => params,
        Err(error) => {
            return Some(Response::new_err(
                request.id,
                JSON_RPC_INVALID_PARAMS,
                format!("invalid provider models params: {error}"),
            ));
        }
    };
    let Some(provider) = crate::provider::ProviderId::parse(&params.provider_id) else {
        return Some(Response::new_err(
            request.id,
            JSON_RPC_INVALID_PARAMS,
            "invalid provider models params: unknown provider id".to_owned(),
        ));
    };
    let id = request.id;
    let sender = connection.sender.clone();
    let store = store.clone();
    std::thread::spawn(move || {
        let response = match tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
        {
            Ok(runtime) => Response::new_ok(id, {
                let _guard = provider_lock(provider);
                runtime.block_on(crate::login::list_models(store, provider))
            }),
            Err(error) => Response::new_err(
                id,
                JSON_RPC_INVALID_PARAMS,
                format!("failed to create model-list runtime: {error}"),
            ),
        };
        let _ = sender.send(Message::Response(response));
    });
    None
}

fn provider_lock(provider: ProviderId) -> MutexGuard<'static, ()> {
    let lock = match provider {
        ProviderId::Kimi => &KIMI_PROVIDER_LOCK,
        ProviderId::Custom => &CUSTOM_PROVIDER_LOCK,
    };
    lock.lock().unwrap_or_else(|poison| poison.into_inner())
}
