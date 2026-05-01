from copy import deepcopy
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd

from src.consistency.replay.replay_store import ReplayStore
from src.consistency.storage.live_snapshot_store import LiveSnapshotStore


class SnapshotReplayProvider:
    def __init__(self, df: pd.DataFrame):
        self.df = df.copy() if isinstance(df, pd.DataFrame) else pd.DataFrame()
        self.last_error = ""

    def check_connectivity(self, code):
        return True, "ok"

    def _normalize_interval(self, interval: str) -> str:
        text = str(interval or "1min").strip()
        low = text.lower()
        if low in {"d", "1d", "day", "daily"}:
            return "D"
        return text

    def _range(self, start_time, end_time):
        if self.df is None or self.df.empty:
            return pd.DataFrame()
        df = self.df.copy()
        df["dt"] = pd.to_datetime(df["dt"], errors="coerce")
        start_dt = pd.to_datetime(start_time, errors="coerce")
        end_dt = pd.to_datetime(end_time, errors="coerce")
        if pd.isna(start_dt) or pd.isna(end_dt):
            return df.sort_values("dt").reset_index(drop=True)
        start_str = str(start_time or "")
        end_str = str(end_time or "")
        if len(start_str) <= 10:
            start_dt = start_dt.replace(hour=0, minute=0, second=0, microsecond=0)
        if len(end_str) <= 10:
            end_dt = end_dt.replace(hour=23, minute=59, second=59, microsecond=0)
        df = df[(df["dt"] >= start_dt) & (df["dt"] <= end_dt)]
        return df.sort_values("dt").reset_index(drop=True)

    def fetch_minute_data(self, code, start_time, end_time):
        return self._range(start_time, end_time)

    def fetch_daily_data(self, code, start_time, end_time):
        df = self._range(start_time, end_time)
        if df.empty:
            return pd.DataFrame()
        df = df.copy()
        df["day"] = df["dt"].dt.floor("D")
        out = df.groupby("day", as_index=False).agg({
            "code": "last",
            "dt": "last",
            "open": "first",
            "high": "max",
            "low": "min",
            "close": "last",
            "vol": "sum",
            "amount": "sum",
        })
        out["dt"] = out["day"]
        return out[["code", "dt", "open", "high", "low", "close", "vol", "amount"]]

    def fetch_kline_data(self, code, start_time, end_time, interval="1min"):
        iv = self._normalize_interval(interval)
        if iv == "D":
            return self.fetch_daily_data(code, start_time, end_time)
        return self.fetch_minute_data(code, start_time, end_time)

    def fetch_kline_data_strict(self, code, start_time, end_time, interval="1min"):
        return self.fetch_kline_data(code, start_time, end_time, interval=interval)


class ReplayBuilder:
    def __init__(
        self,
        snapshot_store: Optional[LiveSnapshotStore] = None,
        replay_store: Optional[ReplayStore] = None,
        consistency_root: str = "data/consistency",
    ):
        self.snapshot_store = snapshot_store or LiveSnapshotStore(consistency_root)
        self.replay_store = replay_store or ReplayStore(consistency_root)

    def _normalize_text_list(self, values: Optional[List[Any]]) -> List[str]:
        out: List[str] = []
        for value in list(values or []):
            text = str(value or "").strip()
            if text and text not in out:
                out.append(text)
        return out

    def load_snapshots(
        self,
        market: str,
        code: str,
        start_date: str,
        end_date: str,
        strategy_ids: Optional[List[str]] = None,
        timeframes: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        result = self.snapshot_store.list_snapshots(
            market=market,
            code=code,
            start_date=start_date,
            end_date=end_date,
            strategy_ids=self._normalize_text_list(strategy_ids),
            timeframes=self._normalize_text_list(timeframes),
            page=1,
            page_size=500,
        )
        items = result.get("items", []) if isinstance(result, dict) else []
        snapshots = []
        for item in sorted(items, key=lambda x: str(x.get("date", ""))):
            sid = str(item.get("snapshot_id", "") or "")
            detail = self.snapshot_store.get_snapshot(sid, include_rows=True)
            if isinstance(detail, dict) and detail.get("manifest"):
                snapshots.append(detail)
        return snapshots

    def load_snapshots_by_ids(self, snapshot_ids: List[str]) -> List[Dict[str, Any]]:
        snapshots = []
        for snapshot_id in self._normalize_text_list(snapshot_ids):
            detail = self.snapshot_store.get_snapshot(snapshot_id, include_rows=True)
            if isinstance(detail, dict) and detail.get("manifest"):
                snapshots.append(detail)
        return sorted(snapshots, key=lambda x: str((x.get("manifest") or {}).get("date", "")))

    def stitch_snapshots(self, snapshots: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not snapshots:
            return {
                "snapshot_ids": [],
                "bars": [],
                "meta": {},
                "summary": {},
                "segments": [],
                "fills": [],
                "risk_checks": [],
                "signals": [],
                "orders": [],
                "pnl_timeseries": [],
                "fund_pool_eod": {},
                "positions_eod": {"positions": []},
            }
        bars: List[Dict[str, Any]] = []
        fills: List[Dict[str, Any]] = []
        risk_checks: List[Dict[str, Any]] = []
        signals: List[Dict[str, Any]] = []
        orders: List[Dict[str, Any]] = []
        pnl_timeseries: List[Dict[str, Any]] = []
        snapshot_ids: List[str] = []
        segments: List[Dict[str, Any]] = []
        merged_summary = {
            "signal_count": 0,
            "risk_check_count": 0,
            "order_count": 0,
            "fill_count": 0,
            "pnl_point_count": 0,
        }
        base_meta = deepcopy(snapshots[0].get("meta", {})) if isinstance(snapshots[0].get("meta"), dict) else {}
        merged_strategy_ids = self._normalize_text_list(base_meta.get("strategy_ids") if isinstance(base_meta.get("strategy_ids"), list) else [])
        merged_timeframes = self._normalize_text_list(base_meta.get("timeframes") if isinstance(base_meta.get("timeframes"), list) else [])
        fund_pool_eod = {}
        positions_eod = {"positions": []}
        last_fp = None
        current_segment = None
        for snap in snapshots:
            manifest = snap.get("manifest", {}) if isinstance(snap.get("manifest"), dict) else {}
            meta = snap.get("meta", {}) if isinstance(snap.get("meta"), dict) else {}
            summary = snap.get("summary", {}) if isinstance(snap.get("summary"), dict) else {}
            snapshot_id = str(manifest.get("snapshot_id", "") or "")
            if snapshot_id:
                snapshot_ids.append(snapshot_id)
            bars.extend([x for x in list(snap.get("bars", []) or []) if isinstance(x, dict)])
            fills.extend([x for x in list(snap.get("fills", []) or []) if isinstance(x, dict)])
            risk_checks.extend([x for x in list(snap.get("risk_checks", []) or []) if isinstance(x, dict)])
            signals.extend([x for x in list(snap.get("signals", []) or []) if isinstance(x, dict)])
            orders.extend([x for x in list(snap.get("orders", []) or []) if isinstance(x, dict)])
            pnl_timeseries.extend([x for x in list(snap.get("pnl_timeseries", []) or []) if isinstance(x, dict)])
            for sid in self._normalize_text_list(meta.get("strategy_ids") if isinstance(meta.get("strategy_ids"), list) else []):
                if sid not in merged_strategy_ids:
                    merged_strategy_ids.append(sid)
            for tf in self._normalize_text_list(meta.get("timeframes") if isinstance(meta.get("timeframes"), list) else []):
                if tf not in merged_timeframes:
                    merged_timeframes.append(tf)
            for key in merged_summary.keys():
                merged_summary[key] += int(summary.get(key, 0) or 0)
            if isinstance(snap.get("fund_pool_eod"), dict):
                fund_pool_eod = deepcopy(snap.get("fund_pool_eod"))
            if isinstance(snap.get("positions_eod"), dict):
                positions_eod = deepcopy(snap.get("positions_eod"))
            fp = {
                "strategy": str(manifest.get("strategy_fingerprint", "") or ""),
                "config": str(manifest.get("config_fingerprint", "") or ""),
                "risk": str(manifest.get("risk_fingerprint", "") or ""),
            }
            if fp != last_fp:
                current_segment = {
                    "start_date": str(manifest.get("date", "") or ""),
                    "end_date": str(manifest.get("date", "") or ""),
                    "snapshot_ids": [snapshot_id],
                    "fingerprints": fp,
                }
                segments.append(current_segment)
                last_fp = fp
            else:
                current_segment["end_date"] = str(manifest.get("date", "") or current_segment.get("end_date", ""))
                current_segment["snapshot_ids"].append(snapshot_id)
        base_meta["strategy_ids"] = merged_strategy_ids
        base_meta["timeframes"] = merged_timeframes
        bars_df = pd.DataFrame(bars)
        if not bars_df.empty and "dt" in bars_df.columns:
            bars_df["dt"] = pd.to_datetime(bars_df["dt"], errors="coerce")
            bars_df = bars_df.dropna(subset=["dt"]).sort_values("dt")
            bars_df = bars_df.drop_duplicates(subset=["dt"], keep="last")
            bars = bars_df.to_dict("records")
        return {
            "snapshot_ids": snapshot_ids,
            "bars": bars,
            "meta": base_meta,
            "summary": merged_summary,
            "segments": segments,
            "fills": fills,
            "risk_checks": risk_checks,
            "signals": signals,
            "orders": orders,
            "pnl_timeseries": pnl_timeseries,
            "fund_pool_eod": fund_pool_eod,
            "positions_eod": positions_eod,
        }

    def build_replay_request_from_filters(
        self,
        market: str,
        code: str,
        start_date: str,
        end_date: str,
        strategy_ids: Optional[List[str]] = None,
        timeframes: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        snapshots = self.load_snapshots(
            market=market,
            code=code,
            start_date=start_date,
            end_date=end_date,
            strategy_ids=strategy_ids,
            timeframes=timeframes,
        )
        return self._build_replay_request_from_snapshots(
            market=market,
            code=code,
            start_date=start_date,
            end_date=end_date,
            snapshots=snapshots,
            strategy_ids=strategy_ids,
            timeframes=timeframes,
        )

    def build_replay_request_from_snapshot_ids(
        self,
        market: str,
        code: str,
        start_date: str,
        end_date: str,
        snapshot_ids: List[str],
        strategy_ids: Optional[List[str]] = None,
        timeframes: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        snapshots = self.load_snapshots_by_ids(snapshot_ids)
        return self._build_replay_request_from_snapshots(
            market=market,
            code=code,
            start_date=start_date,
            end_date=end_date,
            snapshots=snapshots,
            strategy_ids=strategy_ids,
            timeframes=timeframes,
        )

    def _build_replay_request_from_snapshots(
        self,
        market: str,
        code: str,
        start_date: str,
        end_date: str,
        snapshots: List[Dict[str, Any]],
        strategy_ids: Optional[List[str]] = None,
        timeframes: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        stitched = self.stitch_snapshots(snapshots)
        meta = stitched.get("meta", {}) if isinstance(stitched.get("meta"), dict) else {}
        snapshot_strategy_ids = self._normalize_text_list(meta.get("strategy_ids") if isinstance(meta.get("strategy_ids"), list) else [])
        strategy_filter = self._normalize_text_list(strategy_ids)
        if strategy_filter:
            selected_strategy_ids = [sid for sid in snapshot_strategy_ids if sid in strategy_filter]
        else:
            selected_strategy_ids = snapshot_strategy_ids
        bars_df = pd.DataFrame(stitched.get("bars", []))
        if not bars_df.empty:
            for col in ["open", "high", "low", "close", "vol", "amount"]:
                if col in bars_df.columns:
                    bars_df[col] = pd.to_numeric(bars_df[col], errors="coerce")
        provider = SnapshotReplayProvider(bars_df)
        return {
            "market": market,
            "code": code,
            "start_date": start_date,
            "end_date": end_date,
            "snapshot_ids": stitched.get("snapshot_ids", []),
            "segment_count": len(stitched.get("segments", [])),
            "segments": stitched.get("segments", []),
            "meta": meta,
            "summary": stitched.get("summary", {}),
            "strategy_ids": selected_strategy_ids,
            "requested_strategy_ids": strategy_filter,
            "requested_timeframes": self._normalize_text_list(timeframes),
            "provider": provider,
            "bars_df": bars_df,
            "snapshot_detail": {
                "manifest": {
                    "snapshot_id": "|".join(stitched.get("snapshot_ids", [])),
                    "date": start_date if start_date == end_date else f"{start_date} ~ {end_date}",
                },
                "meta": meta,
                "summary": stitched.get("summary", {}),
                "fills": stitched.get("fills", []),
                "risk_checks": stitched.get("risk_checks", []),
                "signals": stitched.get("signals", []),
                "orders": stitched.get("orders", []),
                "pnl_timeseries": stitched.get("pnl_timeseries", []),
                "fund_pool_eod": stitched.get("fund_pool_eod", {}),
                "positions_eod": stitched.get("positions_eod", {}),
                "bars": stitched.get("bars", []),
            },
        }

    def build_replay_request(self, market: str, code: str, start_date: str, end_date: str) -> Dict[str, Any]:
        return self.build_replay_request_from_filters(
            market=market,
            code=code,
            start_date=start_date,
            end_date=end_date,
        )
