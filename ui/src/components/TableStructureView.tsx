/**
 * TableStructureView — shows table columns, indexes, and foreign keys.
 */

import { Spin } from "@tokimo/ui";
import { useDescribeTable } from "../api";

interface Props {
  sessionId: string;
  table: string;
  schema?: string;
}

export default function TableStructureView({
  sessionId,
  table,
  schema,
}: Props) {
  const detailQuery = useDescribeTable(sessionId, table, schema);

  if (detailQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spin />
      </div>
    );
  }

  if (detailQuery.error) {
    return (
      <div className="p-4 text-sm text-red-500">
        加载表结构失败: {String(detailQuery.error)}
      </div>
    );
  }

  const detail = detailQuery.data;
  if (!detail) return null;

  return (
    <div className="h-full overflow-y-auto p-3 space-y-4 text-xs">
      <div className="flex gap-4 text-fg-secondary">
        <span>
          类型: <strong>{detail.kind}</strong>
        </span>
        {detail.estimatedRows != null && (
          <span>行数: ~{detail.estimatedRows.toLocaleString()}</span>
        )}
        {detail.sizeBytes != null && (
          <span>大小: {formatBytes(detail.sizeBytes)}</span>
        )}
        {detail.comment && <span>备注: {detail.comment}</span>}
      </div>

      <section>
        <h3 className="text-sm font-medium text-fg-primary mb-2">
          列 ({detail.columns.length})
        </h3>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface-glass backdrop-blur-sm">
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border-base">
                #
              </th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border-base">
                列名
              </th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border-base">
                类型
              </th>
              <th className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border-base">
                可空
              </th>
              <th className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border-base">
                主键
              </th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border-base">
                默认值
              </th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border-base">
                备注
              </th>
            </tr>
          </thead>
          <tbody>
            {detail.columns.map((col) => (
              <tr
                key={col.name}
                className="border-b border-border-subtle hover:bg-accent-subtle"
              >
                <td className="px-2 py-1 text-fg-muted">{col.ordinal}</td>
                <td
                  className={`px-2 py-1 font-mono ${
                    col.isPrimaryKey
                      ? "text-accent font-medium"
                      : "text-fg-primary"
                  }`}
                >
                  {col.isPrimaryKey && "🔑 "}
                  {col.name}
                </td>
                <td className="px-2 py-1 text-fg-secondary font-mono">
                  {col.dataType}
                  {col.maxLength != null && `(${col.maxLength})`}
                </td>
                <td className="px-2 py-1 text-center">
                  {col.isNullable ? (
                    <span className="text-amber-500">YES</span>
                  ) : (
                    <span className="text-fg-muted">NO</span>
                  )}
                </td>
                <td className="px-2 py-1 text-center">
                  {col.isPrimaryKey ? (
                    <span className="text-accent">PK</span>
                  ) : (
                    <span className="text-fg-muted">-</span>
                  )}
                </td>
                <td className="px-2 py-1 text-fg-secondary font-mono truncate max-w-[200px]">
                  {col.defaultValue ?? "-"}
                </td>
                <td className="px-2 py-1 text-fg-secondary truncate max-w-[200px]">
                  {col.comment ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {detail.indexes.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-fg-primary mb-2">
            索引 ({detail.indexes.length})
          </h3>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-glass backdrop-blur-sm">
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border-base">
                  名称
                </th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border-base">
                  列
                </th>
                <th className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border-base">
                  唯一
                </th>
                <th className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border-base">
                  主键
                </th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border-base">
                  类型
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.indexes.map((idx) => (
                <tr key={idx.name} className="border-b border-border-subtle">
                  <td className="px-2 py-1 text-fg-primary font-mono">
                    {idx.name}
                  </td>
                  <td className="px-2 py-1 text-fg-secondary font-mono">
                    {idx.columns.join(", ")}
                  </td>
                  <td className="px-2 py-1 text-center">
                    {idx.isUnique ? "✓" : "-"}
                  </td>
                  <td className="px-2 py-1 text-center">
                    {idx.isPrimary ? "PK" : "-"}
                  </td>
                  <td className="px-2 py-1 text-fg-secondary">
                    {idx.indexType ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {detail.foreignKeys.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-fg-primary mb-2">
            外键 ({detail.foreignKeys.length})
          </h3>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-glass backdrop-blur-sm">
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border-base">
                  名称
                </th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border-base">
                  列
                </th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border-base">
                  引用表
                </th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border-base">
                  引用列
                </th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border-base">
                  删除规则
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.foreignKeys.map((fk) => (
                <tr key={fk.name} className="border-b border-border-subtle">
                  <td className="px-2 py-1 text-fg-primary font-mono">
                    {fk.name}
                  </td>
                  <td className="px-2 py-1 text-fg-secondary font-mono">
                    {fk.columns.join(", ")}
                  </td>
                  <td className="px-2 py-1 text-fg-secondary font-mono">
                    {fk.referencedSchema ? `${fk.referencedSchema}.` : ""}
                    {fk.referencedTable}
                  </td>
                  <td className="px-2 py-1 text-fg-secondary font-mono">
                    {fk.referencedColumns.join(", ")}
                  </td>
                  <td className="px-2 py-1 text-fg-secondary">
                    {fk.onDelete ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {detail.createSql && (
        <section>
          <h3 className="text-sm font-medium text-fg-primary mb-2">建表 SQL</h3>
          <pre className="whitespace-pre-wrap text-[11px] font-mono bg-surface-glass p-3 rounded-lg border border-border-base text-fg-primary overflow-x-auto">
            {detail.createSql}
          </pre>
        </section>
      )}
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
