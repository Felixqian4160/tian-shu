from datetime import datetime
from typing import Any, Dict

from src.consistency.comparators.diff_comparator import ConsistencyComparator


class ConsistencyReportBuilder:
    def __init__(self, comparator: ConsistencyComparator | None = None):
        self.comparator = comparator or ConsistencyComparator()

    def build_report(self, *, market: str, code: str, snapshot_id: str, replay_run_id: str, snapshot_detail: Dict[str, Any], replay_result: Dict[str, Any]) -> Dict[str, Any]:
        comparison = self.comparator.compare(snapshot_detail, replay_result)
        manifest = snapshot_detail.get("manifest", {}) if isinstance(snapshot_detail, dict) else {}
        return {
            "report_id": "",
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "status": "success",
            "market": str(market or "ashare").strip().lower(),
            "code": str(code or "").strip().upper(),
            "snapshot_id": snapshot_id,
            "replay_run_id": replay_run_id,
            "summary": {
                "snapshot_date": manifest.get("date"),
                "live_trade_count": comparison.get("trade_diff", {}).get("live_trade_count", 0),
                "replay_trade_count": comparison.get("trade_diff", {}).get("replay_trade_count", 0),
                "mismatch_count": comparison.get("trade_diff", {}).get("mismatch_count", 0),
                "root_cause_tags": comparison.get("root_cause_tags", []),
                "first_divergence_stage": comparison.get("first_divergence", {}).get("stage", "none"),
                "first_divergence_reason": comparison.get("first_divergence", {}).get("reason_code", "no_material_diff"),
            },
            "signal_diff": comparison.get("signal_diff", {}),
            "risk_diff": comparison.get("risk_diff", {}),
            "order_diff": comparison.get("order_diff", {}),
            "trade_diff": comparison.get("trade_diff", {}),
            "metrics_diff": comparison.get("metrics_diff", {}),
            "first_divergence": comparison.get("first_divergence", {}),
            "timeline_excerpt": comparison.get("timeline_excerpt", []),
            "root_cause_candidates": comparison.get("root_cause_candidates", []),
            "root_cause_tags": comparison.get("root_cause_tags", []),
        }
