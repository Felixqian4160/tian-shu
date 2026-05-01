from typing import Any, Dict, List, Optional, Tuple

import pandas as pd


class ConsistencyComparator:
    METRIC_KEYS = [
        "total_trades",
        "annualized_roi",
        "win_rate",
        "max_dd",
        "sharpe",
    ]
    STAGE_ORDER = ["signal", "risk", "order", "trade", "metrics"]

    def _safe_float(self, value: Any) -> float:
        try:
            return float(value or 0.0)
        except Exception:
            return 0.0

    def _safe_int(self, value: Any) -> int:
        try:
            return int(value or 0)
        except Exception:
            return 0

    def _safe_dt(self, value: Any):
        dt = pd.to_datetime(value, errors="coerce")
        return None if pd.isna(dt) else dt

    def _safe_text(self, value: Any) -> str:
        return str(value or "").strip()

    def _safe_upper(self, value: Any) -> str:
        return self._safe_text(value).upper()

    def _safe_lower(self, value: Any) -> str:
        return self._safe_text(value).lower()

    def _as_rows(self, value: Any) -> List[Dict[str, Any]]:
        return [row for row in list(value or []) if isinstance(row, dict)]

    def _event_dt_text(self, row: Dict[str, Any]) -> str:
        return self._safe_text(row.get("event_dt") or row.get("dt") or row.get("time") or row.get("created_at"))

    def _delay_seconds(self, left: Dict[str, Any], right: Dict[str, Any]) -> float:
        left_dt = self._safe_dt(left.get("dt"))
        right_dt = self._safe_dt(right.get("dt"))
        if left_dt is None or right_dt is None:
            return 0.0
        return round((right_dt - left_dt).total_seconds(), 3)

    def _id_tokens(self, row: Dict[str, Any]) -> List[Tuple[str, str]]:
        tokens: List[Tuple[str, str]] = []
        for key in [
            "signal_id",
            "risk_check_id",
            "order_id",
            "fill_id",
            "trace_id",
            "parent_signal_id",
            "parent_order_id",
        ]:
            value = self._safe_text(row.get(key))
            if value:
                tokens.append((key, value))
        return tokens

    def _entity_key(self, row: Dict[str, Any]) -> str:
        for _, value in self._id_tokens(row):
            if value:
                return value
        parts = [
            self._safe_text(row.get("strategy_id")),
            self._safe_text(row.get("direction") or row.get("decision")),
            self._safe_text(row.get("dt")),
            str(self._safe_int(row.get("qty"))) if row.get("qty") not in (None, "") else "",
        ]
        text = "|".join([part for part in parts if part])
        return text or "unknown"

    def _event_summary(self, stage: str, row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "stage": stage,
            "dt": self._safe_text(row.get("dt")),
            "strategy_id": self._safe_text(row.get("strategy_id")),
            "entity_key": self._entity_key(row),
            "direction": self._safe_text(row.get("direction")),
            "decision": self._safe_text(row.get("decision")),
            "status": self._safe_text(row.get("status")),
            "qty": self._safe_int(row.get("qty")),
            "price": self._safe_float(row.get("price")),
        }

    def _normalize_live_signal_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "dt": self._event_dt_text(row),
            "event_dt": self._event_dt_text(row),
            "strategy_id": self._safe_text(row.get("strategy_id")),
            "direction": self._safe_upper(row.get("direction")),
            "signal_type": self._safe_text(row.get("signal_type") or row.get("signal_name") or row.get("signal")),
            "signal_id": self._safe_text(row.get("signal_id")),
            "trace_id": self._safe_text(row.get("trace_id")),
            "parent_signal_id": self._safe_text(row.get("parent_signal_id")),
            "parent_order_id": self._safe_text(row.get("parent_order_id")),
            "qty": self._safe_int(row.get("qty", row.get("quantity", 0))),
        }

    def _normalize_live_risk_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "dt": self._event_dt_text(row),
            "event_dt": self._event_dt_text(row),
            "strategy_id": self._safe_text(row.get("strategy_id")),
            "direction": self._safe_upper(row.get("direction")),
            "decision": self._safe_lower(row.get("decision")),
            "reason": self._safe_text(row.get("reason") or row.get("stop_type")),
            "risk_check_id": self._safe_text(row.get("risk_check_id")),
            "trace_id": self._safe_text(row.get("trace_id")),
            "parent_signal_id": self._safe_text(row.get("parent_signal_id")),
            "qty": self._safe_int(row.get("qty", row.get("quantity", 0))),
        }

    def _normalize_live_order_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        price = self._safe_float(row.get("price", row.get("order_price", 0.0)))
        return {
            "dt": self._event_dt_text(row),
            "event_dt": self._event_dt_text(row),
            "strategy_id": self._safe_text(row.get("strategy_id")),
            "direction": self._safe_upper(row.get("direction")),
            "status": self._safe_lower(row.get("status") or row.get("order_status")),
            "price": price,
            "qty": self._safe_int(row.get("qty", row.get("quantity", 0))),
            "order_id": self._safe_text(row.get("order_id")),
            "trace_id": self._safe_text(row.get("trace_id")),
            "parent_signal_id": self._safe_text(row.get("parent_signal_id")),
            "parent_order_id": self._safe_text(row.get("parent_order_id")),
        }

    def _normalize_live_fill_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        price = self._safe_float(row.get("actual_price", row.get("price", 0.0)))
        expected_price = self._safe_float(row.get("expected_price", row.get("price", 0.0)))
        return {
            "dt": self._event_dt_text(row),
            "event_dt": self._event_dt_text(row),
            "strategy_id": self._safe_text(row.get("strategy_id")),
            "direction": self._safe_upper(row.get("direction")),
            "price": price,
            "expected_price": expected_price,
            "slippage": round(price - expected_price, 6),
            "qty": self._safe_int(row.get("qty", row.get("quantity", 0))),
            "realized_pnl": self._safe_float(row.get("realized_pnl", 0.0)),
            "fill_id": self._safe_text(row.get("fill_id")),
            "order_id": self._safe_text(row.get("order_id")),
            "trace_id": self._safe_text(row.get("trace_id")),
            "parent_signal_id": self._safe_text(row.get("parent_signal_id")),
            "parent_order_id": self._safe_text(row.get("parent_order_id")),
        }

    def _normalize_replay_signal_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "dt": self._event_dt_text(row),
            "event_dt": self._event_dt_text(row),
            "strategy_id": self._safe_text(row.get("strategy_id")),
            "direction": self._safe_upper(row.get("direction")),
            "signal_type": self._safe_text(row.get("signal_type") or row.get("signal_name") or row.get("signal")),
            "signal_id": self._safe_text(row.get("signal_id")),
            "trace_id": self._safe_text(row.get("trace_id")),
            "parent_signal_id": self._safe_text(row.get("parent_signal_id")),
            "parent_order_id": self._safe_text(row.get("parent_order_id")),
            "qty": self._safe_int(row.get("qty", row.get("quantity", 0))),
        }

    def _normalize_replay_risk_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "dt": self._event_dt_text(row),
            "event_dt": self._event_dt_text(row),
            "strategy_id": self._safe_text(row.get("strategy_id")),
            "direction": self._safe_upper(row.get("direction")),
            "decision": self._safe_lower(row.get("decision")),
            "reason": self._safe_text(row.get("reason") or row.get("stop_type")),
            "risk_check_id": self._safe_text(row.get("risk_check_id")),
            "trace_id": self._safe_text(row.get("trace_id")),
            "parent_signal_id": self._safe_text(row.get("parent_signal_id")),
            "qty": self._safe_int(row.get("qty", row.get("quantity", 0))),
        }

    def _normalize_replay_order_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "dt": self._event_dt_text(row),
            "event_dt": self._event_dt_text(row),
            "strategy_id": self._safe_text(row.get("strategy_id")),
            "direction": self._safe_upper(row.get("direction")),
            "status": self._safe_lower(row.get("status") or row.get("order_status")),
            "price": self._safe_float(row.get("price", row.get("order_price", 0.0))),
            "qty": self._safe_int(row.get("qty", row.get("quantity", 0))),
            "order_id": self._safe_text(row.get("order_id")),
            "trace_id": self._safe_text(row.get("trace_id")),
            "parent_signal_id": self._safe_text(row.get("parent_signal_id")),
            "parent_order_id": self._safe_text(row.get("parent_order_id")),
        }

    def _normalize_replay_fill_row(self, row: Dict[str, Any], strategy_id: str = "") -> Dict[str, Any]:
        price = self._safe_float(row.get("actual_price", row.get("price", 0.0)))
        expected_price = self._safe_float(row.get("expected_price", row.get("price", 0.0)))
        return {
            "dt": self._event_dt_text(row),
            "event_dt": self._event_dt_text(row),
            "strategy_id": self._safe_text(row.get("strategy_id") or strategy_id),
            "direction": self._safe_upper(row.get("direction")),
            "price": price,
            "expected_price": expected_price or price,
            "slippage": round(price - (expected_price or price), 6),
            "qty": self._safe_int(row.get("qty", row.get("quantity", 0))),
            "realized_pnl": self._safe_float(row.get("realized_pnl", row.get("pnl", 0.0))),
            "fill_id": self._safe_text(row.get("fill_id")),
            "order_id": self._safe_text(row.get("order_id")),
            "trace_id": self._safe_text(row.get("trace_id")),
            "parent_signal_id": self._safe_text(row.get("parent_signal_id")),
            "parent_order_id": self._safe_text(row.get("parent_order_id")),
        }

    def _signal_rows_from_live(self, snapshot_detail: Dict[str, Any]) -> List[Dict[str, Any]]:
        return [self._normalize_live_signal_row(row) for row in self._as_rows(snapshot_detail.get("signals"))]

    def _risk_rows_from_live(self, snapshot_detail: Dict[str, Any]) -> List[Dict[str, Any]]:
        return [self._normalize_live_risk_row(row) for row in self._as_rows(snapshot_detail.get("risk_checks"))]

    def _order_rows_from_live(self, snapshot_detail: Dict[str, Any]) -> List[Dict[str, Any]]:
        return [self._normalize_live_order_row(row) for row in self._as_rows(snapshot_detail.get("orders"))]

    def _trade_rows_from_live(self, snapshot_detail: Dict[str, Any]) -> List[Dict[str, Any]]:
        return [self._normalize_live_fill_row(row) for row in self._as_rows(snapshot_detail.get("fills"))]

    def _signal_rows_from_replay(self, replay_result: Dict[str, Any]) -> List[Dict[str, Any]]:
        return [self._normalize_replay_signal_row(row) for row in self._as_rows(replay_result.get("replay_signals"))]

    def _risk_rows_from_replay(self, replay_result: Dict[str, Any]) -> List[Dict[str, Any]]:
        return [self._normalize_replay_risk_row(row) for row in self._as_rows(replay_result.get("replay_risk_checks"))]

    def _order_rows_from_replay(self, replay_result: Dict[str, Any]) -> List[Dict[str, Any]]:
        return [self._normalize_replay_order_row(row) for row in self._as_rows(replay_result.get("replay_orders"))]

    def _trade_rows_from_replay(self, replay_result: Dict[str, Any]) -> List[Dict[str, Any]]:
        replay_rows = self._as_rows(replay_result.get("replay_fills"))
        if replay_rows:
            return [self._normalize_replay_fill_row(row) for row in replay_rows]
        out = []
        strategy_reports = replay_result.get("strategy_reports", {}) if isinstance(replay_result, dict) else {}
        if isinstance(strategy_reports, list):
            iterable = strategy_reports
        elif isinstance(strategy_reports, dict):
            iterable = strategy_reports.values()
        else:
            iterable = []
        for report in iterable:
            if not isinstance(report, dict):
                continue
            strategy_id = self._safe_text(report.get("strategy_id"))
            trades = report.get("trade_details", []) if isinstance(report.get("trade_details"), list) else []
            for row in trades:
                if not isinstance(row, dict):
                    continue
                out.append(self._normalize_replay_fill_row(row, strategy_id=strategy_id))
        return out

    def _match_score(self, stage: str, live: Dict[str, Any], replay: Dict[str, Any]) -> Tuple[int, str]:
        live_tokens = set(self._id_tokens(live))
        replay_tokens = set(self._id_tokens(replay))
        if live_tokens and replay_tokens and live_tokens.intersection(replay_tokens):
            return 100, "explicit_id"
        score = 0
        if self._safe_text(live.get("strategy_id")) and self._safe_text(live.get("strategy_id")) == self._safe_text(replay.get("strategy_id")):
            score += 3
        if self._safe_text(live.get("direction")) and self._safe_text(live.get("direction")) == self._safe_text(replay.get("direction")):
            score += 2
        if stage == "risk" and self._safe_text(live.get("decision")) and self._safe_text(live.get("decision")) == self._safe_text(replay.get("decision")):
            score += 2
        live_qty = self._safe_int(live.get("qty"))
        replay_qty = self._safe_int(replay.get("qty"))
        if (live_qty or replay_qty) and live_qty == replay_qty:
            score += 2
        live_price = self._safe_float(live.get("price"))
        replay_price = self._safe_float(replay.get("price"))
        if (live_price or replay_price) and abs(replay_price - live_price) <= 1e-9:
            score += 1
        left_dt = self._safe_dt(live.get("dt"))
        right_dt = self._safe_dt(replay.get("dt"))
        if left_dt is not None and right_dt is not None:
            delay_seconds = abs((right_dt - left_dt).total_seconds())
            if delay_seconds <= 1:
                score += 3
            elif delay_seconds <= 60:
                score += 2
            elif delay_seconds <= 300:
                score += 1
        threshold = {"signal": 4, "risk": 3, "order": 4, "trade": 5}.get(stage, 4)
        return (score, "composite") if score >= threshold else (0, "unmatched")

    def _match_rows(self, stage: str, live_rows: List[Dict[str, Any]], replay_rows: List[Dict[str, Any]]) -> List[Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], str]]:
        pairs: List[Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], str]] = []
        used_replay = set()
        for live in live_rows:
            best_idx = None
            best_score = 0
            best_match_type = "unmatched"
            for idx, replay in enumerate(replay_rows):
                if idx in used_replay:
                    continue
                score, match_type = self._match_score(stage, live, replay)
                if score > best_score:
                    best_idx = idx
                    best_score = score
                    best_match_type = match_type
            if best_idx is None:
                pairs.append((live, None, "live_only"))
                continue
            used_replay.add(best_idx)
            pairs.append((live, replay_rows[best_idx], best_match_type))
        for idx, replay in enumerate(replay_rows):
            if idx not in used_replay:
                pairs.append((None, replay, "replay_only"))
        return pairs

    def _generic_row_diff(self, stage: str, live: Optional[Dict[str, Any]], replay: Optional[Dict[str, Any]], match_type: str, index: int) -> Dict[str, Any]:
        live = live or {}
        replay = replay or {}
        missing_live = not bool(live)
        missing_replay = not bool(replay)
        mismatch_fields: List[str] = []
        if missing_live:
            mismatch_fields.append("missing_live")
        if missing_replay:
            mismatch_fields.append("missing_replay")
        if not missing_live and not missing_replay:
            if stage == "signal":
                if self._safe_text(live.get("direction")) != self._safe_text(replay.get("direction")):
                    mismatch_fields.append("direction")
                if self._safe_text(live.get("signal_type")) != self._safe_text(replay.get("signal_type")):
                    mismatch_fields.append("signal_type")
                if abs(self._delay_seconds(live, replay)) > 0.5:
                    mismatch_fields.append("timing")
            elif stage == "risk":
                if self._safe_text(live.get("decision")) != self._safe_text(replay.get("decision")):
                    mismatch_fields.append("decision")
                if self._safe_text(live.get("reason")) != self._safe_text(replay.get("reason")):
                    mismatch_fields.append("reason")
                if abs(self._delay_seconds(live, replay)) > 0.5:
                    mismatch_fields.append("timing")
            elif stage == "order":
                if self._safe_text(live.get("direction")) != self._safe_text(replay.get("direction")):
                    mismatch_fields.append("direction")
                if self._safe_int(live.get("qty")) != self._safe_int(replay.get("qty")):
                    mismatch_fields.append("quantity")
                if abs(self._safe_float(replay.get("price")) - self._safe_float(live.get("price"))) > 1e-9:
                    mismatch_fields.append("price")
                if self._safe_text(live.get("status")) != self._safe_text(replay.get("status")):
                    mismatch_fields.append("status")
                if abs(self._delay_seconds(live, replay)) > 0.5:
                    mismatch_fields.append("timing")
        entity_source = live if live else replay
        return {
            "index": index,
            "entity_key": self._entity_key(entity_source),
            "match_type": match_type,
            "live": live,
            "replay": replay,
            "delay_seconds": self._delay_seconds(live, replay) if live and replay else 0.0,
            "mismatch_fields": mismatch_fields,
            "mismatch": bool(mismatch_fields),
            "status": "replay_only" if missing_live else ("live_only" if missing_replay else "matched"),
        }

    def _compare_stage(self, stage: str, live_rows: List[Dict[str, Any]], replay_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
        items = [self._generic_row_diff(stage, live, replay, match_type, idx) for idx, (live, replay, match_type) in enumerate(self._match_rows(stage, live_rows, replay_rows))]
        mismatch_items = [item for item in items if item.get("mismatch")]
        field_mismatch_totals: Dict[str, int] = {}
        for item in mismatch_items:
            for field in item.get("mismatch_fields", []):
                field_mismatch_totals[field] = field_mismatch_totals.get(field, 0) + 1
        return {
            "live_count": len(live_rows),
            "replay_count": len(replay_rows),
            "matched_count": len([item for item in items if item.get("status") == "matched"]),
            "live_only_count": len([item for item in items if item.get("status") == "live_only"]),
            "replay_only_count": len([item for item in items if item.get("status") == "replay_only"]),
            "mismatch_count": len(mismatch_items),
            "field_mismatch_totals": field_mismatch_totals,
            "items": items,
        }

    def compare_trades(self, snapshot_detail: Dict[str, Any], replay_result: Dict[str, Any]) -> Dict[str, Any]:
        live_rows = self._trade_rows_from_live(snapshot_detail)
        replay_rows = self._trade_rows_from_replay(replay_result)
        items = []
        mismatch_count = 0
        slippage_mismatch_count = 0
        timing_mismatch_count = 0
        quantity_mismatch_count = 0
        pnl_mismatch_count = 0
        direction_mismatch_count = 0
        price_mismatch_count = 0
        live_only_count = 0
        replay_only_count = 0
        for idx, (live, replay, match_type) in enumerate(self._match_rows("trade", live_rows, replay_rows)):
            live = live or {}
            replay = replay or {}
            missing_live = not bool(live)
            missing_replay = not bool(replay)
            delta_price = round(self._safe_float(replay.get("price")) - self._safe_float(live.get("price")), 6)
            delta_qty = self._safe_int(replay.get("qty")) - self._safe_int(live.get("qty"))
            delta_pnl = round(self._safe_float(replay.get("realized_pnl")) - self._safe_float(live.get("realized_pnl")), 6)
            delta_slippage = round(self._safe_float(replay.get("slippage")) - self._safe_float(live.get("slippage")), 6)
            delay_seconds = self._delay_seconds(live, replay) if live and replay else 0.0
            direction_mismatch = not missing_live and not missing_replay and self._safe_text(live.get("direction")) != self._safe_text(replay.get("direction"))
            quantity_mismatch = not missing_live and not missing_replay and delta_qty != 0
            price_mismatch = not missing_live and not missing_replay and abs(delta_price) > 1e-9
            slippage_mismatch = not missing_live and not missing_replay and (abs(delta_slippage) > 1e-9 or abs(delta_price) > 1e-9)
            timing_mismatch = not missing_live and not missing_replay and abs(delay_seconds) > 0.5
            pnl_mismatch = not missing_live and not missing_replay and abs(delta_pnl) > 1e-9
            mismatch_fields: List[str] = []
            if missing_live:
                mismatch_fields.append("missing_live")
            if missing_replay:
                mismatch_fields.append("missing_replay")
            if direction_mismatch:
                mismatch_fields.append("direction")
            if quantity_mismatch:
                mismatch_fields.append("quantity")
            if price_mismatch:
                mismatch_fields.append("price")
            if slippage_mismatch:
                mismatch_fields.append("slippage")
            if timing_mismatch:
                mismatch_fields.append("timing")
            if pnl_mismatch:
                mismatch_fields.append("pnl")
            mismatch = bool(mismatch_fields)
            if mismatch:
                mismatch_count += 1
            if missing_replay:
                live_only_count += 1
            if missing_live:
                replay_only_count += 1
            if direction_mismatch:
                direction_mismatch_count += 1
            if quantity_mismatch:
                quantity_mismatch_count += 1
            if price_mismatch:
                price_mismatch_count += 1
            if slippage_mismatch:
                slippage_mismatch_count += 1
            if timing_mismatch:
                timing_mismatch_count += 1
            if pnl_mismatch:
                pnl_mismatch_count += 1
            entity_source = live if live else replay
            items.append({
                "index": idx,
                "entity_key": self._entity_key(entity_source),
                "match_type": match_type,
                "live": live,
                "replay": replay,
                "delta_price": delta_price,
                "delta_qty": delta_qty,
                "delta_realized_pnl": delta_pnl,
                "delta_slippage": delta_slippage,
                "delay_seconds": delay_seconds,
                "mismatch": mismatch,
                "mismatch_fields": mismatch_fields,
                "status": "replay_only" if missing_live else ("live_only" if missing_replay else "matched"),
                "direction_mismatch": direction_mismatch,
                "quantity_mismatch": quantity_mismatch,
                "price_mismatch": price_mismatch,
                "slippage_mismatch": slippage_mismatch,
                "timing_mismatch": timing_mismatch,
                "pnl_mismatch": pnl_mismatch,
            })
        risk_rows = self._risk_rows_from_live(snapshot_detail)
        risk_reject_count = len([x for x in risk_rows if str(x.get("decision", "")) in {"rejected", "stop_triggered"}])
        return {
            "live_trade_count": len(live_rows),
            "replay_trade_count": len(replay_rows),
            "matched_count": len([item for item in items if item.get("status") == "matched"]),
            "live_only_count": live_only_count,
            "replay_only_count": replay_only_count,
            "mismatch_count": mismatch_count,
            "direction_mismatch_count": direction_mismatch_count,
            "quantity_mismatch_count": quantity_mismatch_count,
            "price_mismatch_count": price_mismatch_count,
            "slippage_mismatch_count": slippage_mismatch_count,
            "timing_mismatch_count": timing_mismatch_count,
            "pnl_mismatch_count": pnl_mismatch_count,
            "live_risk_reject_count": risk_reject_count,
            "items": items,
        }

    def compare_metrics(self, snapshot_detail: Dict[str, Any], replay_result: Dict[str, Any]) -> Dict[str, Any]:
        live_fund = snapshot_detail.get("fund_pool_eod", {}) if isinstance(snapshot_detail, dict) else {}
        replay_summary = replay_result.get("summary", {}) if isinstance(replay_result, dict) else {}
        live_metrics = {
            "total_trades": self._safe_int(live_fund.get("trade_count", 0)),
            "annualized_roi": self._safe_float(live_fund.get("annualized_roi", 0.0)),
            "win_rate": self._safe_float(live_fund.get("win_rate", 0.0)),
            "max_dd": self._safe_float(live_fund.get("max_dd", 0.0)),
            "sharpe": self._safe_float(live_fund.get("sharpe", 0.0)),
        }
        replay_metrics = {
            "total_trades": self._safe_int(replay_summary.get("total_trades", 0)),
            "annualized_roi": self._safe_float(replay_summary.get("annualized_roi", 0.0)),
            "win_rate": self._safe_float(replay_summary.get("win_rate", 0.0)),
            "max_dd": self._safe_float(replay_summary.get("max_dd", 0.0)),
            "sharpe": self._safe_float(replay_summary.get("sharpe", 0.0)),
        }
        items = []
        mismatch_count = 0
        for key in self.METRIC_KEYS:
            live_value = live_metrics.get(key, 0)
            replay_value = replay_metrics.get(key, 0)
            delta = round(self._safe_float(replay_value) - self._safe_float(live_value), 6)
            mismatch = abs(delta) > (0.0 if key == "total_trades" else 0.001)
            if mismatch:
                mismatch_count += 1
            items.append({
                "metric": key,
                "live": live_value,
                "replay": replay_value,
                "delta": delta,
                "mismatch": mismatch,
            })
        return {
            "live": live_metrics,
            "replay": replay_metrics,
            "mismatch_count": mismatch_count,
            "items": items,
        }

    def infer_root_causes(self, trade_diff: Dict[str, Any], metrics_diff: Dict[str, Any], signal_diff: Dict[str, Any], risk_diff: Dict[str, Any], order_diff: Dict[str, Any]) -> List[str]:
        tags = []
        if int(signal_diff.get("mismatch_count", 0) or 0) > 0 or int(signal_diff.get("live_only_count", 0) or 0) > 0 or int(signal_diff.get("replay_only_count", 0) or 0) > 0:
            tags.append("signal_count_drift")
        if int(trade_diff.get("direction_mismatch_count", 0) or 0) > 0:
            tags.append("signal_direction_drift")
        if int(risk_diff.get("mismatch_count", 0) or 0) > 0 or int(risk_diff.get("live_only_count", 0) or 0) > 0 or int(risk_diff.get("replay_only_count", 0) or 0) > 0:
            tags.append("risk_rule_drift")
        if int(order_diff.get("mismatch_count", 0) or 0) > 0 or int(order_diff.get("live_only_count", 0) or 0) > 0 or int(order_diff.get("replay_only_count", 0) or 0) > 0:
            tags.append("execution_mismatch")
        if int(trade_diff.get("quantity_mismatch_count", 0) or 0) > 0:
            tags.append("position_size_mismatch")
        if int(trade_diff.get("slippage_mismatch_count", 0) or 0) > 0:
            tags.append("slippage_drift")
        if int(trade_diff.get("timing_mismatch_count", 0) or 0) > 0:
            tags.append("timing_drift")
        if int(trade_diff.get("live_risk_reject_count", 0) or 0) > 0:
            tags.append("live_risk_intercept")
        if int(trade_diff.get("pnl_mismatch_count", 0) or 0) > 0:
            tags.append("pnl_drift")
        items = metrics_diff.get("items", []) if isinstance(metrics_diff, dict) else []
        metric_delta = {str(x.get("metric", "")): self._safe_float(x.get("delta", 0.0)) for x in items if isinstance(x, dict)}
        if abs(metric_delta.get("annualized_roi", 0.0)) > 0.001:
            tags.append("performance_drift")
        if abs(metric_delta.get("max_dd", 0.0)) > 0.001:
            tags.append("risk_profile_drift")
        if not tags:
            tags.append("no_material_diff")
        deduped = []
        seen = set()
        for tag in tags:
            if tag in seen:
                continue
            seen.add(tag)
            deduped.append(tag)
        return deduped

    def _first_mismatch_item(self, diff: Dict[str, Any]) -> Dict[str, Any]:
        items = diff.get("items", []) if isinstance(diff, dict) else []
        mismatches = [item for item in items if isinstance(item, dict) and item.get("mismatch")]
        if not mismatches:
            return {}
        sorted_items = sorted(
            mismatches,
            key=lambda item: (
                self._safe_dt((item.get("live") or {}).get("dt") or (item.get("replay") or {}).get("dt")) or pd.Timestamp.max,
                self._safe_text(item.get("entity_key")),
            ),
        )
        return sorted_items[0] if sorted_items else {}

    def build_first_divergence(self, signal_diff: Dict[str, Any], risk_diff: Dict[str, Any], order_diff: Dict[str, Any], trade_diff: Dict[str, Any], metrics_diff: Dict[str, Any]) -> Dict[str, Any]:
        stage_map = {
            "signal": signal_diff,
            "risk": risk_diff,
            "order": order_diff,
            "trade": trade_diff,
        }
        for stage in self.STAGE_ORDER:
            if stage == "metrics":
                metric_item = next((item for item in metrics_diff.get("items", []) if isinstance(item, dict) and item.get("mismatch")), None)
                if metric_item:
                    return {
                        "stage": "metrics",
                        "dt": "",
                        "strategy_id": "",
                        "entity_key": self._safe_text(metric_item.get("metric")),
                        "reason_code": f"metric_{self._safe_text(metric_item.get('metric'))}_drift",
                        "evidence": {
                            "metric": self._safe_text(metric_item.get("metric")),
                            "live": metric_item.get("live"),
                            "replay": metric_item.get("replay"),
                            "delta": metric_item.get("delta"),
                        },
                    }
                continue
            diff = stage_map.get(stage, {})
            if int(diff.get("mismatch_count", 0) or 0) <= 0:
                continue
            item = self._first_mismatch_item(diff)
            live = item.get("live") if isinstance(item.get("live"), dict) else {}
            replay = item.get("replay") if isinstance(item.get("replay"), dict) else {}
            mismatch_fields = [self._safe_text(field) for field in item.get("mismatch_fields", []) if self._safe_text(field)]
            reason_field = mismatch_fields[0] if mismatch_fields else "difference"
            strategy_id = self._safe_text(live.get("strategy_id") or replay.get("strategy_id"))
            dt_text = self._safe_text(live.get("dt") or replay.get("dt"))
            return {
                "stage": stage,
                "dt": dt_text,
                "strategy_id": strategy_id,
                "entity_key": self._safe_text(item.get("entity_key")),
                "reason_code": f"{stage}_{reason_field}",
                "evidence": {
                    "match_type": self._safe_text(item.get("match_type")),
                    "status": self._safe_text(item.get("status")),
                    "mismatch_fields": mismatch_fields,
                    "live": self._event_summary(stage, live) if live else {},
                    "replay": self._event_summary(stage, replay) if replay else {},
                },
            }
        return {
            "stage": "none",
            "dt": "",
            "strategy_id": "",
            "entity_key": "",
            "reason_code": "no_material_diff",
            "evidence": {},
        }

    def build_timeline_excerpt(self, signal_diff: Dict[str, Any], risk_diff: Dict[str, Any], order_diff: Dict[str, Any], trade_diff: Dict[str, Any], metrics_diff: Dict[str, Any], first_divergence: Dict[str, Any]) -> List[Dict[str, Any]]:
        stage = self._safe_text(first_divergence.get("stage"))
        stage_map = {
            "signal": signal_diff,
            "risk": risk_diff,
            "order": order_diff,
            "trade": trade_diff,
        }
        if stage == "metrics":
            return [
                {
                    "stage": "metrics",
                    "entity_key": self._safe_text(item.get("metric")),
                    "dt": "",
                    "status": "metric_mismatch" if item.get("mismatch") else "metric_match",
                    "mismatch_fields": ["delta"] if item.get("mismatch") else [],
                    "live": {"metric": item.get("metric"), "value": item.get("live")},
                    "replay": {"metric": item.get("metric"), "value": item.get("replay")},
                }
                for item in metrics_diff.get("items", [])[:5]
                if isinstance(item, dict)
            ]
        diff = stage_map.get(stage, {})
        items = [item for item in diff.get("items", []) if isinstance(item, dict)]
        mismatches = [item for item in items if item.get("mismatch")]
        source = mismatches[:5] if mismatches else items[:5]
        out = []
        for item in source:
            live = item.get("live") if isinstance(item.get("live"), dict) else {}
            replay = item.get("replay") if isinstance(item.get("replay"), dict) else {}
            out.append({
                "stage": stage,
                "entity_key": self._safe_text(item.get("entity_key")),
                "dt": self._safe_text(live.get("dt") or replay.get("dt")),
                "status": self._safe_text(item.get("status")),
                "mismatch_fields": [self._safe_text(field) for field in item.get("mismatch_fields", []) if self._safe_text(field)],
                "live": self._event_summary(stage, live) if live else {},
                "replay": self._event_summary(stage, replay) if replay else {},
            })
        return out

    def build_root_cause_candidates(self, signal_diff: Dict[str, Any], risk_diff: Dict[str, Any], order_diff: Dict[str, Any], trade_diff: Dict[str, Any], metrics_diff: Dict[str, Any], first_divergence: Dict[str, Any]) -> List[Dict[str, Any]]:
        candidates: List[Dict[str, Any]] = []

        def add_candidate(candidate: str, evidence: List[str], confidence: float, checks: List[str]):
            if not evidence:
                return
            candidates.append({
                "candidate": candidate,
                "evidence": evidence,
                "confidence": round(max(0.0, min(confidence, 0.99)), 2),
                "recommended_next_checks": checks,
            })

        signal_evidence = []
        if int(signal_diff.get("live_only_count", 0) or 0) > 0:
            signal_evidence.append(f"实盘信号存在 {int(signal_diff.get('live_only_count', 0) or 0)} 条，但回测未复现")
        if int(signal_diff.get("replay_only_count", 0) or 0) > 0:
            signal_evidence.append(f"回测多出 {int(signal_diff.get('replay_only_count', 0) or 0)} 条信号")
        if int(signal_diff.get("mismatch_count", 0) or 0) > 0:
            signal_evidence.append(f"信号阶段共有 {int(signal_diff.get('mismatch_count', 0) or 0)} 处差异")
        add_candidate(
            "signal_generation_drift",
            signal_evidence,
            0.92 if self._safe_text(first_divergence.get("stage")) == "signal" else 0.72,
            ["检查信号条件、指标口径与交易时段过滤是否一致", "核对参与比较的策略ID和时间框是否一致"],
        )

        risk_evidence = []
        if int(risk_diff.get("live_only_count", 0) or 0) > 0:
            risk_evidence.append(f"实盘风控记录存在 {int(risk_diff.get('live_only_count', 0) or 0)} 条，回测侧缺失")
        if int(risk_diff.get("replay_only_count", 0) or 0) > 0:
            risk_evidence.append(f"回测风控记录多出 {int(risk_diff.get('replay_only_count', 0) or 0)} 条")
        if int(risk_diff.get("mismatch_count", 0) or 0) > 0:
            risk_evidence.append(f"风控阶段共有 {int(risk_diff.get('mismatch_count', 0) or 0)} 处差异")
        if int(trade_diff.get("live_risk_reject_count", 0) or 0) > 0:
            risk_evidence.append(f"实盘出现 {int(trade_diff.get('live_risk_reject_count', 0) or 0)} 次风控拦截")
        add_candidate(
            "risk_gate_drift",
            risk_evidence,
            0.91 if self._safe_text(first_divergence.get("stage")) == "risk" else 0.74,
            ["检查风控阈值、仓位上限和禁买条件是否一致", "确认回测是否完整复现实盘风控前置条件"],
        )

        order_evidence = []
        if int(order_diff.get("live_only_count", 0) or 0) > 0:
            order_evidence.append(f"实盘委托存在 {int(order_diff.get('live_only_count', 0) or 0)} 条，但回测未生成")
        if int(order_diff.get("replay_only_count", 0) or 0) > 0:
            order_evidence.append(f"回测多出 {int(order_diff.get('replay_only_count', 0) or 0)} 条委托")
        if int(order_diff.get("mismatch_count", 0) or 0) > 0:
            order_evidence.append(f"委托阶段共有 {int(order_diff.get('mismatch_count', 0) or 0)} 处差异")
        add_candidate(
            "order_generation_drift",
            order_evidence,
            0.89 if self._safe_text(first_divergence.get("stage")) == "order" else 0.71,
            ["检查委托价格、数量和状态流转逻辑", "确认撮合前的订单裁剪与分批逻辑是否一致"],
        )

        trade_evidence = []
        if int(trade_diff.get("live_only_count", 0) or 0) > 0:
            trade_evidence.append(f"实盘成交存在 {int(trade_diff.get('live_only_count', 0) or 0)} 条，回测未复现")
        if int(trade_diff.get("replay_only_count", 0) or 0) > 0:
            trade_evidence.append(f"回测多出 {int(trade_diff.get('replay_only_count', 0) or 0)} 条成交")
        if int(trade_diff.get("timing_mismatch_count", 0) or 0) > 0:
            trade_evidence.append(f"成交时间偏差 {int(trade_diff.get('timing_mismatch_count', 0) or 0)} 处")
        if int(trade_diff.get("slippage_mismatch_count", 0) or 0) > 0:
            trade_evidence.append(f"成交价或滑点差异 {int(trade_diff.get('slippage_mismatch_count', 0) or 0)} 处")
        if int(trade_diff.get("quantity_mismatch_count", 0) or 0) > 0:
            trade_evidence.append(f"成交数量差异 {int(trade_diff.get('quantity_mismatch_count', 0) or 0)} 处")
        add_candidate(
            "execution_fill_drift",
            trade_evidence,
            0.9 if self._safe_text(first_divergence.get("stage")) == "trade" else 0.76,
            ["检查撮合模型、滑点模型和成交时间对齐规则", "核对成交拆单、最小成交单位与费用模型"],
        )

        metric_items = [item for item in metrics_diff.get("items", []) if isinstance(item, dict) and item.get("mismatch")]
        metric_evidence = [f"{self._safe_text(item.get('metric'))} 偏差 {item.get('delta')}" for item in metric_items[:5]]
        add_candidate(
            "portfolio_metric_drift",
            metric_evidence,
            0.84 if self._safe_text(first_divergence.get("stage")) == "metrics" else 0.68,
            ["检查绩效统计窗口、收益口径和回撤计算方式", "确认交易明细差异是否已传导到汇总指标"],
        )

        if not candidates:
            candidates.append({
                "candidate": "no_material_diff",
                "evidence": ["本次对比未发现显著差异"],
                "confidence": 0.99,
                "recommended_next_checks": ["继续观察更多样本，确认结果稳定"],
            })
        return candidates

    def compare(self, snapshot_detail: Dict[str, Any], replay_result: Dict[str, Any]) -> Dict[str, Any]:
        signal_diff = self._compare_stage("signal", self._signal_rows_from_live(snapshot_detail), self._signal_rows_from_replay(replay_result))
        risk_diff = self._compare_stage("risk", self._risk_rows_from_live(snapshot_detail), self._risk_rows_from_replay(replay_result))
        order_diff = self._compare_stage("order", self._order_rows_from_live(snapshot_detail), self._order_rows_from_replay(replay_result))
        trade_diff = self.compare_trades(snapshot_detail, replay_result)
        metrics_diff = self.compare_metrics(snapshot_detail, replay_result)
        root_cause_tags = self.infer_root_causes(trade_diff, metrics_diff, signal_diff, risk_diff, order_diff)
        first_divergence = self.build_first_divergence(signal_diff, risk_diff, order_diff, trade_diff, metrics_diff)
        timeline_excerpt = self.build_timeline_excerpt(signal_diff, risk_diff, order_diff, trade_diff, metrics_diff, first_divergence)
        root_cause_candidates = self.build_root_cause_candidates(signal_diff, risk_diff, order_diff, trade_diff, metrics_diff, first_divergence)
        return {
            "signal_diff": signal_diff,
            "risk_diff": risk_diff,
            "order_diff": order_diff,
            "trade_diff": trade_diff,
            "metrics_diff": metrics_diff,
            "root_cause_tags": root_cause_tags,
            "first_divergence": first_divergence,
            "timeline_excerpt": timeline_excerpt,
            "root_cause_candidates": root_cause_candidates,
        }
