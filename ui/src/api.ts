/**
 * API client for the database sidecar.
 * All calls go to /api/apps/database/* via fetch + TanStack Query hooks.
 */

import {
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  ActiveQuery,
  AnysqlConnectInput,
  DatabaseEntry,
  DatabaseOverview,
  DbSessionDto,
  ExecuteSqlInput,
  KillQueryRequest,
  QueryResult,
  RoutineEntry,
  SchemaEntry,
  ServerVariable,
  TableDetail,
  TableEntry,
  TriggerEntry,
} from "./types";

const BASE = "/api/apps/database";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(body || `HTTP ${res.status}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return {} as T;
  }
  return res.json() as Promise<T>;
}

// ── Sessions ──

export const dbApi = {
  listSessions: () => apiFetch<DbSessionDto[]>("/sessions"),
  getSession: (id: string) => apiFetch<DbSessionDto>(`/sessions/${id}`),
  connect: (body: AnysqlConnectInput) =>
    apiFetch<DbSessionDto>("/sessions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  disconnect: (id: string) =>
    apiFetch<void>(`/sessions/${id}/disconnect`, { method: "POST" }),
  deleteConnection: (id: string) =>
    apiFetch<void>(`/sessions/${id}`, { method: "DELETE" }),
  testConnection: (body: AnysqlConnectInput) =>
    apiFetch<DatabaseOverview>("/test", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // SQL
  executeSql: (body: ExecuteSqlInput) =>
    apiFetch<QueryResult>(`/sessions/${body.sessionId}/execute`, {
      method: "POST",
      body: JSON.stringify({ sql: body.sql, maxRows: body.maxRows ?? 1000 }),
    }),

  // Schema browsing
  overview: (sessionId: string) =>
    apiFetch<DatabaseOverview>(`/sessions/${sessionId}/overview`),
  listDatabases: (sessionId: string) =>
    apiFetch<DatabaseEntry[]>(`/sessions/${sessionId}/databases`),
  listSchemas: (sessionId: string) =>
    apiFetch<SchemaEntry[]>(`/sessions/${sessionId}/schemas`),
  listTables: (sessionId: string, schema?: string | null) =>
    apiFetch<TableEntry[]>(
      `/sessions/${sessionId}/tables${schema ? `?schema=${encodeURIComponent(schema)}` : ""}`,
    ),
  describeTable: (sessionId: string, table: string, schema?: string | null) =>
    apiFetch<TableDetail>(
      `/sessions/${sessionId}/table?table=${encodeURIComponent(table)}${schema ? `&schema=${encodeURIComponent(schema)}` : ""}`,
    ),

  // Operations
  listRoutines: (sessionId: string, schema?: string | null) =>
    apiFetch<RoutineEntry[]>(
      `/sessions/${sessionId}/routines${schema ? `?schema=${encodeURIComponent(schema)}` : ""}`,
    ),
  listTriggers: (sessionId: string, schema?: string | null) =>
    apiFetch<TriggerEntry[]>(
      `/sessions/${sessionId}/triggers${schema ? `?schema=${encodeURIComponent(schema)}` : ""}`,
    ),
  listActiveQueries: (sessionId: string) =>
    apiFetch<ActiveQuery[]>(`/sessions/${sessionId}/active-queries`),
  killQuery: (sessionId: string, pid: string) =>
    apiFetch<void>(`/sessions/${sessionId}/kill-query`, {
      method: "POST",
      body: JSON.stringify({ pid } satisfies KillQueryRequest),
    }),
  listVariables: (sessionId: string, filter?: string | null) =>
    apiFetch<ServerVariable[]>(
      `/sessions/${sessionId}/variables${filter ? `?filter=${encodeURIComponent(filter)}` : ""}`,
    ),
  switchDatabase: (sessionId: string, database: string) =>
    apiFetch<void>(`/sessions/${sessionId}/switch-db`, {
      method: "POST",
      body: JSON.stringify({ database }),
    }),
};

// ── React Query hooks ──

export function useListSessions(
  opts?: Partial<UseQueryOptions<DbSessionDto[]>>,
) {
  return useQuery<DbSessionDto[]>({
    queryKey: ["sessions"],
    queryFn: dbApi.listSessions,
    ...opts,
  });
}

export function useGetSession(
  id: string,
  opts?: Partial<UseQueryOptions<DbSessionDto>>,
) {
  return useQuery<DbSessionDto>({
    queryKey: ["session", id],
    queryFn: () => dbApi.getSession(id),
    enabled: !!id,
    ...opts,
  });
}

export function useOverview(
  sessionId: string,
  opts?: Partial<UseQueryOptions<DatabaseOverview>>,
) {
  return useQuery<DatabaseOverview>({
    queryKey: ["overview", sessionId],
    queryFn: () => dbApi.overview(sessionId),
    enabled: !!sessionId,
    ...opts,
  });
}

export function useListDatabases(
  sessionId: string,
  opts?: Partial<UseQueryOptions<DatabaseEntry[]>>,
) {
  return useQuery<DatabaseEntry[]>({
    queryKey: ["databases", sessionId],
    queryFn: () => dbApi.listDatabases(sessionId),
    enabled: !!sessionId,
    ...opts,
  });
}

export function useListSchemas(
  sessionId: string,
  opts?: Partial<UseQueryOptions<SchemaEntry[]>>,
) {
  return useQuery<SchemaEntry[]>({
    queryKey: ["schemas", sessionId],
    queryFn: () => dbApi.listSchemas(sessionId),
    enabled: !!sessionId,
    ...opts,
  });
}

export function useListTables(
  sessionId: string,
  schema?: string | null,
  opts?: Partial<UseQueryOptions<TableEntry[]>>,
) {
  return useQuery<TableEntry[]>({
    queryKey: ["tables", sessionId, schema],
    queryFn: () => dbApi.listTables(sessionId, schema),
    enabled: !!sessionId,
    ...opts,
  });
}

export function useDescribeTable(
  sessionId: string,
  table: string,
  schema?: string | null,
  opts?: Partial<UseQueryOptions<TableDetail>>,
) {
  return useQuery<TableDetail>({
    queryKey: ["table-detail", sessionId, table, schema],
    queryFn: () => dbApi.describeTable(sessionId, table, schema),
    enabled: !!sessionId && !!table,
    ...opts,
  });
}

export function useExecuteSql(
  opts?: UseMutationOptions<QueryResult, Error, ExecuteSqlInput>,
) {
  return useMutation<QueryResult, Error, ExecuteSqlInput>({
    mutationFn: dbApi.executeSql,
    ...opts,
  });
}

export function useConnectSession(
  opts?: UseMutationOptions<DbSessionDto, Error, AnysqlConnectInput>,
) {
  const qc = useQueryClient();
  return useMutation<DbSessionDto, Error, AnysqlConnectInput>({
    mutationFn: dbApi.connect,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
    ...opts,
  });
}

export function useDeleteConnection(
  opts?: UseMutationOptions<void, Error, string>,
) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: dbApi.deleteConnection,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
    ...opts,
  });
}

export function useSwitchDatabase(
  opts?: UseMutationOptions<
    void,
    Error,
    { sessionId: string; database: string }
  >,
) {
  return useMutation<void, Error, { sessionId: string; database: string }>({
    mutationFn: ({ sessionId, database }) =>
      dbApi.switchDatabase(sessionId, database),
    ...opts,
  });
}

export function useTestConnection(
  opts?: UseMutationOptions<DatabaseOverview, Error, AnysqlConnectInput>,
) {
  return useMutation<DatabaseOverview, Error, AnysqlConnectInput>({
    mutationFn: dbApi.testConnection,
    ...opts,
  });
}

export function useListRoutines(
  sessionId: string,
  schema?: string | null,
  opts?: Partial<UseQueryOptions<RoutineEntry[]>>,
) {
  return useQuery<RoutineEntry[]>({
    queryKey: ["routines", sessionId, schema],
    queryFn: () => dbApi.listRoutines(sessionId, schema),
    enabled: !!sessionId,
    ...opts,
  });
}

export function useListTriggers(
  sessionId: string,
  schema?: string | null,
  opts?: Partial<UseQueryOptions<TriggerEntry[]>>,
) {
  return useQuery<TriggerEntry[]>({
    queryKey: ["triggers", sessionId, schema],
    queryFn: () => dbApi.listTriggers(sessionId, schema),
    enabled: !!sessionId,
    ...opts,
  });
}

export function useListActiveQueries(
  sessionId: string,
  opts?: Partial<UseQueryOptions<ActiveQuery[]>>,
) {
  return useQuery<ActiveQuery[]>({
    queryKey: ["active-queries", sessionId],
    queryFn: () => dbApi.listActiveQueries(sessionId),
    enabled: !!sessionId,
    ...opts,
  });
}

export function useKillQuery(
  opts?: UseMutationOptions<void, Error, { sessionId: string; pid: string }>,
) {
  return useMutation<void, Error, { sessionId: string; pid: string }>({
    mutationFn: ({ sessionId, pid }) => dbApi.killQuery(sessionId, pid),
    ...opts,
  });
}

export function useListVariables(
  sessionId: string,
  filter?: string | null,
  opts?: Partial<UseQueryOptions<ServerVariable[]>>,
) {
  return useQuery<ServerVariable[]>({
    queryKey: ["variables", sessionId, filter],
    queryFn: () => dbApi.listVariables(sessionId, filter),
    enabled: !!sessionId,
    ...opts,
  });
}
