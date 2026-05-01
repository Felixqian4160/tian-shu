from copy import deepcopy
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd

from src.consistency.storage.live_snapshot_store import LiveSnapshotStore


class LiveSnapshotCollector:
    def __init__(self, stock_code: str, market: str = "ashare", store: Optional[LiveSnapshotStore] = None):
        self.stock_code = str(stock_code or "").strip().upper()
        self.market = str(market or "ashare").strip().lower() or "ashare"
        self.store = store or LiveSnapshotStore()
        self.reset_day_buffers()

    def reset_day_buffers(self) -> None:
        self._signals: List[Dict[str, Any]] = []
        self._risk_checks: List[Dict[str, Any]] = []
        self._orders: List[Dict[str, Any]] = []
        self._fills: List[Dict[str, Any]] = []
        self._pnl_timeseries: List[Dict[str, Any]] = []
        self._last_reset_date = ""

    def _day_text(self, value: Any) -> str:
        dt = pd.to_datetime(value, errors="coerce")
        if pd.isna(dt):
            return ""
        return dt.strftime("%Y-%m-%d")

    def ensure_day(self, trade_dt: Any) -> None:
        day_text = self._day_text(trade_dt)
        if not day_text:
            return
        if self._last_reset_date and self._last_reset_date != day_text:
            self.reset_day_buffers()
        self._last_reset_date = day_text

    def _json_safe(self, value: Any) -> Any:
        if value is None or isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, (datetime, pd.Timestamp)):
            return pd.to_datetime(value, errors="coerce").isoformat()
        if isinstance(value, dict):
            return {str(k): self._json_safe(v) for k, v in value.items()}
        if isinstance(value, (list, tuple, set)):
            return [self._json_safe(v) for v in value]
        try:
            if hasattr(value, "to_dict"):
                return self._json_safe(value.to_dict())
        except Exception:
            pass
        return str(value)

    def record_event(self, event_type: str, data: Any, current_dt: Any = None) -> None:
        payload = self._json_safe(deepcopy(data if isinstance(data, dict) else {"value": data}))
        if not isinstance(payload, dict):
            return
        self.ensure_day(current_dt or payload.get("dt") or payload.get("time"))
        row = {
            "event_type": str(event_type or ""),
            "captured_at": datetime.now().isoformat(timespec="seconds"),
            **payload,
        }
        if event_type == "zhongshu":
            self._signals.append(row)
            return
        if event_type == "menxia":
            self._risk_checks.append(row)
            return
        if event_type == "shangshu":
            self._orders.append(row)
            return
        if event_type == "trade_exec":
            self._fills.append(row)
            pnl = row.get("realized_pnl")
            if pnl is not None:
                self._pnl_timeseries.append({
                    "captured_at": row.get("captured_at"),
                    "time": row.get("time"),
                    "strategy_id": row.get("strategy_id"),
                    "direction": row.get("direction"),
                    "realized_pnl": pnl,
                    "current_position_qty": row.get("current_position_qty"),
                    "current_position_amount": row.get("current_position_amount"),
                })
            return
        if event_type == "fund_pool":
            self._pnl_timeseries.append({
                "captured_at": row.get("captured_at"),
                "updated_at": row.get("updated_at"),
                "fund_value": row.get("fund_value"),
                "cash": row.get("cash"),
                "holdings_value": row.get("holdings_value"),
                "trade_count": row.get("trade_count"),
            })

    def _strategy_payload(self, strategy: Any) -> Dict[str, Any]:
        return {
            "strategy_id": str(getattr(strategy, "id", "") or ""),
            "name": str(getattr(strategy, "name", "") or ""),
            "class_name": type(strategy).__name__,
            "trigger_timeframe": str(getattr(strategy, "trigger_timeframe", "1min") or "1min"),
            "params": self._json_safe(getattr(strategy, "params", {}) if hasattr(strategy, "params") else {}),
            "module": str(getattr(type(strategy), "__module__", "") or ""),
        }

    def build_meta(self, cabinet: Any, trade_date: Any) -> Dict[str, Any]:
        config_dict = {}
        try:
            cfg = getattr(cabinet, "config", None)
            if cfg is not None and hasattr(cfg, "to_dict"):
                config_dict = cfg.to_dict()
            elif isinstance(cfg, dict):
                config_dict = deepcopy(cfg)
        except Exception:
            config_dict = {}
        strategies = [self._strategy_payload(s) for s in list(getattr(cabinet, "strategies", []) or [])]
        active_ids = [str(x) for x in list(getattr(cabinet, "active_strategy_ids", []) or []) if str(x or "").strip()]
        return {
            "snapshot_scope": "live_daily",
            "market": self.market,
            "code": self.stock_code,
            "trade_date": self._day_text(trade_date),
            "provider_type": str(getattr(cabinet, "provider_type", "") or ""),
            "strategy_ids": active_ids,
            "strategies": strategies,
            "timeframes": sorted({str(x.get("trigger_timeframe", "1min")) for x in strategies if isinstance(x, dict)}),
            "config": config_dict,
            "risk": {
                "peak_fund_value": float(getattr(cabinet, "peak_fund_value", 0.0) or 0.0),
                "minute_close_confirm_enabled": bool(getattr(cabinet, "_minute_close_confirm_enabled", False)),
            },
        }

    def build_summary(self, cabinet: Any, trade_date: Any) -> Dict[str, Any]:
        top3 = sorted(
            [(k, int(v or 0)) for k, v in dict(getattr(cabinet, "_intraday_signal_counter", {}) or {}).items()],
            key=lambda x: (-x[1], x[0]),
        )[:3]
        return {
            "snapshot_scope": "live_daily",
            "market": self.market,
            "code": self.stock_code,
            "trade_date": self._day_text(trade_date),
            "signal_count": len(self._signals),
            "risk_check_count": len(self._risk_checks),
            "order_count": len(self._orders),
            "fill_count": len(self._fills),
            "pnl_point_count": len(self._pnl_timeseries),
            "top3_signals": [{"name": k, "count": v} for k, v in top3],
        }

    def build_positions_eod(self, cabinet: Any, trade_date: Any) -> Dict[str, Any]:
        rows = []
        fn = getattr(cabinet, "_position_snapshot_rows", None)
        if callable(fn):
            try:
                rows = fn() or []
            except Exception:
                rows = []
        return {
            "snapshot_scope": "live_daily",
            "trade_date": self._day_text(trade_date),
            "positions": self._json_safe(rows),
        }

    def build_fund_pool_eod(self, cabinet: Any) -> Dict[str, Any]:
        fn = getattr(cabinet, "get_fund_pool_snapshot", None)
        if callable(fn):
            try:
                payload = fn(include_transactions=True, tx_limit=5000)
                if isinstance(payload, dict):
                    return self._json_safe(payload)
            except Exception:
                pass
        return {}

    def archive_day(self, cabinet: Any, trade_date: Any, bars: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        meta = self.build_meta(cabinet, trade_date)
        summary = self.build_summary(cabinet, trade_date)
        positions_eod = self.build_positions_eod(cabinet, trade_date)
        fund_pool_eod = self.build_fund_pool_eod(cabinet)
        manifest = self.store.save_snapshot(
            market=self.market,
            code=self.stock_code,
            trade_date=trade_date,
            meta=meta,
            summary=summary,
            bars=[self._json_safe(x) for x in list(bars or []) if isinstance(x, dict)],
            signals=self._signals,
            risk_checks=self._risk_checks,
            orders=self._orders,
            fills=self._fills,
            pnl_timeseries=self._pnl_timeseries,
            positions_eod=positions_eod,
            fund_pool_eod=fund_pool_eod,
        )
        self.reset_day_buffers()
        return manifest
