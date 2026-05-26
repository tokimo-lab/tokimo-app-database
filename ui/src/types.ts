// Local type definitions — mirroring Rust anysql types (serde camelCase)

export type DbDriver =
  | "postgres"
  | "mysql"
  | "mariadb"
  | "sqlite"
  | "mssql"
  | "cockroachdb"
  | "tidb"
  | "clickhouse"
  | "oracle"
  | "mongodb"
  | "elasticsearch";

export interface DbConnectionConfig {
  driver: DbDriver;
  name: string;
  host: string;
  port?: number | null;
  username?: string | null;
  password?: string | null;
  database?: string | null;
  params?: string | null;
}

export interface DbSessionDto {
  id: string;
  config: DbConnectionConfig;
  currentDatabase?: string | null;
  serverVersion?: string | null;
  createdAt: string;
  lastActiveAt: string;
}

export interface DatabaseEntry {
  name: string;
  sizeBytes?: number | null;
  encoding?: string | null;
}

export interface SchemaEntry {
  name: string;
  owner?: string | null;
}

export type TableKind =
  | "table"
  | "view"
  | "materialized_view"
  | "foreign_table"
  | "sequence";

export interface TableEntry {
  name: string;
  schema?: string | null;
  kind: TableKind;
  estimatedRows?: number | null;
  sizeBytes?: number | null;
  comment?: string | null;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  isNullable: boolean;
  ordinal: number;
}

export interface QueryResult {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  rowsAffected: number;
  elapsedMs: number;
  truncated: boolean;
}

export interface ColumnDetail {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  defaultValue?: string | null;
  comment?: string | null;
  maxLength?: number | null;
  ordinal: number;
}

export interface IndexEntry {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
  indexType?: string | null;
}

export interface ForeignKeyEntry {
  name: string;
  columns: string[];
  referencedTable: string;
  referencedSchema?: string | null;
  referencedColumns: string[];
  onDelete?: string | null;
  onUpdate?: string | null;
}

export interface TableDetail {
  name: string;
  schema?: string | null;
  kind: TableKind;
  columns: ColumnDetail[];
  indexes: IndexEntry[];
  foreignKeys: ForeignKeyEntry[];
  createSql?: string | null;
  comment?: string | null;
  estimatedRows?: number | null;
  sizeBytes?: number | null;
}

export interface DatabaseOverview {
  serverVersion: string;
  uptimeSeconds?: string | null;
  currentDatabase: string;
  currentUser: string;
  databaseSizeBytes?: number | null;
  activeConnections: number;
  maxConnections: number;
}

// Input type for connect / test-connection
export interface AnysqlConnectInput {
  driver: DbDriver;
  name: string;
  host: string;
  port?: number | null;
  username?: string | null;
  password?: string | null;
  database?: string | null;
  params?: string | null;
  savedId?: string | null;
}

export interface ExecuteSqlInput {
  sessionId: string;
  sql: string;
  maxRows?: number;
}

// Named aliases used in query result context
export type QueryColumn = ColumnInfo;
export type QueryRow = Record<string, unknown>;

export interface RoutineEntry {
  name: string;
  schema?: string | null;
  kind: string;
  returnType?: string | null;
  language?: string | null;
  definition?: string | null;
}

export interface TriggerEntry {
  name: string;
  tableName: string;
  schema?: string | null;
  event: string;
  timing: string;
  definition?: string | null;
}

export interface ActiveQuery {
  pid: string;
  username?: string | null;
  database?: string | null;
  query?: string | null;
  state?: string | null;
  startedAt?: string | null;
  duration?: string | null;
  clientAddr?: string | null;
}

export interface ServerVariable {
  name: string;
  value: string;
  description?: string | null;
}

// Request bodies
export interface KillQueryRequest {
  pid: string;
}

export interface SwitchDatabaseRequest {
  database: string;
}
