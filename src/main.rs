//! Database Manager app — sidecar process with embedded Axum + UDS.
//!
//! Startup flow:
//! 1. Connect broker (supervisor health check)
//! 2. Start Axum router on `<runtime_dir>/apps/database.sock`
//! 3. Report sock to broker via `data_plane_socket`
//! 4. Server proxies `/api/apps/database/<rest>` to this sock

const MANIFEST: &str = include_str!("../tokimo-app.toml");

mod app_server;
mod assets;
mod db;
mod handlers;

use std::sync::Arc;

use clap::Parser;
use tokimo_bus_cli::TokimoAuthArgs;
use tokimo_bus_client::{BusClient, ClientConfig};
use tracing::{error, info};

#[derive(Parser, Debug)]
#[command(
    name = "tokimo-app-database",
    about = "Database Manager — Tokimo multi-engine database client",
    long_about = "Database Manager CLI — connect to and browse databases.\n\nRun without arguments when launched by the Tokimo supervisor (TOKIMO_BUS_SOCKET injected).",
    term_width = 100
)]
struct Cli {
    #[command(flatten)]
    auth: TokimoAuthArgs,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _cli = Cli::parse();

    if std::env::var_os("TOKIMO_BUS_SOCKET").is_some() {
        tracing_subscriber::fmt()
            .with_env_filter(
                tracing_subscriber::EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| "info,tokimo_bus_client=info,tokimo_app_database=debug".into()),
            )
            .init();
        if let Err(error) = run_server().await {
            error!(%error, "database: fatal");
            std::process::exit(1);
        }
    } else {
        use clap::CommandFactory;
        let mut cmd = Cli::command();
        tokimo_bus_cli::print_help_unified(&mut cmd);
        std::process::exit(0);
    }

    Ok(())
}

async fn run_server() -> anyhow::Result<()> {
    let cfg = ClientConfig::from_env().map_err(|e| anyhow::anyhow!("ClientConfig: {e}"))?;
    info!(endpoint = ?cfg.endpoint, "database: connecting to broker");

    let db = db::init_pool().await?;
    info!("database: db connected");

    let anysql = tokimo_package_anysql::SessionManager::new(std::time::Duration::from_secs(3600));

    let ctx = Arc::new(handlers::AppCtx { db, anysql });

    let app_socket = app_server::spawn("database", Arc::clone(&ctx))
        .await
        .map_err(|e| anyhow::anyhow!("app_server spawn: {e}"))?;

    let client = BusClient::builder(cfg)
        .service("database", env!("CARGO_PKG_VERSION"))
        .data_plane(app_socket)
        .build()
        .await
        .map_err(|e| anyhow::anyhow!("bus build: {e}"))?;

    info!("database: registered with broker");

    let shutdown = {
        let client = Arc::clone(&client);
        tokio::spawn(async move { client.run_until_shutdown().await })
    };

    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            info!("database: SIGINT received");
            client.shutdown();
        }
        _ = shutdown => info!("database: broker sent Shutdown"),
    }

    Ok(())
}
