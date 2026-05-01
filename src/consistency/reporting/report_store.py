import json
import os
import re
from copy import deepcopy
from datetime import datetime
from typing import Any, Dict, List


class ConsistencyReportStore:
    INDEX_FILE_NAME = "consistency_report_index.json"
    FILE_PREFIX = "consistency_report_"

    def __init__(self, root_dir: str = "data/consistency"):
        self.root_dir = os.path.abspath(root_dir)
        self.report_root = os.path.join(self.root_dir, "reports")
        self.index_dir = os.path.join(self.root_dir, "indexes")
        self.index_path = os.path.join(self.index_dir, self.INDEX_FILE_NAME)
        os.makedirs(self.report_root, exist_ok=True)
        os.makedirs(self.index_dir, exist_ok=True)

    def _json_default(self, value: Any):
        return str(value)

    def _read_json(self, path: str, default: Any):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return deepcopy(default)

    def _write_json(self, path: str, payload: Any) -> None:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2, default=self._json_default)

    def _load_index(self) -> List[Dict[str, Any]]:
        payload = self._read_json(self.index_path, [])
        return payload if isinstance(payload, list) else []

    def _save_index(self, items: List[Dict[str, Any]]) -> None:
        items = sorted([x for x in items if isinstance(x, dict)], key=lambda x: str(x.get("created_at", "")), reverse=True)
        self._write_json(self.index_path, items)

    def _sanitize_key(self, raw: Any, fallback: str) -> str:
        text = re.sub(r"[^0-9A-Za-z_.-]+", "_", str(raw or "").strip())
        return text or fallback

    def _report_id(self) -> str:
        return f"consistency_{int(datetime.now().timestamp() * 1000)}_{os.urandom(3).hex()}"

    def _report_path(self, report_id: str) -> str:
        return os.path.join(self.report_root, f"{self.FILE_PREFIX}{self._sanitize_key(report_id, 'report')}.json")

    def save_report(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        report_id = str(payload.get("report_id", "") or self._report_id())
        created_at = str(payload.get("created_at", "") or datetime.now().isoformat(timespec="seconds"))
        next_payload = dict(payload)
        next_payload["report_id"] = report_id
        next_payload["created_at"] = created_at
        path = self._report_path(report_id)
        self._write_json(path, next_payload)
        items = self._load_index()
        next_items = [x for x in items if str(x.get("report_id", "") or "") != report_id]
        next_items.append({
            "report_id": report_id,
            "created_at": created_at,
            "market": next_payload.get("market"),
            "code": next_payload.get("code"),
            "snapshot_id": next_payload.get("snapshot_id"),
            "replay_run_id": next_payload.get("replay_run_id"),
            "linked_report_id": next_payload.get("linked_report_id") or (next_payload.get("summary") or {}).get("linked_report_id") or "",
            "status": next_payload.get("status", "success"),
            "snapshot_date": (next_payload.get("summary") or {}).get("snapshot_date"),
            "live_trade_count": (next_payload.get("summary") or {}).get("live_trade_count"),
            "replay_trade_count": (next_payload.get("summary") or {}).get("replay_trade_count"),
            "mismatch_count": (next_payload.get("summary") or {}).get("mismatch_count"),
            "root_cause_tags": (next_payload.get("summary") or {}).get("root_cause_tags", []),
            "first_divergence_stage": (next_payload.get("summary") or {}).get("first_divergence_stage"),
            "first_divergence_reason": (next_payload.get("summary") or {}).get("first_divergence_reason"),
            "comparison_mode": (next_payload.get("summary") or {}).get("comparison_mode"),
            "note": (next_payload.get("summary") or {}).get("note"),
            "backtest_source_type": next_payload.get("backtest_source_type") or (next_payload.get("summary") or {}).get("backtest_source_type"),
            "selected_report_id": next_payload.get("selected_report_id") or (next_payload.get("summary") or {}).get("selected_report_id"),
            "selected_strategy_ids": next_payload.get("selected_strategy_ids") or (next_payload.get("summary") or {}).get("selected_strategy_ids", []),
            "selected_snapshot_ids": next_payload.get("selected_snapshot_ids") or (next_payload.get("summary") or {}).get("selected_snapshot_ids", []),
            "snapshot_count": next_payload.get("snapshot_count") or (next_payload.get("summary") or {}).get("snapshot_count"),
            "comparison_scope_summary": next_payload.get("comparison_scope_summary") or (next_payload.get("summary") or {}).get("comparison_scope_summary"),
            "path": os.path.relpath(path, self.root_dir).replace("\\", "/"),
        })
        self._save_index(next_items)
        return next_payload

    def list_reports(self, market: str = "", code: str = "", page: int = 1, page_size: int = 20) -> Dict[str, Any]:
        items = self._load_index()
        market_text = str(market or "").strip().lower()
        code_text = str(code or "").strip().upper()
        filtered = []
        for item in items:
            if not isinstance(item, dict):
                continue
            if market_text and str(item.get("market", "")).lower() != market_text:
                continue
            item_code = str(item.get("code", "")).upper()
            if code_text and code_text not in item_code:
                continue
            filtered.append(item)
        safe_page = max(1, int(page or 1))
        safe_size = max(1, min(int(page_size or 20), 200))
        start_idx = (safe_page - 1) * safe_size
        end_idx = start_idx + safe_size
        return {"items": filtered[start_idx:end_idx], "total": len(filtered), "page": safe_page, "page_size": safe_size}

    def get_report(self, report_id: str) -> Dict[str, Any]:
        path = self._report_path(report_id)
        payload = self._read_json(path, {})
        return payload if isinstance(payload, dict) else {}
