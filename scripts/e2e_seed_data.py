"""
Seed deterministic evolution run records for Playwright integration tests.

Usage:
    python scripts/e2e_seed_data.py
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from src.utils.config_loader import ConfigLoader


def _build_seed_rows() -> List[Dict[str, Any]]:
    """Build deterministic rows so UI assertions can rely on stable values."""
    now = datetime.now(timezone.utc)
    rows: List[Dict[str, Any]] = []
    for idx in range(1, 4):
        created = now - timedelta(minutes=idx)
        rows.append(
            {
                "run_id": f"e2e_run_{idx:03d}",
                "iteration": idx,
                "status": "ok",
                "score": 0.8 + idx * 0.01,
                "strategy_id": f"E2E_{idx:03d}",
                "strategy_name": f"E2E Evolution {idx}",
                "parent_strategy_id": "01",
                "parent_strategy_name": "Seed01",
                "child_gene_id": f"e2e_gene_{idx:03d}",
                "child_gene_parent_ids": json.dumps(["e2e_root_gene"], ensure_ascii=False),
                "child_gene_fingerprint": f"e2e_fp_{idx:03d}",
                "metrics": json.dumps(
                    {"sharpe": 1.1 + idx * 0.1, "drawdown": 0.1, "win_rate": 0.55},
                    ensure_ascii=False,
                ),
                "profile": json.dumps({"persist_enabled": True, "timeframes": ["15min"]}, ensure_ascii=False),
                "strategy_code_sha256": f"e2e_hash_{idx:03d}",
                "created_at": created,
                "updated_at": created,
            }
        )
    return rows


def main() -> int:
    """Insert/replace E2E seed rows into evolution_gene_runs table."""
    cfg = ConfigLoader.reload()
    host = str(cfg.get("data_provider.postgres_host", "127.0.0.1") or "127.0.0.1").strip()
    port = int(cfg.get("data_provider.postgres_port", 5432) or 5432)
    user = str(cfg.get("data_provider.postgres_user", "") or "").strip()
    password = str(cfg.get("data_provider.postgres_password", "") or "").strip()
    database = str(cfg.get("data_provider.postgres_database", "") or "").strip()
    schema = str(cfg.get("data_provider.postgres_schema", "public") or "public").strip() or "public"
    table = str(cfg.get("evolution.gene_run_store.table", "evolution_gene_runs") or "evolution_gene_runs").strip()

    if not user or not database:
        print("[e2e_seed_data] Skip: PostgreSQL config is incomplete.")
        return 0

    try:
        import psycopg2
    except Exception as exc:  # pragma: no cover
        print(f"[e2e_seed_data] Skip: psycopg2 unavailable: {exc}")
        return 0

    rows = _build_seed_rows()
    qualified = f"\"{schema}\".\"{table}\""
    sql = (
        f"INSERT INTO {qualified} "
        "(run_id, iteration, status, score, strategy_id, strategy_name, parent_strategy_id, parent_strategy_name, "
        "child_gene_id, child_gene_parent_ids, child_gene_fingerprint, metrics, profile, strategy_code_sha256, created_at, updated_at) "
        "VALUES (%(run_id)s, %(iteration)s, %(status)s, %(score)s, %(strategy_id)s, %(strategy_name)s, %(parent_strategy_id)s, %(parent_strategy_name)s, "
        "%(child_gene_id)s, %(child_gene_parent_ids)s::jsonb, %(child_gene_fingerprint)s, %(metrics)s::jsonb, %(profile)s::jsonb, "
        "%(strategy_code_sha256)s, %(created_at)s, %(updated_at)s) "
        "ON CONFLICT (run_id) DO UPDATE SET "
        "iteration=EXCLUDED.iteration, status=EXCLUDED.status, score=EXCLUDED.score, "
        "strategy_id=EXCLUDED.strategy_id, strategy_name=EXCLUDED.strategy_name, "
        "parent_strategy_id=EXCLUDED.parent_strategy_id, parent_strategy_name=EXCLUDED.parent_strategy_name, "
        "child_gene_id=EXCLUDED.child_gene_id, child_gene_parent_ids=EXCLUDED.child_gene_parent_ids, "
        "child_gene_fingerprint=EXCLUDED.child_gene_fingerprint, metrics=EXCLUDED.metrics, profile=EXCLUDED.profile, "
        "strategy_code_sha256=EXCLUDED.strategy_code_sha256, updated_at=EXCLUDED.updated_at"
    )
    try:
        conn = psycopg2.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            dbname=database,
        )
    except Exception as exc:
        print(f"[e2e_seed_data] Skip: cannot connect PostgreSQL: {exc}")
        return 0

    try:
        with conn.cursor() as cursor:
            for row in rows:
                # Each row is deterministic and idempotent through ON CONFLICT.
                cursor.execute(sql, row)
        conn.commit()
        print(f"[e2e_seed_data] Seeded {len(rows)} rows into {schema}.{table}.")
    except Exception as exc:
        conn.rollback()
        print(f"[e2e_seed_data] Failed: {exc}")
        return 1
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
