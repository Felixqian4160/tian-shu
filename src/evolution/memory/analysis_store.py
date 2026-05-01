from __future__ import annotations

import json
import os
import re
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


class AnalysisStore:
    """File-backed store for post-score analysis records linked to evolution runs."""

    INDEX_FILE_NAME = "analysis_index.json"
    FILE_PREFIX = "analysis_"

    def __init__(self, root_dir: str = "data/evolution/analysis"):
        self.root_dir = os.path.abspath(root_dir)
        self.analysis_root = os.path.join(self.root_dir, "records")
        self.index_dir = os.path.join(self.root_dir, "indexes")
        self.index_path = os.path.join(self.index_dir, self.INDEX_FILE_NAME)
        os.makedirs(self.analysis_root, exist_ok=True)
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

    def _analysis_id(self, run_id: str) -> str:
        return f"analysis_{self._sanitize_key(run_id, 'unknown')}_{int(datetime.now(timezone.utc).timestamp() * 1000)}_{os.urandom(3).hex()}"

    def _analysis_path(self, analysis_id: str) -> str:
        return os.path.join(self.analysis_root, f"{self.FILE_PREFIX}{self._sanitize_key(analysis_id, 'record')}.json")

    def save_analysis(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        run_id = str(payload.get("run_id", "") or "").strip()
        if not run_id:
            return {}
        analysis_id = str(payload.get("analysis_id", "") or self._analysis_id(run_id))
        created_at = str(payload.get("created_at", "") or datetime.now(timezone.utc).isoformat(timespec="seconds"))
        next_payload = dict(payload)
        next_payload["analysis_id"] = analysis_id
        next_payload["run_id"] = run_id
        next_payload["created_at"] = created_at
        path = self._analysis_path(analysis_id)
        self._write_json(path, next_payload)
        items = self._load_index()
        next_items = [x for x in items if str(x.get("analysis_id", "") or "") != analysis_id]
        next_items.append({
            "analysis_id": analysis_id,
            "run_id": run_id,
            "created_at": created_at,
            "analysis_version": next_payload.get("analysis_version", "v1"),
            "analysis_status": next_payload.get("analysis_status", "success"),
            "analysis_source": next_payload.get("analysis_source", "rule_based"),
            "consistency_report_id": next_payload.get("consistency_report_id", ""),
            "llm_provider": next_payload.get("llm_provider", ""),
            "llm_model": next_payload.get("llm_model", ""),
            "path": os.path.relpath(path, self.root_dir).replace("\\", "/"),
        })
        self._save_index(next_items)
        return next_payload

    def get_analysis(self, analysis_id: str) -> Dict[str, Any]:
        path = self._analysis_path(analysis_id)
        payload = self._read_json(path, {})
        return payload if isinstance(payload, dict) else {}

    def get_analysis_by_run_id(self, run_id: str) -> Optional[Dict[str, Any]]:
        items = self._load_index()
        run_id_text = str(run_id or "").strip()
        if not run_id_text:
            return None
        for item in items:
            if not isinstance(item, dict):
                continue
            if str(item.get("run_id", "")).strip() == run_id_text:
                analysis_id = str(item.get("analysis_id", "") or "")
                if analysis_id:
                    return self.get_analysis(analysis_id)
        return None

    def list_analyses(self, run_id: str = "", page: int = 1, page_size: int = 20) -> Dict[str, Any]:
        items = self._load_index()
        run_id_text = str(run_id or "").strip()
        filtered = []
        for item in items:
            if not isinstance(item, dict):
                continue
            if run_id_text and str(item.get("run_id", "")).strip() != run_id_text:
                continue
            filtered.append(item)
        safe_page = max(1, int(page or 1))
        safe_size = max(1, min(int(page_size or 20), 200))
        start_idx = (safe_page - 1) * safe_size
        end_idx = start_idx + safe_size
        return {"items": filtered[start_idx:end_idx], "total": len(filtered), "page": safe_page, "page_size": safe_size}
