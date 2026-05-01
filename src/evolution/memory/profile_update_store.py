from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List

from src.utils.config_loader import ConfigLoader


class PostgresProfileUpdateRepository:
    """PostgreSQL-backed repository for evolution profile hot-update audit logs."""

    def __init__(self):
        cfg = ConfigLoader.reload()
        enabled_cfg = cfg.get("evolution.profile_update_store.enabled", None)
        if enabled_cfg is None:
            enabled_cfg = cfg.get("evolution.gene_run_store.enabled", False)
        self.enabled = bool(enabled_cfg)
        self.host = str(cfg.get("data_provider.postgres_host", "127.0.0.1") or "127.0.0.1").strip()
        self.port = int(cfg.get("data_provider.postgres_port", 5432) or 5432)
        self.user = str(cfg.get("data_provider.postgres_user", "") or "").strip()
        self.password = str(cfg.get("data_provider.postgres_password", "") or "").strip()
        self.database = str(cfg.get("data_provider.postgres_database", "") or "").strip()
        self.schema = str(cfg.get("data_provider.postgres_schema", "public") or "public").strip() or "public"
        self.table = str(cfg.get("evolution.profile_update_store.table", "evolution_profile_updates") or "evolution_profile_updates").strip()
        self.last_error = ""
        self._schema_ready = False

    def ensure_schema(self) -> None:
        if not self.enabled or self._schema_ready:
            return
        conn = self._connect()
        if conn is None:
            return
        try:
            with conn.cursor() as cursor:
                for statement in self._build_ddl():
                    cursor.execute(statement)
            conn.commit()
            self._schema_ready = True
        except Exception as exc:
            self.last_error = f"ensure_schema_failed: {exc}"
            try:
                conn.rollback()
            except Exception:
                pass
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def append_update(self, payload: Dict[str, Any]) -> None:
        if not self.enabled:
            return
        self.ensure_schema()
        if not self._schema_ready:
            return
        row = self._normalize_payload(payload)
        if not row.get("updated_at"):
            return
        conn = self._connect()
        if conn is None:
            return
        sql = (
            f"INSERT INTO {self._qualified_table()} "
            "(updated_at, updated_by, source, running, patch, before_profile, after_profile, created_at) "
            "VALUES (%s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s)"
        )
        params = (
            row["updated_at"],
            row["updated_by"],
            row["source"],
            row["running"],
            json.dumps(row["patch"], ensure_ascii=False),
            json.dumps(row["before"], ensure_ascii=False),
            json.dumps(row["after"], ensure_ascii=False),
            row["created_at"],
        )
        self._execute_write(conn=conn, sql=sql, params=params, action="append_update")

    def query_updates(self, limit: int = 30) -> Dict[str, Any]:
        options_limit = max(1, min(int(limit or 30), 200))
        if not self.enabled:
            return {"rows": [], "count": 0, "enabled": False, "error": ""}
        self.ensure_schema()
        if not self._schema_ready:
            return {"rows": [], "count": 0, "enabled": True, "error": str(self.last_error or "")}
        conn = self._connect()
        if conn is None:
            return {"rows": [], "count": 0, "enabled": True, "error": str(self.last_error or "")}
        sql = (
            f"SELECT updated_at, updated_by, source, running, patch, before_profile, after_profile, created_at "
            f"FROM {self._qualified_table()} ORDER BY updated_at DESC, created_at DESC LIMIT %s"
        )
        rows: List[Dict[str, Any]] = []
        try:
            with conn.cursor() as cursor:
                cursor.execute(sql, (options_limit,))
                result_rows = cursor.fetchall() or []
                col_names = [str(desc[0] or "") for desc in (cursor.description or [])]
                rows = [self._row_to_dict(col_names, item) for item in result_rows]
        except Exception as exc:
            self.last_error = f"query_updates_failed: {exc}"
            rows = []
        finally:
            try:
                conn.close()
            except Exception:
                pass
        return {"rows": rows, "count": len(rows), "enabled": True, "error": str(self.last_error or "")}

    def _normalize_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        data = payload if isinstance(payload, dict) else {}
        now = datetime.now(timezone.utc)
        updated_at = self._parse_iso_datetime(str(data.get("time", "") or "").strip()) or now
        patch = data.get("patch", {}) if isinstance(data.get("patch"), dict) else {}
        before = data.get("before", {}) if isinstance(data.get("before"), dict) else {}
        after = data.get("after", {}) if isinstance(data.get("after"), dict) else {}
        return {
            "updated_at": updated_at,
            "updated_by": str(data.get("updated_by", "") or "").strip(),
            "source": str(data.get("source", "") or "").strip(),
            "running": bool(data.get("running", False)),
            "patch": dict(patch),
            "before": dict(before),
            "after": dict(after),
            "created_at": now,
        }

    def _row_to_dict(self, col_names: List[str], row: Any) -> Dict[str, Any]:
        out: Dict[str, Any] = {}
        values = list(row) if isinstance(row, (list, tuple)) else []
        for idx, name in enumerate(col_names):
            key = str(name or "").strip()
            value = values[idx] if idx < len(values) else None
            out[key] = self._normalize_cell_value(value)
        if isinstance(out.get("before_profile"), dict):
            out["before"] = out.pop("before_profile")
        else:
            out["before"] = {}
            out.pop("before_profile", None)
        if isinstance(out.get("after_profile"), dict):
            out["after"] = out.pop("after_profile")
        else:
            out["after"] = {}
            out.pop("after_profile", None)
        out["patch"] = out.get("patch", {}) if isinstance(out.get("patch"), dict) else {}
        out["time"] = str(out.get("updated_at", "") or "")
        return out

    def _execute_write(self, conn, sql: str, params: tuple, action: str) -> None:
        try:
            with conn.cursor() as cursor:
                cursor.execute(sql, params)
            conn.commit()
        except Exception as exc:
            self.last_error = f"{action}_failed: {exc}"
            try:
                conn.rollback()
            except Exception:
                pass
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def _connect(self):
        try:
            import psycopg2
        except Exception as exc:
            self.last_error = f"psycopg2_import_failed: {exc}"
            return None
        try:
            return psycopg2.connect(
                host=self.host,
                port=self.port,
                user=self.user,
                password=self.password,
                dbname=self.database,
            )
        except Exception as exc:
            self.last_error = f"postgres_connect_failed: {exc}"
            return None

    def _qualified_table(self) -> str:
        return f"\"{self.schema}\".\"{self.table}\""

    def _build_ddl(self) -> List[str]:
        table = self._qualified_table()
        return [
            f"""
            CREATE TABLE IF NOT EXISTS {table} (
                id BIGSERIAL PRIMARY KEY,
                updated_at TIMESTAMPTZ NOT NULL,
                updated_by TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL DEFAULT '',
                running BOOLEAN NOT NULL DEFAULT FALSE,
                patch JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                before_profile JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                after_profile JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """,
            f"CREATE INDEX IF NOT EXISTS idx_epu_updated_at ON {table} (updated_at DESC)",
            f"CREATE INDEX IF NOT EXISTS idx_epu_source ON {table} (source)",
            f"CREATE INDEX IF NOT EXISTS idx_epu_updated_by ON {table} (updated_by)",
        ]

    def _normalize_cell_value(self, value: Any) -> Any:
        if isinstance(value, datetime):
            return value.isoformat(timespec="seconds")
        if isinstance(value, (dict, list)):
            return value
        return value

    def _parse_iso_datetime(self, text: str):
        raw = str(text or "").strip()
        if not raw:
            return None
        try:
            value = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except Exception:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
