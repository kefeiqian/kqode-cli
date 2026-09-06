use std::thread;

use lsp_server::{Connection, Message, Request, Response};

use crate::git;
use crate::protocol::GitStatusResult;

/// Spawns a detached worker for the deferred `kqode.git.status` response.
pub(super) fn spawn_git_status(request: Request, connection: &Connection) {
    let id = request.id;
    let sender = connection.sender.clone();
    thread::spawn(move || {
        let response = Response::new_ok(
            id,
            GitStatusResult {
                label: git::status_label(),
            },
        );
        let _ = sender.send(Message::Response(response));
    });
}
