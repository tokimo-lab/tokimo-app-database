-- Create schema for database manager app
CREATE SCHEMA IF NOT EXISTS db_management;

SET search_path TO db_management, public;

CREATE TABLE IF NOT EXISTS db_connections (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver      TEXT NOT NULL,
    name        TEXT NOT NULL,
    host        TEXT NOT NULL,
    port        INTEGER,
    username    TEXT,
    password    TEXT,
    database    TEXT,
    params      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
