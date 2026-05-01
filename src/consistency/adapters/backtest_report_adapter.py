import json
import os
import re
from copy import deepcopy
from typing import Any, Dict, List, Optional


class BacktestReportAdapter:
    def __init__(self, reports_dir: str = "data/reports", report_prefix: str = "backtest_report_", report_suffix: str = ".json"):
        self.reports_dir = os.path.abspath(reports_dir)
        self.report_prefix = str(report_prefix or "backtest_report_")
        self.report_suffix = str(report_suffix or ".json")

    def _read_json(self, path: str, default: Any):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return deepcopy(default)

    def _sanitize_key(self, raw: Any) -> str:
        return re.sub(r"[^0-9A-Za-z_.-]+", "_", str(raw or "").strip())

    def _report_path(self, report_id: str) -> str:
        rid = self._sanitize_key(report_id)
        return os.path.join(self.reports_dir, f"{self.report_prefix}{rid}{self.report_suffix}")

    def _normalize_text_list(self, values: Optional[List[Any]]) -> List[str]:
        out: List[str] = []
        for value in list(values or []):
            text = str(value or "").strip()
            if text and text not in out:
                out.append(text)
        return out

    def load_report(self, report_id: str) -> Dict[str, Any]:
        path = self._report_path(report_id)
        payload = self._read_json(path, {})
        if isinstance(payload, dict):
            if isinstance(payload.get("report"), dict):
                return payload.get("report")
            if payload.get("report_id"):
                return payload
        return {}

    def adapt_report(self, report_id: str, strategy_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        report = self.load_report(report_id)
        if not isinstance(report, dict) or not report:
            return {}
        strategy_filter = self._normalize_text_list(strategy_ids)
        strategy_reports_raw = report.get("strategy_reports")
        if isinstance(strategy_reports_raw, dict):
            strategy_reports = [row for row in strategy_reports_raw.values() if isinstance(row, dict)]
        elif isinstance(strategy_reports_raw, list):
            strategy_reports = [row for row in strategy_reports_raw if isinstance(row, dict)]
        else:
            strategy_reports = []
        if strategy_filter:
            filtered_reports = []
            for row in strategy_reports:
                sid = str(row.get("strategy_id", "") or "").strip()
                if sid in strategy_filter:
                    filtered_reports.append(row)
            strategy_reports = filtered_reports
        if not strategy_reports and strategy_filter:
            return {}
        report_summary = report.get("summary") if isinstance(report.get("summary"), dict) else {}
        ranking = report.get("ranking") if isinstance(report.get("ranking"), list) else (report_summary.get("ranking") if isinstance(report_summary.get("ranking"), list) else [])
        if strategy_filter:
            ranking = [row for row in ranking if isinstance(row, dict) and str(row.get("strategy_id", "") or "").strip() in strategy_filter]
        total_trades = 0
        for row in strategy_reports:
            trades = row.get("trade_details") if isinstance(row.get("trade_details"), list) else []
            total_trades += len([x for x in trades if isinstance(x, dict)])
        summary = deepcopy(report_summary)
        if total_trades:
            summary["total_trades"] = total_trades
        return {
            "report_id": str(report.get("report_id", "") or report_id),
            "status": str(report.get("status", "") or "success"),
            "error_msg": str(report.get("error_msg", "") or ""),
            "request": deepcopy(report.get("request") if isinstance(report.get("request"), dict) else {}),
            "summary": summary,
            "ranking": ranking,
            "strategy_reports": strategy_reports,
            "strategy_ids": [str(row.get("strategy_id", "") or "").strip() for row in strategy_reports if str(row.get("strategy_id", "") or "").strip()],
        }
