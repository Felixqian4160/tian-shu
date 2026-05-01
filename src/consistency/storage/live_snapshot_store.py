import json
import os
import re
from copy import deepcopy
from datetime import datetime
from hashlib import sha256
from typing import Any, Dict, List, Optional

import pandas as pd


class LiveSnapshotStore:
    INDEX_FILE_NAME = "live_snapshot_index.json"
    MANIFEST_FILE_NAME = "manifest.json"

    def __init__(self, root_dir: str = "data/consistency"):
        self.root_dir = os.path.abspath(root_dir)
        self.live_root = os.path.join(self.root_dir, "live_snapshots")
        self.index_dir = os.path.join(self.root_dir, "indexes")
        self.index_path = os.path.join(self.index_dir, self.INDEX_FILE_NAME)
        os.makedirs(self.live_root, exist_ok=True)
        os.makedirs(self.index_dir, exist_ok=True)

    def _json_default(self, value: Any):
        if isinstance(value, (datetime, pd.Timestamp)):
            return pd.to_datetime(value, errors="coerce").isoformat()
        return str(value)

    def _read_json(self, path: str, default: Any):
        try:
            with open(path, "r", encoding="utf-8") as f:
                payload = json.load(f)
            return payload
        except Exception:
            return deepcopy(default)

    def _write_json(self, path: str, payload: Any) -> None:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2, default=self._json_default)

    def _write_jsonl(self, path: str, rows: List[Dict[str, Any]]) -> None:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            for row in rows:
                if not isinstance(row, dict):
                    continue
                f.write(json.dumps(row, ensure_ascii=False, default=self._json_default))
                f.write("\n")

    def _sanitize_key(self, raw: Any, fallback: str) -> str:
        text = re.sub(r"[^0-9A-Za-z_.-]+", "_", str(raw or "").strip())
        return text or fallback

    def _normalize_code(self, code: Any) -> str:
        return str(code or "UNKNOWN").strip().upper() or "UNKNOWN"

    def _normalize_market(self, market: Any) -> str:
        text = str(market or "ashare").strip().lower()
        return re.sub(r"[^0-9a-z_.-]+", "_", text) or "ashare"

    def _normalize_date(self, trade_date: Any) -> str:
        dt = pd.to_datetime(trade_date, errors="coerce")
        if pd.isna(dt):
            return datetime.now().strftime("%Y-%m-%d")
        return dt.strftime("%Y-%m-%d")

    def _snapshot_id(self, market: str, code: str, date_text: str) -> str:
        return f"{market}-{code}-{date_text}"

    def _fingerprint(self, payload: Any) -> str:
        text = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=self._json_default)
        return sha256(text.encode("utf-8")).hexdigest()

    def _snapshot_dir(self, market: str, code: str, date_text: str) -> str:
        return os.path.join(self.live_root, market, code, date_text)

    def _manifest_path(self, market: str, code: str, date_text: str) -> str:
        return os.path.join(self._snapshot_dir(market, code, date_text), self.MANIFEST_FILE_NAME)

    def _normalize_text_list(self, values: Optional[List[Any]]) -> List[str]:
        out: List[str] = []
        for value in list(values or []):
            text = str(value or "").strip()
            if text and text not in out:
                out.append(text)
        return out

    def _build_index_entry(self, manifest: Dict[str, Any], meta: Optional[Dict[str, Any]] = None, summary: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        meta = meta if isinstance(meta, dict) else {}
        summary = summary if isinstance(summary, dict) else {}
        strategy_ids = self._normalize_text_list(meta.get("strategy_ids") if isinstance(meta.get("strategy_ids"), list) else [])
        timeframes = self._normalize_text_list(meta.get("timeframes") if isinstance(meta.get("timeframes"), list) else [])
        counts = manifest.get("counts", {}) if isinstance(manifest.get("counts"), dict) else {}
        return {
            "snapshot_id": manifest.get("snapshot_id"),
            "market": manifest.get("market"),
            "code": manifest.get("code"),
            "date": manifest.get("date"),
            "created_at": manifest.get("created_at"),
            "updated_at": manifest.get("updated_at"),
            "strategy_fingerprint": manifest.get("strategy_fingerprint"),
            "config_fingerprint": manifest.get("config_fingerprint"),
            "risk_fingerprint": manifest.get("risk_fingerprint"),
            "manifest_path": manifest.get("manifest_path"),
            "summary_path": manifest.get("files", {}).get("summary"),
            "strategy_ids": strategy_ids,
            "timeframes": timeframes,
            "signal_count": int(summary.get("signal_count", counts.get("signals", 0)) or 0),
            "risk_check_count": int(summary.get("risk_check_count", counts.get("risk_checks", 0)) or 0),
            "order_count": int(summary.get("order_count", counts.get("orders", 0)) or 0),
            "fill_count": int(summary.get("fill_count", counts.get("fills", 0)) or 0),
            "trade_count": int(counts.get("trade_count", 0) or 0),
        }

    def _load_index(self) -> List[Dict[str, Any]]:
        payload = self._read_json(self.index_path, [])
        return payload if isinstance(payload, list) else []

    def _save_index(self, items: List[Dict[str, Any]]) -> None:
        sorted_items = sorted(
            [x for x in items if isinstance(x, dict)],
            key=lambda x: (
                str(x.get("date", "")),
                str(x.get("code", "")),
                str(x.get("created_at", "")),
            ),
            reverse=True,
        )
        self._write_json(self.index_path, sorted_items)

    def _upsert_index_entry(self, entry: Dict[str, Any]) -> None:
        items = self._load_index()
        snapshot_id = str(entry.get("snapshot_id", "") or "")
        next_items = [x for x in items if str(x.get("snapshot_id", "") or "") != snapshot_id]
        next_items.append(entry)
        self._save_index(next_items)

    def _relpath(self, path: str) -> str:
        return os.path.relpath(path, self.root_dir).replace("\\", "/")

    def save_snapshot(
        self,
        *,
        market: str,
        code: str,
        trade_date: Any,
        meta: Dict[str, Any],
        summary: Dict[str, Any],
        bars: Optional[List[Dict[str, Any]]] = None,
        signals: Optional[List[Dict[str, Any]]] = None,
        risk_checks: Optional[List[Dict[str, Any]]] = None,
        orders: Optional[List[Dict[str, Any]]] = None,
        fills: Optional[List[Dict[str, Any]]] = None,
        pnl_timeseries: Optional[List[Dict[str, Any]]] = None,
        positions_eod: Optional[Dict[str, Any]] = None,
        fund_pool_eod: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        market_key = self._normalize_market(market)
        code_key = self._normalize_code(code)
        date_text = self._normalize_date(trade_date)
        snapshot_id = self._snapshot_id(market_key, code_key, date_text)
        now_text = datetime.now().isoformat(timespec="seconds")
        snapshot_dir = self._snapshot_dir(market_key, code_key, date_text)
        os.makedirs(snapshot_dir, exist_ok=True)

        bars = [x for x in (bars or []) if isinstance(x, dict)]
        signals = [x for x in (signals or []) if isinstance(x, dict)]
        risk_checks = [x for x in (risk_checks or []) if isinstance(x, dict)]
        orders = [x for x in (orders or []) if isinstance(x, dict)]
        fills = [x for x in (fills or []) if isinstance(x, dict)]
        pnl_timeseries = [x for x in (pnl_timeseries or []) if isinstance(x, dict)]
        positions_eod = positions_eod if isinstance(positions_eod, dict) else {}
        fund_pool_eod = fund_pool_eod if isinstance(fund_pool_eod, dict) else {}
        meta = meta if isinstance(meta, dict) else {}
        summary = summary if isinstance(summary, dict) else {}

        files = {
            "meta": os.path.join(snapshot_dir, "meta.json"),
            "summary": os.path.join(snapshot_dir, "summary.json"),
            "bars": os.path.join(snapshot_dir, "bars.jsonl"),
            "signals": os.path.join(snapshot_dir, "signals.jsonl"),
            "risk_checks": os.path.join(snapshot_dir, "risk_checks.jsonl"),
            "orders": os.path.join(snapshot_dir, "orders.jsonl"),
            "fills": os.path.join(snapshot_dir, "fills.jsonl"),
            "positions_eod": os.path.join(snapshot_dir, "positions_eod.json"),
            "fund_pool_eod": os.path.join(snapshot_dir, "fund_pool_eod.json"),
            "pnl_timeseries": os.path.join(snapshot_dir, "pnl_timeseries.jsonl"),
        }

        self._write_json(files["meta"], meta)
        self._write_json(files["summary"], summary)
        self._write_json(files["positions_eod"], positions_eod)
        self._write_json(files["fund_pool_eod"], fund_pool_eod)
        self._write_jsonl(files["bars"], bars)
        self._write_jsonl(files["signals"], signals)
        self._write_jsonl(files["risk_checks"], risk_checks)
        self._write_jsonl(files["orders"], orders)
        self._write_jsonl(files["fills"], fills)
        self._write_jsonl(files["pnl_timeseries"], pnl_timeseries)

        manifest_path = self._manifest_path(market_key, code_key, date_text)
        prev_manifest = self._read_json(manifest_path, {})
        created_at = str(prev_manifest.get("created_at", "") or now_text)
        manifest = {
            "snapshot_id": snapshot_id,
            "market": market_key,
            "code": code_key,
            "date": date_text,
            "created_at": created_at,
            "updated_at": now_text,
            "strategy_fingerprint": self._fingerprint(meta.get("strategies", [])),
            "config_fingerprint": self._fingerprint(meta.get("config", {})),
            "risk_fingerprint": self._fingerprint(meta.get("risk", {})),
            "counts": {
                "bars": len(bars),
                "signals": len(signals),
                "risk_checks": len(risk_checks),
                "orders": len(orders),
                "fills": len(fills),
                "pnl_timeseries": len(pnl_timeseries),
                "positions": len(positions_eod.get("positions", [])) if isinstance(positions_eod.get("positions"), list) else 0,
                "trade_count": int(fund_pool_eod.get("trade_count", 0) or 0),
            },
            "files": {k: self._relpath(v) for k, v in files.items()},
            "manifest_path": self._relpath(manifest_path),
        }
        self._write_json(manifest_path, manifest)
        self._upsert_index_entry(self._build_index_entry(manifest, meta=meta, summary=summary))
        return manifest

    def list_snapshots(
        self,
        market: str = "",
        code: str = "",
        strategy_id: str = "",
        strategy_ids: Optional[List[str]] = None,
        timeframe: str = "",
        timeframes: Optional[List[str]] = None,
        start_date: str = "",
        end_date: str = "",
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        items = self._load_index()
        market_text = str(market or "").strip().lower()
        code_text = str(code or "").strip().upper()
        sid_text = str(strategy_id or "").strip()
        strategy_filter = self._normalize_text_list(strategy_ids)
        if sid_text and sid_text not in strategy_filter:
            strategy_filter.append(sid_text)
        timeframe_text = str(timeframe or "").strip()
        timeframe_filter = self._normalize_text_list(timeframes)
        if timeframe_text and timeframe_text not in timeframe_filter:
            timeframe_filter.append(timeframe_text)
        start_text = self._normalize_date(start_date) if str(start_date or "").strip() else ""
        end_text = self._normalize_date(end_date) if str(end_date or "").strip() else ""

        filtered = []
        for item in items:
            if not isinstance(item, dict):
                continue
            if market_text and str(item.get("market", "")).lower() != market_text:
                continue
            if code_text and str(item.get("code", "")).upper() != code_text:
                continue
            item_date = str(item.get("date", "") or "")
            if start_text and item_date and item_date < start_text:
                continue
            if end_text and item_date and item_date > end_text:
                continue
            item_strategy_ids = self._normalize_text_list(item.get("strategy_ids") if isinstance(item.get("strategy_ids"), list) else [])
            item_timeframes = self._normalize_text_list(item.get("timeframes") if isinstance(item.get("timeframes"), list) else [])
            if strategy_filter and not any(sid in item_strategy_ids for sid in strategy_filter):
                detail = self.get_snapshot(str(item.get("snapshot_id", "") or ""), include_rows=False)
                item_strategy_ids = self._normalize_text_list((detail.get("meta", {}) or {}).get("strategy_ids") if isinstance(detail, dict) else [])
                if not any(sid in item_strategy_ids for sid in strategy_filter):
                    continue
            if timeframe_filter and not any(tf in item_timeframes for tf in timeframe_filter):
                detail = self.get_snapshot(str(item.get("snapshot_id", "") or ""), include_rows=False)
                item_timeframes = self._normalize_text_list((detail.get("meta", {}) or {}).get("timeframes") if isinstance(detail, dict) else [])
                if not any(tf in item_timeframes for tf in timeframe_filter):
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

    def _read_jsonl(self, path: str) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        if not os.path.exists(path):
            return rows
        try:
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    text = str(line or "").strip()
                    if not text:
                        continue
                    payload = json.loads(text)
                    if isinstance(payload, dict):
                        rows.append(payload)
        except Exception:
            return []
        return rows

    def get_snapshot(self, snapshot_id: str, include_rows: bool = True) -> Dict[str, Any]:
        sid = str(snapshot_id or "").strip()
        if not sid:
            return {}
        items = self._load_index()
        hit = next((x for x in items if str(x.get("snapshot_id", "") or "") == sid), None)
        if not isinstance(hit, dict):
            return {}
        manifest_path = os.path.join(self.root_dir, str(hit.get("manifest_path", "")).replace("/", os.sep))
        manifest = self._read_json(manifest_path, {})
        if not isinstance(manifest, dict):
            return {}
        files = manifest.get("files", {}) if isinstance(manifest.get("files"), dict) else {}

        def abs_path(key: str) -> str:
            rel = str(files.get(key, "") or "")
            return os.path.join(self.root_dir, rel.replace("/", os.sep)) if rel else ""

        payload = {
            "manifest": manifest,
            "meta": self._read_json(abs_path("meta"), {}),
            "summary": self._read_json(abs_path("summary"), {}),
            "positions_eod": self._read_json(abs_path("positions_eod"), {}),
            "fund_pool_eod": self._read_json(abs_path("fund_pool_eod"), {}),
        }
        if include_rows:
            payload.update({
                "bars": self._read_jsonl(abs_path("bars")),
                "signals": self._read_jsonl(abs_path("signals")),
                "risk_checks": self._read_jsonl(abs_path("risk_checks")),
                "orders": self._read_jsonl(abs_path("orders")),
                "fills": self._read_jsonl(abs_path("fills")),
                "pnl_timeseries": self._read_jsonl(abs_path("pnl_timeseries")),
            })
        return payload
