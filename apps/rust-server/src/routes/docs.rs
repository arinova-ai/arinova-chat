use axum::{
    response::{IntoResponse, Response},
    routing::get,
    Router,
};

use crate::AppState;

const MCP_TOOLS_README: &str = include_str!("mcp_tools_readme.md");

pub fn router() -> Router<AppState> {
    Router::new().route("/docs/mcp-tools", get(get_mcp_tools))
}

async fn get_mcp_tools() -> Response {
    (
        [("content-type", "text/plain; charset=utf-8")],
        MCP_TOOLS_README,
    )
        .into_response()
}
