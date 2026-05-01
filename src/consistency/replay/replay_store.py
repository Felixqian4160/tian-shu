import json
import os
import re
from copy import deepcopy
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd


class ReplayStore:
    INDEX_FILE_NAME = "replay_run_index.json"
    MANIFEST_FILE_NAME = "replay_manifest.json"

    def __init__(self, root_dir: str = "data/consistency"):
        self.root_dir = os.path.abspath(root_dir)
        self.replay_root = os.path.join(self.root_dir, "replay_runs")
        self.index_dir = os.path.join(self.root_dir, "indexes")
        self.index_path = os.path.join(self.index_dir, self.INDEX_FILE_NAME)
        os.makedirs(self.replay_root, exist_ok=True)
        os.makedirs(self.index_dir, exist_ok=True)

    def _json_default(self, value: Any):
        if isinstance(value, (datetime, pd.Timestamp)):
            return pd.to_datetime(value, errors="coerce").isoformat()
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

    def _sanitize_key(self, raw: Any, fallback: str) -> str:
        text = re.sub(r"[^0-9A-Za-z_.-]+", "_", str(raw or "").strip())
        return text or fallback

    def _replay_run_id(self) -> str:
        return f"replay_{int(datetime.now().timestamp() * 1000)}_{os.urandom(3).hex()}"

    def _replay_dir(self, run_id: str) -> str:
        return os.path.join(self.replay_root, self._sanitize_key(run_id, "unknown"))

    def _manifest_path(self, run_id: str) -> str:
        return os.path.join(self._replay_dir(run_id), self.MANIFEST_FILE_NAME)

    def _relpath(self, path: str) -> str:
        return os.path.relpath(path, self.root_dir).replace("\\", "/")

    def _load_index(self) -> List[Dict[str, Any]]:
        payload = self._read_json(self.index_path, [])
        return payload if isinstance(payload, list) else []

    def _save_index(self, items: List[Dict[str, Any]]) -> None:
        sorted_items = sorted(
            [x for x in items if isinstance(x, dict)],
            key=lambda x: str(x.get("created_at", "")),
            reverse=True,
        )
        self._write_json(self.index_path, sorted_items)

    def _upsert_index_entry(self, entry: Dict[str, Any]) -> None:
        items = self._load_index()
        run_id = str(entry.get("replay_run_id", "") or "")
        next_items = [x for x in items if str(x.get("replay_run_id", "") or "") != run_id]
        next_items.append(entry)
        self._save_index(next_items)

    def save_replay_run(
        self,
        *,
        market: str,
        code: str,
        start_date: str,
        end_date: str,
        snapshot_ids: List[str],
        backtest_result: Optional[Dict[str, Any]] = None,
        status: str = "pending",
        error_msg: str = "",
        backtest_source_type: str = "",
        selected_report_id: str = "",
        selected_strategy_ids: Optional[List[str]] = None,
        comparison_scope_summary: str = "",
        comparison_mode: str = "",
        note: str = "",
    ) -> Dict[str, Any]:
        run_id = self._replay_run_id()
        now_text = datetime.now().isoformat(timespec="seconds")
        replay_dir = self._replay_dir(run_id)
        os.makedirs(replay_dir, exist_ok=True)

        result_path = os.path.join(replay_dir, "backtest_result.json")
        if isinstance(backtest_result, dict):
            self._write_json(result_path, backtest_result)

        manifest = {
            "replay_run_id": run_id,
            "market": str(market or "").strip().lower() or "ashare",
            "code": str(code or "").strip().upper(),
            "start_date": str(start_date or "").strip(),
            "end_date": str(end_date or "").strip(),
            "snapshot_ids": [str(x) for x in snapshot_ids if str(x or "").strip()],
            "snapshot_count": len(snapshot_ids),
            "status": str(status or "pending").strip(),
            "error_msg": str(error_msg or "").strip(),
            "backtest_source_type": str(backtest_source_type or "").strip(),
            "selected_report_id": str(selected_report_id or "").strip(),
            "selected_strategy_ids": [str(x) for x in list(selected_strategy_ids or []) if str(x or "").strip()],
            "comparison_scope_summary": str(comparison_scope_summary or "").strip(),
            "comparison_mode": str(comparison_mode or "").strip(),
            "note": str(note or "").strip(),
            "created_at": now_text,
            "updated_at": now_text,
            "files": {
                "backtest_result": self._relpath(result_path) if backtest_result else None,
            },
            "manifest_path": self._relpath(self._manifest_path(run_id)),
        }
        self._write_json(self._manifest_path(run_id), manifest)
        self._upsert_index_entry({
            "replay_run_id": run_id,
            "market": manifest["market"],
            "code": manifest["code"],
            "start_date": manifest["start_date"],
            "end_date": manifest["end_date"],
            "snapshot_count": manifest["snapshot_count"],
            "status": manifest["status"],
            "created_at": manifest["created_at"],
            "backtest_source_type": manifest.get("backtest_source_type"),
            "selected_report_id": manifest.get("selected_report_id"),
            "selected_strategy_ids": manifest.get("selected_strategy_ids", []),
            "comparison_scope_summary": manifest.get("comparison_scope_summary"),
            "comparison_mode": manifest.get("comparison_mode"),
            "note": manifest.get("note"),
            "manifest_path": manifest["manifest_path"],
        })
        return manifest

    def update_replay_run(self, run_id: str, status: str = "", error_msg: str = "", backtest_result: Optional[Dict[str, Any]] = None) -> None:
        manifest_path = self._manifest_path(run_id)
        manifest = self._read_json(manifest_path, {})
        if not isinstance(manifest, dict) or not manifest:
            return
        if status:
            manifest["status"] = str(status).strip()
        if error_msg:
            manifest["error_msg"] = str(error_msg).strip()
        manifest["updated_at"] = datetime.now().isoformat(timespec="seconds")
        if isinstance(backtest_result, dict):
            result_path = os.path.join(self._replay_dir(run_id), "backtest_result.json")
            self._write_json(result_path, backtest_result)
            manifest["files"]["backtest_result"] = self._relpath(result_path)
        self._write_json(manifest_path, manifest)
        self._upsert_index_entry({
            "replay_run_id": manifest["replay_run_id"],
            "market": manifest["market"],
            "code": manifest["code"],
            "start_date": manifest["start_date"],
            "end_date": manifest["end_date"],
            "snapshot_count": manifest["snapshot_count"],
            "status": manifest["status"],
            "created_at": manifest["created_at"],
            "backtest_source_type": manifest.get("backtest_source_type"),
            "selected_report_id": manifest.get("selected_report_id"),
            "selected_strategy_ids": manifest.get("selected_strategy_ids", []),
            "comparison_scope_summary": manifest.get("comparison_scope_summary"),
            "comparison_mode": manifest.get("comparison_mode"),
            "note": manifest.get("note"),
            "manifest_path": manifest["manifest_path"],
        })

    def list_replay_runs(
        self,
        market: str = "",
        code: str = "",
        start_date: str = "",
        end_date: str = "",
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        items = self._load_index()
        market_text = str(market or "").strip().lower()
        code_text = str(code or "").strip().upper()
        start_text = str(start_date or "").strip()
        end_text = str(end_date or "").strip()

        filtered = []
        for item in items:
            if not isinstance(item, dict):
                continue
            if market_text and str(item.get("market", "")).lower() != market_text:
                continue
            if code_text and str(item.get("code", "")).upper() != code_text:
                continue
            item_start = str(item.get("start_date", "") or "")
            item_end = str(item.get("end_date", "") or "")
            if start_text and item_end and item_end < start_text:
                continue
            if end_text and item_start and item_start > end_text:
                continue
            filtered.append(item)

        safe_page = max(1, int(page or 1))
        safe_size = max(1, min(int(page_size or 20), 200))
        start_idx = (safe_page - 1) * safe_size
        end_idx = start_idx + safe_size
        return {
            "items": filtered[start_idx:end_idx],
            "total": len(filtered),
            "page": safe_page,
            "page_size": safe_size,
        }

    def get_replay_run(self, run_id: str) -> Dict[str, Any]:
        manifest_path = self._manifest_path(run_id)
        manifest = self._read_json(manifest_path, {})
        if not isinstance(manifest, dict) or not manifest:
            return {}
        files = manifest.get("files", {}) if isinstance(manifest.get("files"), dict) else {}
        result_rel = str(files.get("backtest_result", "") or "")
        result_path = os.path.join(self.root_dir, result_rel.replace("/", os.sep)) if result_rel else ""
        backtest_result = self._read_json(result_path, {}) if result_path and os.path.exists(result_path) else {}
        return {
            "manifest": manifest,
            "backtest_result": backtest_result,
        }
