# tokimo-app-database

Multi-engine database client sidecar for Tokimo OS.

## Features

- Connect to PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, CockroachDB, TiDB, ClickHouse, Oracle, MongoDB, Elasticsearch
- Browse databases, schemas, and tables
- Execute SQL queries with syntax highlighting
- View and edit table data with inline cell editing
- Inspect table structure (columns, indexes, foreign keys)
- Auto-reconnect saved connections on server restart
- Persistent connection storage in `db_management` schema

## Development

```bash
# Build
cargo build -p tokimo-app-database

# Check
cargo check -p tokimo-app-database

# UI
cd apps/tokimo-app-database/ui
pnpm build
```

## Architecture

This is a sidecar app following the Tokimo multi-process pattern:
- Rust binary exposes an Axum HTTP server on a Unix domain socket
- The main Tokimo server proxies `/api/apps/database/*` to this socket
- UI assets are embedded via `rust-embed` and served from the same socket
- Connection configs are persisted in PostgreSQL (`db_management.db_connections`)
- Active sessions are managed in-memory by `tokimo-package-anysql`
