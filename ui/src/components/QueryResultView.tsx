/**
 * QueryResultView — displays SQL query results in a read-only table grid.
 * Uses virtual scrolling for large result sets.
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import { Spin } from "@tokimo/ui";
import { useLayoutEffect, useRef, useState } from "react";
import type { QueryResult } from "../types";

interface QueryResultViewProps {
  result: QueryResult;
  isPending: boolean;
}

const ROW_HEIGHT = 28;

export default function QueryResultView({
  result,
  isPending,
}: QueryResultViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const [colWidths, setColWidths] = useState<number[] | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset on result change
  useLayoutEffect(() => {
    setColWidths(null);
  }, [result]);

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
    count: result.rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spin />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 text-[11px] text-fg-secondary border-b border-border-subtle flex gap-4">
        <span>{result.rows.length} 行</span>
        <span>{result.columns.length} 列</span>
        <span>{result.elapsedMs.toFixed(1)} ms</span>
        {result.rowsAffected > 0 && <span>影响 {result.rowsAffected} 行</span>}
        {result.truncated && <span className="text-amber-500">结果已截断</span>}
      </div>

      <div className="flex-1 overflow-auto" ref={scrollRef}>
        {result.columns.length > 0 ? (
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
              <tr className="bg-surface-glass backdrop-blur-sm">
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border-base w-10">
                  #
                </th>
                {result.columns.map((col) => (
                  <th
                    key={col.name}
                    className="px-2 py-1.5 text-left border-b border-border-base whitespace-nowrap"
                  >
                    <span className="text-[11px] font-semibold text-fg-primary">
                      {col.name}
                    </span>
                    <span className="ml-1.5 text-[9px] font-normal text-fg-muted">
                      {col.dataType}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
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
                const row = result.rows[i];
                return (
                  <tr
                    key={vRow.key}
                    data-index={i}
                    className="hover:bg-accent-subtle border-b border-border-subtle"
                  >
                    <td className="px-2 py-1 text-fg-muted border-r border-border-base tabular-nums">
                      {i + 1}
                    </td>
                    {result.columns.map((col) => {
                      const val = row[col.name];
                      return (
                        <td
                          key={col.name}
                          className={`px-2 py-1 border-r border-border-subtle max-w-[300px] truncate whitespace-nowrap ${
                            val === null || val === undefined
                              ? "text-fg-muted italic"
                              : "text-fg-primary"
                          }`}
                          title={formatCellValue(val)}
                        >
                          {formatCellValue(val)}
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
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-fg-muted">
            查询已执行，影响 {result.rowsAffected} 行
          </div>
        )}
      </div>
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
