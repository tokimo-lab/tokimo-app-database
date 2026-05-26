/**
 * Database connection form — create or test a new database connection.
 */

import { Button, Input, Select } from "@tokimo/ui";
import { type FormEvent, useState } from "react";
import type { AnysqlConnectInput, DbSessionDto } from "../types";

const DRIVER_OPTIONS = [
  { value: "postgres", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "mariadb", label: "MariaDB" },
  { value: "sqlite", label: "SQLite" },
  { value: "mssql", label: "SQL Server" },
  { value: "cockroachdb", label: "CockroachDB" },
  { value: "tidb", label: "TiDB" },
  { value: "clickhouse", label: "ClickHouse" },
  { value: "oracle", label: "Oracle" },
  { value: "mongodb", label: "MongoDB" },
  { value: "elasticsearch", label: "Elasticsearch" },
] as const;

interface DatabaseConnectionFormProps {
  onSubmit: (data: AnysqlConnectInput) => void;
  onTest?: (data: AnysqlConnectInput) => void;
  onCancel?: () => void;
  isLoading: boolean;
  isTesting?: boolean;
  editingSession?: DbSessionDto | null;
  defaultValues?: Partial<AnysqlConnectInput>;
}

export default function DatabaseConnectionForm({
  onSubmit,
  onTest,
  onCancel,
  isLoading,
  isTesting,
  editingSession,
  defaultValues,
}: DatabaseConnectionFormProps) {
  const cfg = editingSession?.config;
  const [driver, setDriver] = useState<AnysqlConnectInput["driver"]>(
    cfg?.driver ?? defaultValues?.driver ?? "postgres",
  );
  const [name, setName] = useState(cfg?.name ?? defaultValues?.name ?? "");
  const [host, setHost] = useState(cfg?.host ?? defaultValues?.host ?? "");
  const defaultPort = (d: string) =>
    d === "mysql" || d === "mariadb"
      ? 3306
      : d === "mssql"
        ? 1433
        : d === "tidb"
          ? 4000
          : d === "cockroachdb"
            ? 26257
            : d === "clickhouse"
              ? 8123
              : d === "oracle"
                ? 1521
                : d === "mongodb"
                  ? 27017
                  : d === "elasticsearch"
                    ? 9200
                    : 5432;
  const [port, setPort] = useState(
    String(cfg?.port ?? defaultValues?.port ?? defaultPort(driver)),
  );
  const [username, setUsername] = useState(
    cfg?.username ?? defaultValues?.username ?? "",
  );
  const [password, setPassword] = useState(
    cfg?.password ?? defaultValues?.password ?? "",
  );
  const [database, setDatabase] = useState(
    cfg?.database ?? defaultValues?.database ?? "",
  );
  const [params, setParams] = useState(
    cfg?.params ?? defaultValues?.params ?? "",
  );

  const isSqlite = driver === "sqlite";

  const buildInput = (): AnysqlConnectInput => ({
    driver,
    name: name || `${host}:${port}`,
    host,
    port: isSqlite ? undefined : Number(port) || undefined,
    username: isSqlite ? undefined : username || undefined,
    password: isSqlite ? undefined : password || undefined,
    database: database || undefined,
    params: params || undefined,
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(buildInput());
  };

  const handleDriverChange = (val: string) => {
    const d = val as AnysqlConnectInput["driver"];
    setDriver(d);
    const defaultPorts: Record<string, string> = {
      postgres: "5432",
      mysql: "3306",
      mariadb: "3306",
      mssql: "1433",
      cockroachdb: "26257",
      tidb: "4000",
      clickhouse: "8123",
      oracle: "1521",
      mongodb: "27017",
      elasticsearch: "9200",
    };
    const currentIsDefault = Object.values(defaultPorts).includes(port);
    if (currentIsDefault && defaultPorts[d]) {
      setPort(defaultPorts[d]);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-1">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-fg-muted">数据库类型</span>
        <Select
          value={driver}
          onChange={handleDriverChange}
          options={DRIVER_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-fg-muted">连接名称</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如: 生产数据库"
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 flex flex-col gap-1.5">
          <span className="text-xs text-fg-muted">
            {isSqlite ? "文件路径" : "主机"}
          </span>
          <Input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder={isSqlite ? "/path/to/db.sqlite" : "IP 或域名"}
            required
          />
        </div>
        {!isSqlite && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-fg-muted">端口</span>
            <Input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder={String(defaultPort(driver))}
              type="number"
            />
          </div>
        )}
      </div>

      {!isSqlite && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-fg-muted">用户名</span>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="用户名"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-fg-muted">密码</span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-fg-muted">数据库名</span>
        <Input
          value={database}
          onChange={(e) => setDatabase(e.target.value)}
          placeholder="默认数据库（可选）"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-fg-muted">额外参数</span>
        <Input
          value={params}
          onChange={(e) => setParams(e.target.value)}
          placeholder="例如: sslmode=require"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" onClick={onCancel}>
            取消
          </Button>
        )}
        {onTest && (
          <Button
            type="button"
            loading={isTesting}
            onClick={() => onTest(buildInput())}
          >
            测试连接
          </Button>
        )}
        <Button htmlType="submit" variant="primary" loading={isLoading}>
          保存
        </Button>
      </div>
    </form>
  );
}
