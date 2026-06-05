/**
 * CellEditor — type-aware inline and floating cell editor.
 * Simplified: uses textarea instead of Monaco for JSON/text types.
 */

import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
} from "@floating-ui/react";
import { Select } from "@tokimo/ui";
import { Save, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const JSON_TYPES = new Set(["json", "jsonb"]);
const TEXT_TYPES = new Set([
  "text",
  "varchar",
  "character varying",
  "char",
  "bpchar",
  "citext",
]);
const BOOL_TYPES = new Set(["bool", "boolean"]);

export function getEditorKind(
  dataType: string,
): "json" | "text" | "bool" | "input" {
  const dt = dataType.toLowerCase();
  if (JSON_TYPES.has(dt)) return "json";
  if (BOOL_TYPES.has(dt)) return "bool";
  if (TEXT_TYPES.has(dt)) return "text";
  return "input";
}

export function needsModalEditor(dataType: string): boolean {
  const kind = getEditorKind(dataType);
  return kind === "json" || kind === "text";
}

// ── Inline Editor ──

interface CellEditorProps {
  value: string;
  onChange: (v: string) => void;
  dataType: string;
  onSave: () => void;
  onCancel: () => void;
}

export default function CellEditor({
  value,
  onChange,
  dataType,
  onSave,
  onCancel,
}: CellEditorProps) {
  const kind = getEditorKind(dataType);
  return (
    <div className="flex items-center gap-0.5 h-[20px]">
      {kind === "bool" ? (
        <Select
          size="small"
          value={value}
          onChange={(v) => onChange(v as string)}
          options={[
            { label: "true", value: "true" },
            { label: "false", value: "false" },
            { label: "NULL", value: "NULL" },
          ]}
        />
      ) : (
        <input
          className="flex-1 bg-transparent border border-accent/40 rounded text-xs px-1.5 h-[20px] outline-none text-fg-primary"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) onSave();
            if (e.key === "Escape") onCancel();
          }}
          // biome-ignore lint/a11y/noAutofocus: cell editor should autofocus
          autoFocus
        />
      )}
      <button
        type="button"
        className="p-0.5 rounded bg-accent hover:bg-accent-hover text-white transition-colors cursor-pointer"
        onClick={onSave}
        title="保存"
      >
        <Save className="h-3 w-3" />
      </button>
      <button
        type="button"
        className="p-0.5 rounded bg-surface-overlay hover:bg-surface-overlay-hover text-fg-secondary transition-colors cursor-pointer"
        onClick={onCancel}
        title="取消"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── Floating Editor ──

interface CellEditorFloatingProps {
  anchorEl: HTMLElement | null;
  value: string;
  dataType: string;
  columnName: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}

export function CellEditorFloating({
  anchorEl,
  value,
  dataType,
  columnName,
  onSave,
  onCancel,
}: CellEditorFloatingProps) {
  const [localValue, setLocalValue] = useState(value);
  const kind = getEditorKind(dataType);
  const panelRef = useRef<HTMLDivElement>(null);
  const floatingWidth = kind === "json" ? 560 : 440;

  const { refs, floatingStyles } = useFloating({
    open: true,
    placement: "bottom-start",
    elements: { reference: anchorEl },
    middleware: [
      offset(4),
      flip({ fallbackPlacements: ["top-start", "bottom-end", "top-end"] }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            maxHeight: `${Math.max(200, availableHeight)}px`,
          });
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const prevAnchor = useRef(anchorEl);
  useLayoutEffect(() => {
    if (anchorEl && anchorEl !== prevAnchor.current) {
      setLocalValue(value);
    }
    prevAnchor.current = anchorEl;
  }, [anchorEl, value]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        anchorEl &&
        !anchorEl.contains(e.target as Node)
      ) {
        onCancel();
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [anchorEl, onCancel]);

  if (!anchorEl) return null;

  return createPortal(
    <div
      ref={(node) => {
        refs.setFloating(node);
        (panelRef as React.MutableRefObject<HTMLDivElement | null>).current =
          node;
      }}
      style={{ ...floatingStyles, width: floatingWidth }}
      className="z-[999] rounded-lg border border-border-base shadow-[0_8px_32px_rgba(0,0,0,0.3)] bg-surface-raised"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <span className="text-xs font-medium text-fg-secondary truncate">
          {columnName} <span className="text-fg-muted">({dataType})</span>
        </span>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-accent hover:bg-accent-hover text-white transition-colors cursor-pointer"
            onClick={() => onSave(localValue)}
          >
            <Save className="h-3 w-3" />
            保存
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-surface-overlay hover:bg-surface-overlay-hover text-fg-secondary transition-colors cursor-pointer"
            onClick={onCancel}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="p-1">
        <textarea
          className="w-full min-h-[160px] max-h-[360px] bg-transparent border border-border-subtle rounded text-xs font-mono p-3 outline-none resize-y text-fg-primary focus:ring-1 focus:ring-accent/40"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          // biome-ignore lint/a11y/noAutofocus: floating editor should autofocus
          autoFocus
        />
      </div>
    </div>,
    document.body,
  );
}
