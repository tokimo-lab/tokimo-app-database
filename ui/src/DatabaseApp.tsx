/**
 * DatabaseApp — main page for the database sidecar app.
 *
 * Left sidebar: list of saved connections.
 * Right area: DatabaseBrowserWindow (inline, visibility-toggled).
 * "+ 新建连接" opens an inline modal with DatabaseConnectionForm.
 *
 * No @/system imports — self-contained sidecar page.
 */

import type { AppRuntimeCtx } from "@tokimo/sdk";
import {
  AppSetupGuide,
  AppSidebar,
  type AppSidebarItem,
  type ContextMenuItem,
  Modal,
  Spin,
  useContextMenu,
} from "@tokimo/ui";
import {
  Columns3,
  Copy,
  Database,
  Pencil,
  Plus,
  Power,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import {
  useConnectSession,
  useDeleteConnection,
  useListSessions,
  useTestConnection,
} from "./api";
import DatabaseConnectionForm from "./components/DatabaseConnectionForm";
import type { AnysqlConnectInput, DbSessionDto } from "./types";

const DatabaseBrowserWindow = lazy(
  () => import("./components/DatabaseBrowserWindow"),
);

const DRIVER_ICON: Record<string, string> = {
  postgres: "🐘",
  mysql: "🐬",
  sqlite: "📁",
};

type ModalMode =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; session: DbSessionDto }
  | { kind: "duplicate"; session: DbSessionDto };

export default function DatabaseApp({ ctx: _ctx }: { ctx: AppRuntimeCtx }) {
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalMode>({ kind: "none" });
  const { open: openCtxMenu, contextMenu } = useContextMenu();

  const sessionsQuery = useListSessions();
  const sessions = sessionsQuery.data ?? [];

  const connectMutation = useConnectSession();
  const testMutation = useTestConnection();
  const deleteMutation = useDeleteConnection();

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setActiveIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const handleConnect = useCallback(
    (input: AnysqlConnectInput) => {
      connectMutation.mutate(input, {
        onSuccess: (session) => {
          sessionsQuery.refetch();
          setModal({ kind: "none" });
          // Only auto-select on create (not edit)
          if (!input.savedId) handleSelect(session.id);
        },
      });
    },
    [connectMutation, sessionsQuery, handleSelect],
  );

  // Edit = reconnect with savedId
  const handleUpdate = useCallback(
    (session: DbSessionDto, input: AnysqlConnectInput) => {
      handleConnect({ ...input, savedId: session.id });
    },
    [handleConnect],
  );

  const handleDelete = useCallback(
    (s: DbSessionDto) => {
      Modal.confirm({
        title: "删除连接",
        content: `确定要删除「${s.config.name}」吗？`,
        okText: "删除",
        variant: "danger",
        cancelText: "取消",
        onOk: () => {
          setActiveIds((prev) => prev.filter((id) => id !== s.id));
          if (selectedId === s.id) setSelectedId(null);
          return deleteMutation.mutateAsync(s.id).then(() => {
            sessionsQuery.refetch();
          });
        },
      });
    },
    [deleteMutation, sessionsQuery, selectedId],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, s: DbSessionDto) => {
      const items: ContextMenuItem[] = [
        {
          key: "edit",
          label: "编辑",
          icon: <Pencil size={13} />,
          onClick: () => setModal({ kind: "edit", session: s }),
        },
        {
          key: "duplicate",
          label: "复制",
          icon: <Copy size={13} />,
          onClick: () => setModal({ kind: "duplicate", session: s }),
        },
        {
          key: "connect",
          label: "重新连接",
          icon: <Power size={13} />,
          onClick: () => handleSelect(s.id),
        },
        { type: "divider" },
        {
          key: "delete",
          label: "删除",
          icon: <Trash2 size={13} />,
          danger: true,
          onClick: () => handleDelete(s),
        },
      ];
      openCtxMenu(e, items);
    },
    [openCtxMenu, handleDelete, handleSelect],
  );

  const sidebarItems: AppSidebarItem[] = useMemo(
    () =>
      sessions.map((s) => ({
        key: s.id,
        icon:
          DRIVER_ICON[s.config.driver] != null ? (
            <span className="text-xs leading-none shrink-0">
              {DRIVER_ICON[s.config.driver]}
            </span>
          ) : (
            <Database className="h-3.5 w-3.5 text-indigo-500" />
          ),
        label: s.config.name,
        subtitle: s.config.host
          ? `${s.config.host}:${s.config.port ?? ""}`
          : s.config.driver,
        onContextMenu: (e: React.MouseEvent) => handleContextMenu(e, s),
      })),
    [sessions, handleContextMenu],
  );

  // ── Modal form submit ──
  const handleFormSubmit = useCallback(
    (input: AnysqlConnectInput) => {
      if (modal.kind === "edit") {
        handleUpdate(modal.session, input);
      } else {
        handleConnect(input);
      }
    },
    [modal, handleUpdate, handleConnect],
  );

  const editingSession = modal.kind === "edit" ? modal.session : null;
  const duplicateDefaults =
    modal.kind === "duplicate" ? modal.session.config : undefined;

  // ── Setup guide (no sessions yet) ──
  if (!sessionsQuery.isLoading && sessions.length === 0) {
    return (
      <>
        <AppSetupGuide
          imageSrc="/page-icons/database.png"
          accentColor="indigo"
          title="开始使用 Database"
          description="连接多种数据库，浏览表结构，执行 SQL 查询"
          features={[
            { icon: TerminalSquare, label: "多引擎 SQL 执行" },
            { icon: Columns3, label: "可视化表结构" },
            { icon: Database, label: "支持 PostgreSQL、MySQL、SQLite 等" },
          ]}
          actionLabel="新建连接"
          actionIcon={Plus}
          onAction={() => setModal({ kind: "create" })}
        />
        {modal.kind !== "none" && (
          <ConnectionModal
            modal={modal}
            editingSession={editingSession}
            duplicateDefaults={duplicateDefaults}
            onSubmit={handleFormSubmit}
            onTest={(input) => testMutation.mutate(input)}
            onCancel={() => setModal({ kind: "none" })}
            isLoading={connectMutation.isPending}
            isTesting={testMutation.isPending}
          />
        )}
      </>
    );
  }

  return (
    <div className="relative flex h-full">
      {/* ── Left Sidebar ── */}
      <AppSidebar
        width={224}
        sections={[{ items: sidebarItems }]}
        activeKey={selectedId ?? undefined}
        onSelect={handleSelect}
        loading={sessionsQuery.isLoading}
        footer={
          <button
            type="button"
            className="w-full flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors cursor-pointer"
            onClick={() => setModal({ kind: "create" })}
          >
            <Plus className="h-3.5 w-3.5" />
            新建连接
          </button>
        }
      />

      {/* ── Right Content ── */}
      <div className="flex-1 min-w-0 relative">
        {!selectedId && (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-quaternary)] gap-2">
            <Database className="h-8 w-8" />
            <span className="text-sm">选择数据库或新建一个</span>
          </div>
        )}

        {activeIds.map((id) => (
          <div key={id} className={id === selectedId ? "h-full" : "hidden"}>
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Spin />
                </div>
              }
            >
              <DatabaseBrowserWindow sessionId={id} />
            </Suspense>
          </div>
        ))}
      </div>

      {/* ── Connection Modal ── */}
      {modal.kind !== "none" && (
        <ConnectionModal
          modal={modal}
          editingSession={editingSession}
          duplicateDefaults={duplicateDefaults}
          onSubmit={handleFormSubmit}
          onTest={(input) => testMutation.mutate(input)}
          onCancel={() => setModal({ kind: "none" })}
          isLoading={connectMutation.isPending}
          isTesting={testMutation.isPending}
        />
      )}

      {contextMenu}
    </div>
  );
}

function ConnectionModal({
  modal,
  editingSession,
  duplicateDefaults,
  onSubmit,
  onTest,
  onCancel,
  isLoading,
  isTesting,
}: {
  modal: ModalMode;
  editingSession: DbSessionDto | null;
  duplicateDefaults: AnysqlConnectInput | undefined;
  onSubmit: (input: AnysqlConnectInput) => void;
  onTest: (input: AnysqlConnectInput) => void;
  onCancel: () => void;
  isLoading: boolean;
  isTesting: boolean;
}) {
  const title =
    modal.kind === "edit"
      ? "编辑数据库连接"
      : modal.kind === "duplicate"
        ? "复制连接"
        : "新建数据库连接";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface-base border border-border-base rounded-xl shadow-2xl w-[520px] max-h-[80vh] overflow-y-auto p-6">
        <h2 className="text-base font-semibold text-fg-primary mb-4">
          {title}
        </h2>
        <DatabaseConnectionForm
          onSubmit={onSubmit}
          onTest={onTest}
          onCancel={onCancel}
          isLoading={isLoading}
          isTesting={isTesting}
          editingSession={editingSession}
          defaultValues={duplicateDefaults}
        />
      </div>
    </div>
  );
}
