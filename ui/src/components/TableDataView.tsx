/**
 * TableDataView — displays table rows with inline cell-level CRUD editing.
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import { Button, type ContextMenuItem, Spin, useContextMenu } from "@tokimo/ui";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDescribeTable, useExecuteSql } from "../api";
import type { ColumnInfo, QueryResult } from "../types";
import CellEditor, { CellEditorFloating, needsModalEditor } from "./CellEditor";

interface Props {
  sessionId: string;
  table: string;
  schema?: string;
}

const PAGE_SIZE = 100;

interface CellPos {
  row: number;
  col: string;
}

export default function TableDataView({ sessionId, table, schema }: Props) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<CellPos | null>(null);
  const [editValue, setEditValue] = useState("");
  const [modalCell, setModalCell] = useState<CellPos | null>(null);
  const [modalAnchorEl, setModalAnchorEl] = useState<HTMLElement | null>(null);
  const [insertMode, setInsertMode] = useState(false);
  const [insertValues, setInsertValues] = useState<Record<string, string>>({});

  const { open: openCtxMenu, contextMenu } = useContextMenu();
  const executeMutation = useExecuteSql();

  const ROW_HEIGHT = 28;
  const scrollRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const [colWidths, setColWidths] = useState<number[] | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset on data change
  useLayoutEffect(() => {
    setColWidths(null);
  }, [data]);

  useLayoutEffect(() => {
    if (colWidths !== null || !theadRef.current) return;
    const ths = theadRef.current.querySelectorAll("th");
    if (ths.length === 0) return;
    const widths = Array.from(ths).map(
      (th) => th.getBoundingClientRect().width,
    );
    setColWidths(widths);
  }, [colWidths]);

  const virtualizer = useVirtualizer({
    count: data?.rows.length ?? 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  const qualifiedName = useMemo(
    () => (schema ? `"${schema}"."${table}"` : `"${table}"`),
    [schema, table],
  );

  const fetchData = useCallback(() => {
    setError(null);
    const offset = page * PAGE_SIZE;
    const sql = `SELECT * FROM ${qualifiedName} LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
    executeMutation.mutate(
      { sessionId, sql },
      {
        onSuccess: (result) => {
          setData(result);
          setEditingCell(null);
          setInsertMode(false);
        },
        onError: (err) => setError(String(err)),
      },
    );
  }, [sessionId, qualifiedName, page, executeMutation]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch on table/page change
  useEffect(() => {
    fetchData();
  }, [sessionId, table, schema, page]);

  const describeQuery = useDescribeTable(sessionId, table, schema);

  const pkColumns = useMemo(() => {
    if (!describeQuery.data) return [];
    return describeQuery.data.columns
      .filter((c) => c.isPrimaryKey)
      .map((c) => c.name);
  }, [describeQuery.data]);

  const columnTypeMap = useMemo(() => {
    const m = new Map<string, string>();
    if (describeQuery.data) {
      for (const c of describeQuery.data.columns) {
        m.set(c.name, c.dataType);
      }
    }
    return m;
  }, [describeQuery.data]);

  const buildWhereClause = useCallback(
    (row: Record<string, unknown>) => {
      return pkColumns
        .map((pk) => {
          const v = row[pk];
          if (v === null || v === undefined) return `"${pk}" IS NULL`;
          return `"${pk}" = '${String(v).replace(/'/g, "''")}'`;
        })
        .join(" AND ");
    },
    [pkColumns],
  );

  const handleCellSave = useCallback(() => {
    if (!editingCell || !data) return;
    const row = data.rows[editingCell.row];
    if (!row || pkColumns.length === 0) return;

    const colName = editingCell.col;
    const setClause =
      editValue === "NULL"
        ? `"${colName}" = NULL`
        : `"${colName}" = '${editValue.replace(/'/g, "''")}'`;

    const sql = `UPDATE ${qualifiedName} SET ${setClause} WHERE ${buildWhereClause(row)}`;
    executeMutation.mutate(
      { sessionId, sql },
      {
        onSuccess: () => fetchData(),
        onError: (err) => setError(String(err)),
      },
    );
  }, [
    editingCell,
    data,
    pkColumns,
    editValue,
    qualifiedName,
    sessionId,
    executeMutation,
    fetchData,
    buildWhereClause,
  ]);

  const handleDeleteRow = useCallback(
    (rowIndex: number) => {
      if (!data) return;
      const row = data.rows[rowIndex];
      if (!row || pkColumns.length === 0) return;

      const sql = `DELETE FROM ${qualifiedName} WHERE ${buildWhereClause(row)}`;
      executeMutation.mutate(
        { sessionId, sql },
        {
          onSuccess: () => fetchData(),
          onError: (err) => setError(String(err)),
        },
      );
    },
    [
      data,
      pkColumns,
      qualifiedName,
      sessionId,
      executeMutation,
      fetchData,
      buildWhereClause,
    ],
  );

  const handleInsertRow = useCallback(() => {
    if (!data) return;
    const cols = Object.keys(insertValues).filter(
      (k) => insertValues[k] !== "",
    );
    if (cols.length === 0) return;

    const columnList = cols.map((c) => `"${c}"`).join(", ");
    const valueList = cols
      .map((c) => {
        const v = insertValues[c];
        if (v === "NULL") return "NULL";
        return `'${v.replace(/'/g, "''")}'`;
      })
      .join(", ");

    const sql = `INSERT INTO ${qualifiedName} (${columnList}) VALUES (${valueList})`;
    executeMutation.mutate(
      { sessionId, sql },
      {
        onSuccess: () => fetchData(),
        onError: (err) => setError(String(err)),
      },
    );
  }, [
    data,
    insertValues,
    qualifiedName,
    sessionId,
    executeMutation,
    fetchData,
  ]);

  const startCellEdit = useCallback(
    (rowIndex: number, colName: string, cellEl?: HTMLElement) => {
      if (!data || pkColumns.length === 0) return;
      const row = data.rows[rowIndex];
      const raw = row[colName];
      const val =
        raw === null || raw === undefined
          ? "NULL"
          : typeof raw === "object"
            ? JSON.stringify(raw, null, 2)
            : String(raw);
      const dataType = columnTypeMap.get(colName) ?? "";
      if (needsModalEditor(dataType)) {
        setEditValue(val);
        setModalCell({ row: rowIndex, col: colName });
        setModalAnchorEl(cellEl ?? null);
      } else {
        setEditingCell({ row: rowIndex, col: colName });
        setEditValue(val);
      }
    },
    [data, pkColumns, columnTypeMap],
  );

  const handleModalSave = useCallback(
    (value: string) => {
      if (!modalCell || !data) return;
      const row = data.rows[modalCell.row];
      if (!row || pkColumns.length === 0) return;
      const colName = modalCell.col;
      const setClause =
        value === "NULL"
          ? `"${colName}" = NULL`
          : `"${colName}" = '${value.replace(/'/g, "''")}'`;
      const sql = `UPDATE ${qualifiedName} SET ${setClause} WHERE ${buildWhereClause(row)}`;
      executeMutation.mutate(
        { sessionId, sql },
        {
          onSuccess: () => {
            setModalCell(null);
            setModalAnchorEl(null);
            fetchData();
          },
          onError: (err) => setError(String(err)),
        },
      );
    },
    [
      modalCell,
      data,
      pkColumns,
      qualifiedName,
      sessionId,
      executeMutation,
      fetchData,
      buildWhereClause,
    ],
  );

  const handleRowContextMenu = useCallback(
    (e: React.MouseEvent, rowIndex: number) => {
      if (!data || pkColumns.length === 0) return;
      const target = e.target as HTMLElement;
      const td = target.closest("td");
      const tr = target.closest("tr");
      if (!td || !tr) return;
      const cellIndex = Array.from(tr.children).indexOf(td) - 1;
      const colName = data.columns[cellIndex]?.name;
      const cellValue = colName
        ? formatCell(data.rows[rowIndex]?.[colName])
        : "";

      const items: ContextMenuItem[] = [
        {
          key: "copy",
          label: "复制单元格",
          icon: <ClipboardCopy size={13} />,
          onClick: () => navigator.clipboard.writeText(cellValue),
          disabled: !colName,
        },
        ...(colName
          ? [
              {
                key: "edit",
                label: "编辑",
                icon: <Pencil size={13} />,
                onClick: () =>
                  startCellEdit(rowIndex, colName, td ?? undefined),
              },
            ]
          : []),
        { type: "divider" as const },
        {
          key: "delete",
          label: "删除行",
          icon: <Trash2 size={13} />,
          danger: true,
          onClick: () => handleDeleteRow(rowIndex),
        },
      ];
      openCtxMenu(e, items);
    },
    [data, pkColumns, startCellEdit, handleDeleteRow, openCtxMenu],
  );

  if (executeMutation.isPending && !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spin />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-500">
        <p className="mb-2">查询错误:</p>
        <pre className="whitespace-pre-wrap text-xs bg-red-50 dark:bg-red-900/20 p-2 rounded">
          {error}
        </pre>
        <Button size="small" className="mt-2" onClick={fetchData}>
          重试
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const hasPk = pkColumns.length > 0;
  const hasNextPage = data.rows.length === PAGE_SIZE;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle">
        <Button
          size="small"
          onClick={() => setInsertMode(!insertMode)}
          title="新增行"
        >
          <Plus className="h-3 w-3 mr-1" />
          新增
        </Button>
        <Button
          size="small"
          onClick={fetchData}
          loading={executeMutation.isPending}
          title="刷新"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>

        <div className="ml-auto flex items-center gap-2 text-xs text-fg-muted">
          <span>{data.rows.length} 行</span>
          <span>{data.elapsedMs.toFixed(1)} ms</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page === 0}
              className="p-0.5 rounded hover:bg-surface-overlay-hover disabled:opacity-30 cursor-pointer"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span>第 {page + 1} 页</span>
            <button
              type="button"
              disabled={!hasNextPage}
              className="p-0.5 rounded hover:bg-surface-overlay-hover disabled:opacity-30 cursor-pointer"
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto" ref={scrollRef}>
        <table
          className="w-full text-xs border-collapse"
          style={colWidths ? { tableLayout: "fixed" } : undefined}
        >
          {colWidths && (
            <colgroup>
              {colWidths.map((w, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: col elements are structural
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
          )}
          <thead ref={theadRef} className="sticky top-0 z-10">
            <tr className="bg-surface-overlay backdrop-blur-sm">
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border-base w-10">
                #
              </th>
              {data.columns.map((col) => (
                <th
                  key={col.name}
                  className="px-2 py-1.5 text-left border-b border-border-base whitespace-nowrap"
                >
                  <span
                    className={`text-[11px] font-semibold ${
                      pkColumns.includes(col.name)
                        ? "text-accent"
                        : "text-fg-primary"
                    }`}
                  >
                    {pkColumns.includes(col.name) && "🔑 "}
                    {col.name}
                  </span>
                  <span className="ml-1.5 text-[9px] font-normal text-fg-muted">
                    {columnTypeMap.get(col.name) ?? col.dataType}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {insertMode && (
              <InsertRow
                columns={data.columns}
                columnTypeMap={columnTypeMap}
                values={insertValues}
                onChange={setInsertValues}
                onSave={handleInsertRow}
                onCancel={() => {
                  setInsertMode(false);
                  setInsertValues({});
                }}
                isPending={executeMutation.isPending}
              />
            )}

            {virtualizer.getVirtualItems()[0]?.start > 0 && (
              <tr>
                <td
                  style={{
                    height: virtualizer.getVirtualItems()[0].start,
                    padding: 0,
                    border: "none",
                  }}
                />
              </tr>
            )}

            {virtualizer.getVirtualItems().map((vRow) => {
              const i = vRow.index;
              const row = data.rows[i];
              return (
                <tr
                  key={vRow.key}
                  data-index={i}
                  className="group hover:bg-accent-subtle border-b border-border-subtle"
                  onContextMenu={(e) => handleRowContextMenu(e, i)}
                >
                  <td className="px-2 py-1 text-fg-muted border-r border-border-subtle tabular-nums">
                    {page * PAGE_SIZE + i + 1}
                  </td>
                  {data.columns.map((col) => {
                    const isEditing =
                      editingCell?.row === i && editingCell.col === col.name;
                    const dataType =
                      columnTypeMap.get(col.name) ?? col.dataType;
                    return (
                      <td
                        key={col.name}
                        className={`px-2 py-1 border-r border-border-subtle max-w-[300px] ${
                          isEditing ? "bg-accent-subtle" : ""
                        }`}
                      >
                        {isEditing ? (
                          <CellEditor
                            value={editValue}
                            onChange={setEditValue}
                            dataType={dataType}
                            onSave={handleCellSave}
                            onCancel={() => setEditingCell(null)}
                          />
                        ) : (
                          // biome-ignore lint/a11y/noStaticElementInteractions: double-click to edit cell
                          <span
                            className={`truncate block whitespace-nowrap cursor-default ${
                              row[col.name] === null ||
                              row[col.name] === undefined
                                ? "text-fg-muted italic"
                                : "text-fg-primary"
                            }`}
                            title={formatCell(row[col.name])}
                            onDoubleClick={(e) => {
                              if (!hasPk) return;
                              const td = (e.target as HTMLElement).closest(
                                "td",
                              );
                              startCellEdit(i, col.name, td ?? undefined);
                            }}
                          >
                            {formatCell(row[col.name])}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {virtualizer.getTotalSize() -
              (virtualizer.getVirtualItems().at(-1)?.end ?? 0) >
              0 && (
              <tr>
                <td
                  style={{
                    height:
                      virtualizer.getTotalSize() -
                      (virtualizer.getVirtualItems().at(-1)?.end ?? 0),
                    padding: 0,
                    border: "none",
                  }}
                />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalCell && data && (
        <CellEditorFloating
          anchorEl={modalAnchorEl}
          value={editValue}
          dataType={
            columnTypeMap.get(modalCell.col) ??
            data.columns.find((c) => c.name === modalCell.col)?.dataType ??
            "text"
          }
          columnName={modalCell.col}
          onSave={handleModalSave}
          onCancel={() => {
            setModalCell(null);
            setModalAnchorEl(null);
          }}
        />
      )}

      {contextMenu}
    </div>
  );
}

function InsertRow({
  columns,
  columnTypeMap,
  values,
  onChange,
  onSave,
  onCancel,
  isPending,
}: {
  columns: ColumnInfo[];
  columnTypeMap: Map<string, string>;
  values: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  onSave: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <tr className="bg-green-50/50 dark:bg-green-900/10 border-b border-green-200 dark:border-green-800/30">
      <td className="px-2 py-1 text-green-600 border-r border-border-base font-medium">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="p-0.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 cursor-pointer"
            onClick={onSave}
            disabled={isPending}
            title="插入"
          >
            <Save className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="p-0.5 rounded hover:bg-surface-overlay-hover text-fg-secondary cursor-pointer"
            onClick={onCancel}
            title="取消"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </td>
      {columns.map((col) => (
        <td key={col.name} className="px-2 py-1 border-r border-border-subtle">
          <input
            className="w-full bg-transparent border-b border-green-400 outline-none text-xs py-0.5 text-fg-primary"
            value={values[col.name] ?? ""}
            onChange={(e) =>
              onChange({ ...values, [col.name]: e.target.value })
            }
            placeholder={columnTypeMap.get(col.name) ?? col.dataType}
          />
        </td>
      ))}
    </tr>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
