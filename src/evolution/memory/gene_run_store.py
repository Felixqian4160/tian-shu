from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Protocol

from src.evolution.core.event_bus import EventBus
from src.utils.config_loader import ConfigLoader


class GeneRunRepository(Protocol):
    """Repository protocol for persisting gene evolution runs."""

    def ensure_schema(self) -> None:
        """Create table/indexes if they do not exist."""

    def upsert_scored(self, payload: Dict[str, Any]) -> None:
        """Insert or update scored run payload."""

    def mark_committed(self, payload: Dict[str, Any]) -> None:
        """Update committed metadata for one run."""

    def query_runs(
        self,
        limit: int = 100,
        offset: int = 0,
        run_id: str = "",
        child_gene_id: str = "",
        status: str = "",
        parent_strategy_id: str = "",
        start_time: str = "",
        end_time: str = "",
    ) -> Dict[str, Any]:
        """Query persisted evolution runs for dashboard/filter use."""

    def query_family_stats(self, start_time: str = "", end_time: str = "") -> Dict[str, Any]:
        """Query aggregated performance stats grouped by strategy family."""


class PostgresGeneRunRepository:
    """PostgreSQL-backed repository for evolution run persistence."""

    def __init__(self):
        cfg = ConfigLoader.reload()
        self.enabled = bool(cfg.get("evolution.gene_run_store.enabled", False))
        self.host = str(cfg.get("data_provider.postgres_host", "127.0.0.1") or "127.0.0.1").strip()
        self.port = int(cfg.get("data_provider.postgres_port", 5432) or 5432)
        self.user = str(cfg.get("data_provider.postgres_user", "") or "").strip()
        self.password = str(cfg.get("data_provider.postgres_password", "") or "").strip()
        self.database = str(cfg.get("data_provider.postgres_database", "") or "").strip()
        self.schema = str(cfg.get("data_provider.postgres_schema", "public") or "public").strip() or "public"
        self.table = str(cfg.get("evolution.gene_run_store.table", "evolution_gene_runs") or "evolution_gene_runs").strip()
        self.last_error = ""
        self._schema_ready = False

    def ensure_schema(self) -> None:
        """Ensure table and indexes are present for current schema."""
        if not self.enabled or self._schema_ready:
            return
        conn = self._connect()
        if conn is None:
            return
        ddl = self._build_ddl()
        try:
            with conn.cursor() as cursor:
                for statement in ddl:
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

    def upsert_scored(self, payload: Dict[str, Any]) -> None:
        """Upsert scored/rejected record by run_id."""
        if not self.enabled:
            return
        self.ensure_schema()
        if not self._schema_ready:
            return
        row = self._normalize_scored_payload(payload)
        run_id = str(row.get("run_id", "") or "").strip()
        if not run_id:
            return
        conn = self._connect()
        if conn is None:
            return
        sql = (
            f"INSERT INTO {self._qualified_table()} "
            "(run_id, iteration, status, score, strategy_id, strategy_name, parent_strategy_id, parent_strategy_name, "
            "child_gene_id, child_gene_parent_ids, child_gene_fingerprint, child_gene_family, metrics, profile, strategy_code_sha256, created_at, updated_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s::jsonb, %s::jsonb, %s, %s, %s) "
            "ON CONFLICT (run_id) DO UPDATE SET "
            "iteration=EXCLUDED.iteration, status=EXCLUDED.status, score=EXCLUDED.score, "
            "strategy_id=EXCLUDED.strategy_id, strategy_name=EXCLUDED.strategy_name, "
            "parent_strategy_id=EXCLUDED.parent_strategy_id, parent_strategy_name=EXCLUDED.parent_strategy_name, "
            "child_gene_id=EXCLUDED.child_gene_id, child_gene_parent_ids=EXCLUDED.child_gene_parent_ids, "
            "child_gene_fingerprint=EXCLUDED.child_gene_fingerprint, child_gene_family=EXCLUDED.child_gene_family, "
            "metrics=EXCLUDED.metrics, profile=EXCLUDED.profile, "
            "strategy_code_sha256=EXCLUDED.strategy_code_sha256, updated_at=EXCLUDED.updated_at"
        )
        params = (
            row["run_id"],
            row["iteration"],
            row["status"],
            row["score"],
            row["strategy_id"],
            row["strategy_name"],
            row["parent_strategy_id"],
            row["parent_strategy_name"],
            row["child_gene_id"],
            json.dumps(row["child_gene_parent_ids"], ensure_ascii=False),
            row["child_gene_fingerprint"],
            row["child_gene_family"],
            json.dumps(row["metrics"], ensure_ascii=False),
            json.dumps(row["profile"], ensure_ascii=False),
            row["strategy_code_sha256"],
            row["created_at"],
            row["updated_at"],
        )
        self._execute_write(conn=conn, sql=sql, params=params, action="upsert_scored")

    def mark_committed(self, payload: Dict[str, Any]) -> None:
        """Mark committed strategy fields by run_id."""
        if not self.enabled:
            return
        self.ensure_schema()
        if not self._schema_ready:
            return
        run_id = str(payload.get("run_id", "") or "").strip()
        if not run_id:
            return
        conn = self._connect()
        if conn is None:
            return
        sql = (
            f"UPDATE {self._qualified_table()} "
            "SET committed_strategy_id=%s, committed_strategy_name=%s, committed_version=%s, committed_at=%s, updated_at=%s "
            "WHERE run_id=%s"
        )
        now = datetime.now(timezone.utc)
        params = (
            str(payload.get("strategy_id", "") or ""),
            str(payload.get("strategy_name", "") or ""),
            self._to_int(payload.get("version", 0)),
            now,
            now,
            run_id,
        )
        self._execute_write(conn=conn, sql=sql, params=params, action="mark_committed")

    def query_runs(
        self,
        limit: int = 100,
        offset: int = 0,
        run_id: str = "",
        child_gene_id: str = "",
        status: str = "",
        parent_strategy_id: str = "",
        start_time: str = "",
        end_time: str = "",
    ) -> Dict[str, Any]:
        """Query run records for evolution dashboard."""
        options = self._normalize_query_options(
            limit=limit,
            offset=offset,
            run_id=run_id,
            child_gene_id=child_gene_id,
            status=status,
            parent_strategy_id=parent_strategy_id,
            start_time=start_time,
            end_time=end_time,
        )
        # Return empty result when persistence is disabled to keep endpoint stable.
        if not self.enabled:
            return {
                "rows": [],
                "count": 0,
                "limit": options["limit"],
                "offset": options["offset"],
                "enabled": False,
                "error": "",
            }
        self.ensure_schema()
        if not self._schema_ready:
            return {
                "rows": [],
                "count": 0,
                "limit": options["limit"],
                "offset": options["offset"],
                "enabled": True,
                "error": str(self.last_error or ""),
            }
        conn = self._connect()
        if conn is None:
            return {
                "rows": [],
                "count": 0,
                "limit": options["limit"],
                "offset": options["offset"],
                "enabled": True,
                "error": str(self.last_error or ""),
            }
        where_sql, where_params = self._build_query_where(options)
        table = self._qualified_table()
        list_sql = (
            f"SELECT run_id, iteration, status, score, strategy_id, strategy_name, parent_strategy_id, parent_strategy_name, "
            f"child_gene_id, child_gene_parent_ids, child_gene_fingerprint, child_gene_family, metrics, profile, strategy_code_sha256, "
            f"committed_strategy_id, committed_strategy_name, committed_version, committed_at, created_at, updated_at "
            f"FROM {table} {where_sql} ORDER BY created_at DESC LIMIT %s OFFSET %s"
        )
        count_sql = f"SELECT COUNT(*) AS total FROM {table} {where_sql}"
        rows: List[Dict[str, Any]] = []
        total = 0
        try:
            with conn.cursor() as cursor:
                # Query total count for pagination metadata.
                cursor.execute(count_sql, tuple(where_params))
                count_row = cursor.fetchone()
                total = int((count_row or [0])[0] or 0)
                # Query page rows ordered by latest creation time.
                cursor.execute(
                    list_sql,
                    tuple(where_params + [options["limit"], options["offset"]]),
                )
                result_rows = cursor.fetchall() or []
                col_names = [str(desc[0] or "") for desc in (cursor.description or [])]
                rows = [self._row_to_dict(col_names, item) for item in result_rows]
        except Exception as exc:
            self.last_error = f"query_runs_failed: {exc}"
            rows = []
            total = 0
        finally:
            try:
                conn.close()
            except Exception:
                pass
        return {
            "rows": rows,
            "count": total,
            "limit": options["limit"],
            "offset": options["offset"],
            "enabled": True,
            "error": str(self.last_error or ""),
        }

    def query_family_stats(self, start_time: str = "", end_time: str = "") -> Dict[str, Any]:
        """Aggregate runs by strategy family for dashboard distribution analysis."""
        if not self.enabled:
            return {"rows": [], "enabled": False, "error": ""}
        self.ensure_schema()
        if not self._schema_ready:
            return {"rows": [], "enabled": True, "error": str(self.last_error or "")}
        conn = self._connect()
        if conn is None:
            return {"rows": [], "enabled": True, "error": str(self.last_error or "")}
        options = self._normalize_query_options(
            limit=100,
            offset=0,
            run_id="",
            child_gene_id="",
            status="",
            parent_strategy_id="",
            start_time=start_time,
            end_time=end_time,
        )
        where_sql, where_params = self._build_query_where(options)
        table = self._qualified_table()
        sql = (
            f"SELECT COALESCE(NULLIF(child_gene_family, ''), 'unknown') AS family, "
            f"COUNT(*) AS run_count, "
            f"AVG(score) AS avg_score, "
            f"AVG((metrics->>'sharpe')::double precision) AS avg_sharpe, "
            f"AVG((metrics->>'drawdown')::double precision) AS avg_drawdown "
            f"FROM {table} {where_sql} "
            f"GROUP BY COALESCE(NULLIF(child_gene_family, ''), 'unknown') "
            f"ORDER BY run_count DESC"
        )
        rows: List[Dict[str, Any]] = []
        try:
            with conn.cursor() as cursor:
                cursor.execute(sql, tuple(where_params))
                for family, run_count, avg_score, avg_sharpe, avg_drawdown in cursor.fetchall() or []:
                    rows.append(
                        {
                            "family": str(family or "unknown"),
                            "run_count": int(run_count or 0),
                            "avg_score": float(avg_score) if avg_score is not None else None,
                            "avg_sharpe": float(avg_sharpe) if avg_sharpe is not None else None,
                            "avg_drawdown": float(avg_drawdown) if avg_drawdown is not None else None,
                        }
                    )
        except Exception as exc:
            self.last_error = f"query_family_stats_failed: {exc}"
            rows = []
        finally:
            try:
                conn.close()
            except Exception:
                pass
        return {"rows": rows, "enabled": True, "error": str(self.last_error or "")}

    def _execute_write(self, conn, sql: str, params: tuple, action: str) -> None:
        """Execute one write statement and handle rollback safely."""
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

    def _normalize_scored_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize event payload into one DB row dict."""
        data = payload if isinstance(payload, dict) else {}
        now = datetime.now(timezone.utc)
        metrics = data.get("metrics", {}) if isinstance(data.get("metrics"), dict) else {}
        profile = data.get("profile", {}) if isinstance(data.get("profile"), dict) else {}
        child_gene = data.get("child_gene", {}) if isinstance(data.get("child_gene"), dict) else {}
        child_gene_family = str(data.get("child_gene_family", "") or child_gene.get("strategy_family", "") or "").strip()
        if child_gene_family not in {"trend_following", "mean_reversion"}:
            child_gene_family = "unknown"
        return {
            "run_id": str(data.get("run_id", "") or "").strip(),
            "iteration": self._to_int(data.get("iteration", 0)),
            "status": str(data.get("status", "unknown") or "unknown").strip(),
            "score": self._to_float_or_none(data.get("score")),
            "strategy_id": str(data.get("strategy_id", "") or "").strip(),
            "strategy_name": str(data.get("strategy_name", "") or "").strip(),
            "parent_strategy_id": str(data.get("parent_strategy_id", "") or "").strip(),
            "parent_strategy_name": str(data.get("parent_strategy_name", "") or "").strip(),
            "child_gene_id": str(data.get("child_gene_id", "") or "").strip(),
            "child_gene_parent_ids": self._to_str_list(data.get("child_gene_parent_ids", [])),
            "child_gene_fingerprint": str(data.get("child_gene_fingerprint", "") or "").strip(),
            "child_gene_family": child_gene_family,
            "metrics": dict(metrics),
            "profile": dict(profile),
            # Store hash instead of raw code to reduce DB volume in MVP.
            "strategy_code_sha256": self._hash_text(str(data.get("strategy_code", "") or "")),
            "created_at": now,
            "updated_at": now,
        }

    def _normalize_query_options(
        self,
        limit: int,
        offset: int,
        run_id: str,
        child_gene_id: str,
        status: str,
        parent_strategy_id: str,
        start_time: str,
        end_time: str,
    ) -> Dict[str, Any]:
        """Normalize query options and trim user-provided filters."""
        out = {
            "limit": max(1, min(int(limit or 100), 500)),
            "offset": max(0, int(offset or 0)),
            "run_id": str(run_id or "").strip(),
            "child_gene_id": str(child_gene_id or "").strip(),
            "status": str(status or "").strip().lower(),
            "parent_strategy_id": str(parent_strategy_id or "").strip(),
            "start_time": self._parse_iso_datetime(start_time),
            "end_time": self._parse_iso_datetime(end_time),
        }
        return out

    def _build_query_where(self, options: Dict[str, Any]) -> tuple[str, List[Any]]:
        """Build SQL WHERE clause and parameters from normalized options."""
        clauses: List[str] = []
        params: List[Any] = []
        if str(options.get("run_id", "")).strip():
            clauses.append("run_id = %s")
            params.append(str(options.get("run_id", "")).strip())
        if str(options.get("child_gene_id", "")).strip():
            clauses.append("child_gene_id = %s")
            params.append(str(options.get("child_gene_id", "")).strip())
        if str(options.get("status", "")).strip():
            clauses.append("status = %s")
            params.append(str(options.get("status", "")).strip())
        if str(options.get("parent_strategy_id", "")).strip():
            clauses.append("parent_strategy_id = %s")
            params.append(str(options.get("parent_strategy_id", "")).strip())
        if options.get("start_time") is not None:
            clauses.append("created_at >= %s")
            params.append(options.get("start_time"))
        if options.get("end_time") is not None:
            clauses.append("created_at <= %s")
            params.append(options.get("end_time"))
        if not clauses:
            return "", params
        return "WHERE " + " AND ".join(clauses), params

    def _row_to_dict(self, col_names: List[str], row: Any) -> Dict[str, Any]:
        """Convert one DB row tuple into API-friendly dictionary."""
        out: Dict[str, Any] = {}
        values = list(row) if isinstance(row, (list, tuple)) else []
        for idx, name in enumerate(col_names):
            key = str(name or "").strip()
            value = values[idx] if idx < len(values) else None
            out[key] = self._normalize_cell_value(value)
        # Keep list field shape stable for frontend.
        parent_ids = out.get("child_gene_parent_ids")
        if isinstance(parent_ids, str):
            try:
                parsed = json.loads(parent_ids)
                out["child_gene_parent_ids"] = parsed if isinstance(parsed, list) else []
            except Exception:
                out["child_gene_parent_ids"] = []
        elif not isinstance(parent_ids, list):
            out["child_gene_parent_ids"] = []
        return out

    def _normalize_cell_value(self, value: Any) -> Any:
        """Normalize DB cell value to JSON-serializable payload."""
        if isinstance(value, datetime):
            return value.isoformat(timespec="seconds")
        if isinstance(value, (dict, list)):
            return value
        return value

    def _connect(self):
        """Open one psycopg2 connection; return None on failure."""
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

    def _parse_iso_datetime(self, text: str) -> Optional[datetime]:
        """Parse ISO datetime text and return timezone-aware UTC datetime."""
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

    def _qualified_table(self) -> str:
        """Build quoted schema.table reference."""
        return f"\"{self.schema}\".\"{self.table}\""

    def _build_ddl(self) -> List[str]:
        """Return DDL statements for table and useful indexes."""
        table = self._qualified_table()
        return [
            f"""
            CREATE TABLE IF NOT EXISTS {table} (
                run_id TEXT PRIMARY KEY,
                iteration INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'unknown',
                score DOUBLE PRECISION NULL,
                strategy_id TEXT NOT NULL DEFAULT '',
                strategy_name TEXT NOT NULL DEFAULT '',
                parent_strategy_id TEXT NOT NULL DEFAULT '',
                parent_strategy_name TEXT NOT NULL DEFAULT '',
                child_gene_id TEXT NOT NULL DEFAULT '',
                child_gene_parent_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
                child_gene_fingerprint TEXT NOT NULL DEFAULT '',
                child_gene_family TEXT NOT NULL DEFAULT '',
                metrics JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                profile JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                strategy_code_sha256 TEXT NOT NULL DEFAULT '',
                committed_strategy_id TEXT NOT NULL DEFAULT '',
                committed_strategy_name TEXT NOT NULL DEFAULT '',
                committed_version INTEGER NOT NULL DEFAULT 0,
                committed_at TIMESTAMPTZ NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """,
            f"CREATE INDEX IF NOT EXISTS idx_egr_iteration ON {table} (iteration)",
            f"CREATE INDEX IF NOT EXISTS idx_egr_created_at ON {table} (created_at DESC)",
            f"CREATE INDEX IF NOT EXISTS idx_egr_child_gene_id ON {table} (child_gene_id)",
            f"CREATE INDEX IF NOT EXISTS idx_egr_child_gene_fp ON {table} (child_gene_fingerprint)",
            f"CREATE INDEX IF NOT EXISTS idx_egr_child_gene_family ON {table} (child_gene_family)",
            f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS child_gene_family TEXT NOT NULL DEFAULT ''",
        ]

    def _to_int(self, value: Any, default: int = 0) -> int:
        """Parse int with fallback."""
        try:
            return int(value)
        except Exception:
            return int(default)

    def _to_float_or_none(self, value: Any) -> Optional[float]:
        """Parse float while preserving None for unknown scores."""
        if value is None:
            return None
        try:
            return float(value)
        except Exception:
            return None

    def _to_str_list(self, value: Any) -> List[str]:
        """Parse string list from scalar/list input."""
        if isinstance(value, (list, tuple, set)):
            out = [str(x or "").strip() for x in value]
            return [x for x in out if x]
        text = str(value or "").strip()
        if not text:
            return []
        return [text]

    def _hash_text(self, text: str) -> str:
        """Hash text using SHA256."""
        return hashlib.sha256(str(text or "").encode("utf-8")).hexdigest()


class GeneRunAgent:
    """Event-driven agent that persists evolution runs to PostgreSQL."""

    def __init__(self, bus: EventBus, repository: Optional[GeneRunRepository] = None):
        self.bus = bus
        self.repository = repository or PostgresGeneRunRepository()
        self.bus.subscribe("StrategyScored", self._on_strategy_scored)
        self.bus.subscribe("StrategyCommitted", self._on_strategy_committed)

    def _on_strategy_scored(self, data: Dict[str, Any]) -> None:
        """Persist scored/rejected run snapshots."""
        payload = data if isinstance(data, dict) else {}
        try:
            self.repository.upsert_scored(payload)
        except Exception:
            # Store failures should not break the core evolution loop.
            return

    def _on_strategy_committed(self, data: Dict[str, Any]) -> None:
        """Update commit linkage once strategy is persisted into library."""
        payload = data if isinstance(data, dict) else {}
        try:
            self.repository.mark_committed(payload)
        except Exception:
            # Commit-mark failures are non-blocking in MVP.
            return
