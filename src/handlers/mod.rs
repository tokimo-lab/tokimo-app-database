//! Axum handlers for the Database Manager app.

use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokimo_package_anysql::{DbConnectionConfig, DbDriver, DbSessionDto, SessionManager};
use tracing::info;

use crate::db::repos::db_connection_repo::{DbConnectionInput, DbConnectionRepo};

// ── App context ───────────────────────────────────────────────────────────────

pub struct AppCtx {
    pub db: DatabaseConnection,
    pub anysql: Arc<SessionManager>,
}

// ── Error type ────────────────────────────────────────────────────────────────

pub enum AppError {
    NotFound(String),
    BadRequest(String),
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            Self::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            Self::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            Self::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
        };
        let body = serde_json::json!({ "error": message });
        (status, Json(body)).into_response()
    }
}

impl From<sea_orm::DbErr> for AppError {
    fn from(e: sea_orm::DbErr) -> Self {
        Self::Internal(format!("db: {e}"))
    }
}

impl From<tokimo_package_anysql::AnySqlError> for AppError {
    fn from(e: tokimo_package_anysql::AnySqlError) -> Self {
        use tokimo_package_anysql::AnySqlError;
        match e {
            AnySqlError::SessionNotFound(msg) => Self::NotFound(msg),
            AnySqlError::BadInput(msg) | AnySqlError::Unsupported(msg) => Self::BadRequest(msg),
            AnySqlError::Auth(msg)
            | AnySqlError::Connection(msg)
            | AnySqlError::Query(msg)
            | AnySqlError::Internal(msg) => Self::BadRequest(msg),
        }
    }
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        Self::Internal(e.to_string())
    }
}

// ── Response helpers ──────────────────────────────────────────────────────────

pub fn ok<T: Serialize>(data: T) -> Response {
    (StatusCode::OK, Json(data)).into_response()
}

pub fn ok_empty() -> Response {
    StatusCode::NO_CONTENT.into_response()
}

// ── Auto-reconnect helper ─────────────────────────────────────────────────────

async fn ensure_session(ctx: &AppCtx, session_id: &str) -> Result<(), AppError> {
    if ctx.anysql.has_session(session_id).await {
        return Ok(());
    }

    let uid: uuid::Uuid = session_id
        .parse()
        .map_err(|_| AppError::NotFound(format!("session {session_id} not found")))?;

    let saved = DbConnectionRepo::get_by_id(&ctx.db, uid)
        .await
        .map_err(|_| AppError::NotFound("session expired and no saved config found".into()))?;

    let driver: DbDriver = serde_json::from_value(serde_json::Value::String(saved.driver.clone()))
        .map_err(|_| AppError::BadRequest("invalid driver in saved config".into()))?;

    let config = DbConnectionConfig {
        driver,
        name: saved.name,
        host: saved.host,
        port: saved.port.map(|p| p as u16),
        username: saved.username,
        password: saved.password,
        database: saved.database,
        params: saved.params,
    };

    ctx.anysql.connect_with_id(session_id.to_string(), config).await?;

    info!(session_id, "auto-reconnected database session from saved config");
    Ok(())
}

// ── Request types ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectBody {
    pub driver: DbDriver,
    pub name: String,
    pub host: String,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database: Option<String>,
    pub params: Option<String>,
    pub saved_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteSqlBody {
    pub sql: String,
    #[serde(default = "default_max_rows")]
    pub max_rows: usize,
}

fn default_max_rows() -> usize {
    1000
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaParams {
    pub schema: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableParams {
    pub table: String,
    pub schema: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariablesParams {
    pub filter: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KillQueryBody {
    pub pid: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchDbBody {
    pub database: String,
}

// ── Session management ────────────────────────────────────────────────────────

pub async fn connect(State(ctx): State<Arc<AppCtx>>, Json(body): Json<ConnectBody>) -> Response {
    let driver_str = body.driver.to_string();
    let port_i32 = body.port.map(i32::from);

    let saved = if let Some(saved_id) = &body.saved_id {
        let uid: uuid::Uuid = match saved_id.parse() {
            Ok(u) => u,
            Err(_) => return AppError::BadRequest("invalid saved_id".into()).into_response(),
        };
        match DbConnectionRepo::update(
            &ctx.db,
            uid,
            DbConnectionInput {
                driver: driver_str.clone(),
                name: body.name.clone(),
                host: body.host.clone(),
                port: port_i32,
                username: body.username.clone(),
                password: body.password.clone(),
                database: body.database.clone(),
                params: body.params.clone(),
            },
        )
        .await
        {
            Ok(m) => m,
            Err(e) => return e.into_response(),
        }
    } else {
        match DbConnectionRepo::create(
            &ctx.db,
            DbConnectionInput {
                driver: driver_str.clone(),
                name: body.name.clone(),
                host: body.host.clone(),
                port: port_i32,
                username: body.username.clone(),
                password: body.password.clone(),
                database: body.database.clone(),
                params: body.params.clone(),
            },
        )
        .await
        {
            Ok(m) => m,
            Err(e) => return e.into_response(),
        }
    };

    let config = DbConnectionConfig {
        driver: body.driver,
        name: body.name,
        host: body.host,
        port: body.port,
        username: body.username,
        password: body.password,
        database: body.database,
        params: body.params,
    };

    let saved_id_str = saved.id.to_string();
    match ctx.anysql.connect_with_id(saved_id_str, config).await {
        Ok(dto) => ok(dto),
        Err(e) => AppError::from(e).into_response(),
    }
}

pub async fn list_sessions(State(ctx): State<Arc<AppCtx>>) -> Response {
    let saved = match DbConnectionRepo::list_all(&ctx.db).await {
        Ok(rows) => rows,
        Err(e) => return e.into_response(),
    };

    let mut result = Vec::with_capacity(saved.len());
    for row in saved {
        let id_str = row.id.to_string();

        let (current_database, server_version, last_active_at) = if let Ok(live) = ctx.anysql.get_session(&id_str).await
        {
            (live.current_database, live.server_version, live.last_active_at)
        } else {
            (row.database.clone(), None, row.updated_at.to_rfc3339())
        };

        let driver: DbDriver = match serde_json::from_value(serde_json::Value::String(row.driver.clone())) {
            Ok(d) => d,
            Err(_) => continue,
        };

        result.push(DbSessionDto {
            id: id_str,
            config: DbConnectionConfig {
                driver,
                name: row.name,
                host: row.host,
                port: row.port.map(|p| p as u16),
                username: row.username,
                password: row.password,
                database: row.database,
                params: row.params,
            },
            current_database,
            server_version,
            created_at: row.created_at.to_rfc3339(),
            last_active_at,
        });
    }

    ok(result)
}

pub async fn get_session(State(ctx): State<Arc<AppCtx>>, Path(id): Path<String>) -> Response {
    if let Err(e) = ensure_session(&ctx, &id).await {
        let uid: uuid::Uuid = match id.parse() {
            Ok(u) => u,
            Err(_) => return e.into_response(),
        };
        return match DbConnectionRepo::get_by_id(&ctx.db, uid).await {
            Ok(row) => {
                let driver: DbDriver = match serde_json::from_value(serde_json::Value::String(row.driver.clone())) {
                    Ok(d) => d,
                    Err(_) => return AppError::BadRequest("invalid driver in saved config".into()).into_response(),
                };
                let dto = DbSessionDto {
                    id: row.id.to_string(),
                    config: DbConnectionConfig {
                        driver,
                        name: row.name,
                        host: row.host,
                        port: row.port.map(|p| p as u16),
                        username: row.username,
                        password: row.password,
                        database: row.database.clone(),
                        params: row.params,
                    },
                    current_database: row.database,
                    server_version: None,
                    created_at: row.created_at.to_rfc3339(),
                    last_active_at: row.updated_at.to_rfc3339(),
                };
                ok(dto)
            }
            Err(e) => e.into_response(),
        };
    }

    match ctx.anysql.get_session(&id).await {
        Ok(dto) => ok(dto),
        Err(e) => AppError::from(e).into_response(),
    }
}

pub async fn disconnect(State(ctx): State<Arc<AppCtx>>, Path(id): Path<String>) -> Response {
    ctx.anysql.disconnect_if_exists(&id).await;
    ok_empty()
}

pub async fn delete_connection(State(ctx): State<Arc<AppCtx>>, Path(id): Path<String>) -> Response {
    ctx.anysql.disconnect_if_exists(&id).await;

    let uid: uuid::Uuid = match id.parse() {
        Ok(u) => u,
        Err(_) => return AppError::NotFound("Connection not found".into()).into_response(),
    };
    match DbConnectionRepo::delete(&ctx.db, uid).await {
        Ok(()) => ok_empty(),
        Err(e) => e.into_response(),
    }
}

pub async fn test_connection(Json(body): Json<ConnectBody>) -> Response {
    let config = DbConnectionConfig {
        driver: body.driver,
        name: body.name,
        host: body.host,
        port: body.port,
        username: body.username,
        password: body.password,
        database: body.database,
        params: body.params,
    };

    match SessionManager::test_connection(&config).await {
        Ok(overview) => ok(overview),
        Err(e) => AppError::from(e).into_response(),
    }
}

// ── SQL execution ─────────────────────────────────────────────────────────────

pub async fn execute_sql(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
    Json(body): Json<ExecuteSqlBody>,
) -> Response {
    if let Err(e) = ensure_session(&ctx, &id).await {
        return e.into_response();
    }
    let max_rows = body.max_rows.clamp(1, 50000);
    match ctx.anysql.execute_sql(&id, &body.sql, max_rows).await {
        Ok(result) => ok(result),
        Err(e) => AppError::from(e).into_response(),
    }
}

// ── Schema browsing ───────────────────────────────────────────────────────────

pub async fn overview(State(ctx): State<Arc<AppCtx>>, Path(id): Path<String>) -> Response {
    if let Err(e) = ensure_session(&ctx, &id).await {
        return e.into_response();
    }
    match ctx.anysql.overview(&id).await {
        Ok(data) => ok(data),
        Err(e) => AppError::from(e).into_response(),
    }
}

pub async fn list_databases(State(ctx): State<Arc<AppCtx>>, Path(id): Path<String>) -> Response {
    if let Err(e) = ensure_session(&ctx, &id).await {
        return e.into_response();
    }
    match ctx.anysql.list_databases(&id).await {
        Ok(data) => ok(data),
        Err(e) => AppError::from(e).into_response(),
    }
}

pub async fn list_schemas(State(ctx): State<Arc<AppCtx>>, Path(id): Path<String>) -> Response {
    if let Err(e) = ensure_session(&ctx, &id).await {
        return e.into_response();
    }
    match ctx.anysql.list_schemas(&id).await {
        Ok(data) => ok(data),
        Err(e) => AppError::from(e).into_response(),
    }
}

pub async fn list_tables(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
    Query(params): Query<SchemaParams>,
) -> Response {
    if let Err(e) = ensure_session(&ctx, &id).await {
        return e.into_response();
    }
    match ctx.anysql.list_tables(&id, params.schema.as_deref()).await {
        Ok(data) => ok(data),
        Err(e) => AppError::from(e).into_response(),
    }
}

pub async fn describe_table(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
    Query(params): Query<TableParams>,
) -> Response {
    if let Err(e) = ensure_session(&ctx, &id).await {
        return e.into_response();
    }
    match ctx
        .anysql
        .describe_table(&id, &params.table, params.schema.as_deref())
        .await
    {
        Ok(data) => ok(data),
        Err(e) => AppError::from(e).into_response(),
    }
}

pub async fn list_routines(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
    Query(params): Query<SchemaParams>,
) -> Response {
    if let Err(e) = ensure_session(&ctx, &id).await {
        return e.into_response();
    }
    match ctx.anysql.list_routines(&id, params.schema.as_deref()).await {
        Ok(data) => ok(data),
        Err(e) => AppError::from(e).into_response(),
    }
}

pub async fn list_triggers(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
    Query(params): Query<SchemaParams>,
) -> Response {
    if let Err(e) = ensure_session(&ctx, &id).await {
        return e.into_response();
    }
    match ctx.anysql.list_triggers(&id, params.schema.as_deref()).await {
        Ok(data) => ok(data),
        Err(e) => AppError::from(e).into_response(),
    }
}

// ── Operations ────────────────────────────────────────────────────────────────

pub async fn list_active_queries(State(ctx): State<Arc<AppCtx>>, Path(id): Path<String>) -> Response {
    if let Err(e) = ensure_session(&ctx, &id).await {
        return e.into_response();
    }
    match ctx.anysql.list_active_queries(&id).await {
        Ok(data) => ok(data),
        Err(e) => AppError::from(e).into_response(),
    }
}

pub async fn kill_query(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
    Json(body): Json<KillQueryBody>,
) -> Response {
    if let Err(e) = ensure_session(&ctx, &id).await {
        return e.into_response();
    }
    match ctx.anysql.kill_query(&id, &body.pid).await {
        Ok(()) => ok_empty(),
        Err(e) => AppError::from(e).into_response(),
    }
}

pub async fn list_variables(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
    Query(params): Query<VariablesParams>,
) -> Response {
    if let Err(e) = ensure_session(&ctx, &id).await {
        return e.into_response();
    }
    match ctx.anysql.list_variables(&id, params.filter.as_deref()).await {
        Ok(data) => ok(data),
        Err(e) => AppError::from(e).into_response(),
    }
}

pub async fn switch_database(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
    Json(body): Json<SwitchDbBody>,
) -> Response {
    if let Err(e) = ensure_session(&ctx, &id).await {
        return e.into_response();
    }
    match ctx.anysql.switch_database(&id, &body.database).await {
        Ok(()) => ok_empty(),
        Err(e) => AppError::from(e).into_response(),
    }
}
