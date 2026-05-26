//! Embedded Axum HTTP server for the Database Manager app.

use std::sync::Arc;

use axum::{
    Router,
    routing::{get, post},
};
use tokimo_bus_protocol::{BusListener, DataPlaneSocket};
use tracing::{error, info};

use crate::{assets, handlers, handlers::AppCtx};

pub async fn spawn(service: &str, ctx: Arc<AppCtx>) -> anyhow::Result<DataPlaneSocket> {
    let (listener, socket) = BusListener::bind_for_app(service)?;
    info!(?socket, "database: app server listening");

    let router = build_router(ctx);

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, router).await {
            error!(error = %e, "database: app server stopped");
        }
    });

    Ok(socket)
}

fn build_router(ctx: Arc<AppCtx>) -> Router {
    Router::new()
        // Session management
        .route("/sessions", post(handlers::connect).get(handlers::list_sessions))
        .route("/sessions/{id}", get(handlers::get_session).delete(handlers::delete_connection))
        .route("/sessions/{id}/disconnect", post(handlers::disconnect))
        // Test connection
        .route("/test", post(handlers::test_connection))
        // SQL execution
        .route("/sessions/{id}/execute", post(handlers::execute_sql))
        // Schema browsing
        .route("/sessions/{id}/overview", get(handlers::overview))
        .route("/sessions/{id}/databases", get(handlers::list_databases))
        .route("/sessions/{id}/schemas", get(handlers::list_schemas))
        .route("/sessions/{id}/tables", get(handlers::list_tables))
        .route("/sessions/{id}/table", get(handlers::describe_table))
        .route("/sessions/{id}/routines", get(handlers::list_routines))
        .route("/sessions/{id}/triggers", get(handlers::list_triggers))
        // Operations
        .route("/sessions/{id}/active-queries", get(handlers::list_active_queries))
        .route("/sessions/{id}/kill-query", post(handlers::kill_query))
        .route("/sessions/{id}/variables", get(handlers::list_variables))
        .route("/sessions/{id}/switch-db", post(handlers::switch_database))
        // Static assets
        .route("/assets/{*path}", get(assets::serve))
        .with_state(ctx)
}
