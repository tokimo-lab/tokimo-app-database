/**
 * DatabaseBrowserWindow — full database browser for the sidecar app.
 *
 * Left panel: tree of databases → schemas → tables
 * Right panel: SQL editor + results grid + table detail tabs
 *
 * Note: no @/system imports — this is a self-contained sidecar component.
 * Window metadata persistence is omitted (use local state only).
 */

import { Spin, type TabItem, Tabs } from "@tokimo/ui";
import {
  ChevronDown,
  ChevronRight,
  Database,
  Eye,
  Layers,
  RefreshCw,
  Table2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useExecuteSql,
  useGetSession,
  useListDatabases,
  useListSchemas,
  useListTables,
  useOverview,
  useSwitchDatabase,
} from "../api";
import type {
  DatabaseEntry,
  DbSessionDto,
  QueryResult,
  SchemaEntry,
  TableEntry,
} from "../types";
import QueryResultView from "./QueryResultView";
import SqlEditorBar, { type SqlEditorBarHandle } from "./SqlEditorBar";
import TableDataView from "./TableDataView";
import TableStructureView from "./TableStructureView";

interface Props {
  sessionId: string;
  initialTable?: string;
  initialSchema?: string;
  onTableSelect?: (table: string, schema?: string) => void;
}

type ActiveTab = "data" | "structure" | "query";

interface TreeState {
  expandedDbs: Set<string>;
  expandedSchemas: Set<string>;
}

export default function DatabaseBrowserWindow({
  sessionId,
  initialTable,
  initialSchema,
  onTableSelect,
}: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("data");
  const [selectedTable, setSelectedTable] = useState<string | null>(
    initialTable ?? null,
  );
  const [selectedSchema, setSelectedSchema] = useState<string | undefined>(
    initialSchema,
  );
  const sqlEditorRef = useRef<SqlEditorBarHandle>(null);
  const [initialSql] = useState(() => {
    if (initialTable) {
      const qualifiedName = initialSchema
        ? `"${initialSchema}"."${initialTable}"`
        : `"${initialTable}"`;
      return `SELECT * FROM ${qualifiedName} LIMIT 100;`;
    }
    return "";
  });
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [tree, setTree] = useState<TreeState>({
    expandedDbs: new Set(),
    expandedSchemas: initialSchema ? new Set([initialSchema]) : new Set(),
  });

  // ── Queries ──
  const sessionQuery = useGetSession(sessionId);
  const session = sessionQuery.data as DbSessionDto | undefined;

  const overviewQuery = useOverview(sessionId);
  const databasesQuery = useListDatabases(sessionId);
  const schemasQuery = useListSchemas(sessionId);
  const tablesQuery = useListTables(sessionId, selectedSchema);

  const executeMutation = useExecuteSql();
  const switchDbMutation = useSwitchDatabase();

  // Auto-expand current database
  useEffect(() => {
    if (session?.currentDatabase) {
      setTree((prev) => ({
        ...prev,
        expandedDbs: new Set(prev.expandedDbs).add(session.currentDatabase!),
      }));
    }
  }, [session?.currentDatabase]);

  // Auto-expand "public" schema for postgres
  useEffect(() => {
    if (schemasQuery.data?.length) {
      const pub = schemasQuery.data.find((s) => s.name === "public");
      if (pub) {
        setTree((prev) => ({
          ...prev,
          expandedSchemas: new Set(prev.expandedSchemas).add("public"),
        }));
        if (!selectedSchema) setSelectedSchema("public");
      }
    }
  }, [schemasQuery.data, selectedSchema]);

  const handleExecuteSql = useCallback(
    (sql: string) => {
      executeMutation.mutate(
        { sessionId, sql, maxRows: 10000 },
        {
          onSuccess: (result) => {
            setQueryResult(result);
            setActiveTab("query");
          },
        },
      );
    },
    [sessionId, executeMutation],
  );

  const handleTableClick = useCallback(
    (table: string, schema?: string) => {
      setSelectedTable(table);
      setSelectedSchema(schema);
      setActiveTab("data");
      const qualifiedName = schema ? `"${schema}"."${table}"` : `"${table}"`;
      sqlEditorRef.current?.setText(
        `SELECT * FROM ${qualifiedName} LIMIT 100;`,
      );
      onTableSelect?.(table, schema);
    },
    [onTableSelect],
  );

  const handleSwitchDb = useCallback(
    (dbName: string) => {
      switchDbMutation.mutate(
        { sessionId, database: dbName },
        {
          onSuccess: () => {
            sessionQuery.refetch();
            schemasQuery.refetch();
            tablesQuery.refetch();
          },
        },
      );
    },
    [sessionId, switchDbMutation, sessionQuery, schemasQuery, tablesQuery],
  );

  const toggleDb = useCallback((dbName: string) => {
    setTree((prev) => {
      const next = new Set(prev.expandedDbs);
      if (next.has(dbName)) next.delete(dbName);
      else next.add(dbName);
      return { ...prev, expandedDbs: next };
    });
  }, []);

  const toggleSchema = useCallback((schemaName: string) => {
    setTree((prev) => {
      const next = new Set(prev.expandedSchemas);
      if (next.has(schemaName)) next.delete(schemaName);
      else next.add(schemaName);
      return { ...prev, expandedSchemas: next };
    });
  }, []);

  const tables = tablesQuery.data ?? [];
  const tablesByKind = useMemo(() => {
    const map = new Map<string, TableEntry[]>();
    for (const t of tables) {
      const kind = t.kind ?? "table";
      const list = map.get(kind) ?? [];
      list.push(t);
      map.set(kind, list);
    }
    return map;
  }, [tables]);

  if (!session && sessionQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spin />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-fg-secondary">
        会话不存在或已断开
      </div>
    );
  }

  const overview = overviewQuery.data;

  const placeholder = (
    <div className="flex items-center justify-center h-full text-sm text-fg-muted">
      {selectedTable
        ? "选择标签页查看内容"
        : "从左侧选择一个表，或在上方输入 SQL 查询"}
    </div>
  );

  const dbTabItems: TabItem[] = [
    {
      key: "data",
      label: "表数据",
      children: selectedTable ? (
        <TableDataView
          sessionId={sessionId}
          table={selectedTable}
          schema={selectedSchema}
        />
      ) : (
        placeholder
      ),
    },
    {
      key: "structure",
      label: "表结构",
      children: selectedTable ? (
        <TableStructureView
          sessionId={sessionId}
          table={selectedTable}
          schema={selectedSchema}
        />
      ) : (
        placeholder
      ),
    },
    {
      key: "query",
      label: "查询结果",
      children: queryResult ? (
        <QueryResultView
          result={queryResult}
          isPending={executeMutation.isPending}
        />
      ) : (
        placeholder
      ),
    },
  ];

  return (
    <div className="flex h-full">
      {/* ── Left Sidebar ── */}
      <div className="w-56 flex-shrink-0 border-r border-border-base flex flex-col overflow-hidden bg-[var(--color-surface-sidebar)]">
        <div className="flex-1 overflow-y-auto text-xs select-none">
          {/* Databases */}
          {(databasesQuery.data ?? []).map((db) => (
            <DatabaseTreeNode
              key={db.name}
              db={db}
              isCurrentDb={db.name === session.currentDatabase}
              expanded={tree.expandedDbs.has(db.name)}
              onToggle={() => toggleDb(db.name)}
              onSwitchDb={() => handleSwitchDb(db.name)}
              onRefresh={() => databasesQuery.refetch()}
            />
          ))}

          {/* Schemas */}
          {(schemasQuery.data ?? []).length > 0 && (
            <div className="mt-1">
              {(schemasQuery.data ?? []).map((schema) => (
                <SchemaTreeNode
                  key={schema.name}
                  schema={schema}
                  expanded={tree.expandedSchemas.has(schema.name)}
                  onToggle={() => {
                    toggleSchema(schema.name);
                    setSelectedSchema(schema.name);
                    tablesQuery.refetch();
                  }}
                  tables={
                    tree.expandedSchemas.has(schema.name) &&
                    selectedSchema === schema.name
                      ? tables
                      : []
                  }
                  tablesByKind={
                    tree.expandedSchemas.has(schema.name) &&
                    selectedSchema === schema.name
                      ? tablesByKind
                      : new Map()
                  }
                  onTableClick={(t) => handleTableClick(t, schema.name)}
                  selectedTable={selectedTable}
                  onRefresh={() => {
                    schemasQuery.refetch();
                    tablesQuery.refetch();
                  }}
                />
              ))}
            </div>
          )}

          {/* Direct tables (no schema, e.g. MySQL) */}
          {(schemasQuery.data ?? []).length === 0 && tables.length > 0 && (
            <TableListItems
              tablesByKind={tablesByKind}
              onTableClick={(t) => handleTableClick(t)}
              selectedTable={selectedTable}
            />
          )}
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[var(--color-surface-content)]">
        {/* Connection info bar */}
        <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border-subtle text-[10px] text-fg-muted bg-[var(--color-surface-sidebar)] select-none">
          <span className="font-medium text-fg-secondary">
            {session.config.name}
          </span>
          <span>·</span>
          <span>
            {overview?.serverVersion ??
              session.serverVersion ??
              session.config.driver}
          </span>
          {session.currentDatabase && (
            <>
              <span>·</span>
              <span>{session.currentDatabase}</span>
            </>
          )}
        </div>

        {/* SQL Editor bar */}
        <SqlEditorBar
          ref={sqlEditorRef}
          initialValue={initialSql}
          onExecute={handleExecuteSql}
          isPending={executeMutation.isPending}
        />

        {/* Tabs + Content */}
        <Tabs
          size="small"
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as ActiveTab)}
          tabBarExtraContent={
            selectedTable ? (
              <span className="px-3 py-2 text-[10px] text-fg-muted">
                {selectedSchema ? `${selectedSchema}.` : ""}
                {selectedTable}
              </span>
            ) : undefined
          }
          items={dbTabItems}
          className="flex-1 flex flex-col min-h-0 [&>[role=tabpanel]]:flex-1 [&>[role=tabpanel]]:overflow-hidden"
        />
      </div>
    </div>
  );
}

// ── Tree Sub-components ──

function DatabaseTreeNode({
  db,
  isCurrentDb,
  expanded,
  onToggle,
  onSwitchDb,
  onRefresh,
}: {
  db: DatabaseEntry;
  isCurrentDb: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSwitchDb: () => void;
  onRefresh: () => void;
}) {
  return (
    <div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: tree node */}
      <div
        className={`group/node flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-surface-overlay-hover ${
          isCurrentDb ? "text-accent font-medium" : "text-fg-secondary"
        }`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onToggle();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!isCurrentDb) onSwitchDb();
        }}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 flex-shrink-0" />
        )}
        <Database className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{db.name}</span>
        <span className="ml-auto flex items-center gap-1">
          {db.sizeBytes != null && (
            <span className="text-[10px] text-fg-muted">
              {formatBytes(db.sizeBytes)}
            </span>
          )}
          <button
            type="button"
            className="p-0.5 rounded opacity-0 group-hover/node:opacity-100 hover:bg-surface-overlay-hover text-fg-muted hover:text-fg-secondary transition-opacity cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            title="刷新"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </span>
      </div>
    </div>
  );
}

function SchemaTreeNode({
  schema,
  expanded,
  onToggle,
  tables,
  tablesByKind,
  onTableClick,
  selectedTable,
  onRefresh,
}: {
  schema: SchemaEntry;
  expanded: boolean;
  onToggle: () => void;
  tables: TableEntry[];
  tablesByKind: Map<string, TableEntry[]>;
  onTableClick: (name: string) => void;
  selectedTable: string | null;
  onRefresh: () => void;
}) {
  return (
    <div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: tree node */}
      <div
        className="group/node flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-surface-overlay-hover text-fg-secondary"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onToggle();
        }}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 flex-shrink-0" />
        )}
        <Layers className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{schema.name}</span>
        <span className="ml-auto flex items-center gap-1">
          {tables.length > 0 && (
            <span className="text-[10px] text-fg-muted">{tables.length}</span>
          )}
          <button
            type="button"
            className="p-0.5 rounded opacity-0 group-hover/node:opacity-100 hover:bg-surface-overlay-hover text-fg-muted hover:text-fg-secondary transition-opacity cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            title="刷新"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </span>
      </div>
      {expanded && (
        <TableListItems
          tablesByKind={tablesByKind}
          onTableClick={onTableClick}
          selectedTable={selectedTable}
          indent
        />
      )}
    </div>
  );
}

function TableListItems({
  tablesByKind,
  onTableClick,
  selectedTable,
  indent,
}: {
  tablesByKind: Map<string, TableEntry[]>;
  onTableClick: (name: string) => void;
  selectedTable: string | null;
  indent?: boolean;
}) {
  const kindOrder = [
    "table",
    "view",
    "materialized_view",
    "foreign_table",
    "sequence",
  ];
  const kindLabel: Record<string, string> = {
    table: "表",
    view: "视图",
    materialized_view: "物化视图",
    foreign_table: "外部表",
    sequence: "序列",
  };
  const sortedKinds = [...tablesByKind.keys()].sort(
    (a, b) => kindOrder.indexOf(a) - kindOrder.indexOf(b),
  );

  return (
    <div className={indent ? "pl-4" : ""}>
      {sortedKinds.map((kind) => {
        const items = tablesByKind.get(kind) ?? [];
        return (
          <div key={kind}>
            {sortedKinds.length > 1 && (
              <div className="px-3 py-0.5 text-[10px] font-medium text-fg-muted uppercase tracking-wider">
                {kindLabel[kind] ?? kind}
              </div>
            )}
            {items.map((t) => (
              <button
                key={t.name}
                type="button"
                className={`w-full flex items-center gap-1.5 px-3 py-1 text-left hover:bg-surface-overlay-hover transition-colors cursor-pointer ${
                  selectedTable === t.name
                    ? "bg-accent-subtle text-accent"
                    : "text-fg-secondary"
                }`}
                onClick={() => onTableClick(t.name)}
              >
                {t.kind === "view" || t.kind === "materialized_view" ? (
                  <Eye className="h-3 w-3 flex-shrink-0 text-amber-500" />
                ) : (
                  <Table2 className="h-3 w-3 flex-shrink-0 text-accent" />
                )}
                <span className="truncate">{t.name}</span>
                {t.estimatedRows != null && (
                  <span className="ml-auto text-[10px] text-fg-muted">
                    ~{t.estimatedRows.toLocaleString()}
                  </span>
                )}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
