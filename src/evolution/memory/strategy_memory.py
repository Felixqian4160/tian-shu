from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
import re
import uuid
from typing import Any, Dict, List, Optional, Protocol

from src.evolution.core.event_bus import EventBus


class MemoryBackend(Protocol):
    """可替换存储后端协议（内存/数据库均可实现该接口）。"""

    def save_record(self, record: Dict[str, Any]) -> None:
        ...

    def list_records(self) -> List[Dict[str, Any]]:
        ...


@dataclass
class InMemoryBackend:
    """初期内存存储实现。"""

    records: List[Dict[str, Any]] = field(default_factory=list)

    def save_record(self, record: Dict[str, Any]) -> None:
        self.records.append(dict(record))

    def list_records(self) -> List[Dict[str, Any]]:
        return [dict(item) for item in self.records]


class StrategyMemory:
    def __init__(self, backend: Optional[MemoryBackend] = None):
        self.backend = backend or InMemoryBackend()

    def save(
        self,
        strategy_code: str,
        score: float,
        metrics: Dict[str, Any],
        child_gene: Optional[Dict[str, Any]] = None,
        parent_strategy_id: str = "",
        parent_strategy_name: str = "",
    ) -> Dict[str, Any]:
        # Persist both executable strategy code and optional structured gene snapshot.
        strategy_meta = self._extract_strategy_meta(strategy_code)
        gene_snapshot = self._normalize_gene_snapshot(child_gene)
        gene_id = str(gene_snapshot.get("gene_id", "") or "")
        gene_parent_ids = self._to_str_list(gene_snapshot.get("parent_gene_ids", []))
        record = {
            "strategy_code": str(strategy_code or ""),
            "strategy_id": strategy_meta.get("strategy_id", ""),
            "strategy_name": strategy_meta.get("strategy_name", ""),
            "class_name": strategy_meta.get("class_name", ""),
            "parent_strategy_id": str(parent_strategy_id or ""),
            "parent_strategy_name": str(parent_strategy_name or ""),
            "score": self._to_float(score),
            "metrics": self._normalize_metrics(metrics),
            "child_gene": gene_snapshot,
            "child_gene_id": gene_id,
            "child_gene_parent_ids": gene_parent_ids,
            "child_gene_fingerprint": self._fingerprint_payload(gene_snapshot) if gene_snapshot else "",
            # Use timezone-aware UTC timestamp for forward compatibility.
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        self.backend.save_record(record)
        return dict(record)

    def get_top(self, k: int = 5) -> List[Dict[str, Any]]:
        limit = max(0, int(k))
        if limit == 0:
            return []
        records = self.backend.list_records()
        records.sort(key=lambda item: self._to_float(item.get("score", 0.0)), reverse=True)
        return records[:limit]

    def _normalize_metrics(self, metrics: Dict[str, Any]) -> Dict[str, float]:
        data = metrics if isinstance(metrics, dict) else {}
        normalized: Dict[str, float] = {}
        for key, value in data.items():
            normalized[str(key)] = self._to_float(value)
        return normalized

    def _to_float(self, value: Any, default: float = 0.0) -> float:
        try:
            return float(value)
        except Exception:
            return float(default)

    def _to_str_list(self, value: Any) -> List[str]:
        if isinstance(value, (list, tuple, set)):
            out = [str(x or "").strip() for x in value]
            return [x for x in out if x]
        text = str(value or "").strip()
        if not text:
            return []
        return [text]

    def _normalize_gene_snapshot(self, payload: Any) -> Dict[str, Any]:
        # Snapshot must remain JSON-safe to support future DB persistence.
        data = payload if isinstance(payload, dict) else {}
        if not data:
            return {}
        out = dict(data)
        out["gene_id"] = str(out.get("gene_id", "") or "")
        out["parent_gene_ids"] = self._to_str_list(out.get("parent_gene_ids", []))
        out["name"] = str(out.get("name", "") or "")
        return out

    def _fingerprint_payload(self, payload: Dict[str, Any]) -> str:
        # Stable JSON serialization is enough for MVP de-dup and traceability.
        text = json.dumps(payload if isinstance(payload, dict) else {}, ensure_ascii=True, sort_keys=True)
        return self._hash(text)

    def _hash(self, text: str) -> str:
        # Lazy import keeps module import overhead minimal in non-memory paths.
        import hashlib

        return hashlib.sha256(str(text or "").encode("utf-8")).hexdigest()

    def _extract_strategy_meta(self, strategy_code: str) -> Dict[str, str]:
        code = str(strategy_code or "")
        out = {
            "strategy_id": "",
            "strategy_name": "",
            "class_name": "",
        }
        if not code.strip():
            return out
        class_match = re.search(r"class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(", code)
        if class_match:
            out["class_name"] = str(class_match.group(1) or "").strip()
        super_match = re.search(
            r"super\(\)\.__init__\(\s*['\"]([^'\"]+)['\"]\s*,\s*['\"]([^'\"]+)['\"]",
            code,
        )
        if super_match:
            out["strategy_id"] = str(super_match.group(1) or "").strip()
            out["strategy_name"] = str(super_match.group(2) or "").strip()
        return out


class MemoryAgent:
    SCORE_WEIGHTS = {
        "sharpe": 0.4,
        "win_rate": 0.2,
        "profit_factor": 0.2,
        "drawdown": 0.2,
    }

    def __init__(self, bus: EventBus, memory: Optional[StrategyMemory] = None):
        self.bus = bus
        self.memory = memory or StrategyMemory()
        self.bus.subscribe("BacktestFinished", self._on_backtest_finished)
        self.bus.subscribe("StrategyRejected", self._on_strategy_rejected)

    def _on_backtest_finished(self, data: Dict[str, Any]) -> None:
        payload = data if isinstance(data, dict) else {}
        strategy_code = str(payload.get("strategy_code", "") or "")
        iteration = int(payload.get("iteration", 0) or 0)
        # Generate a stable run id for downstream persistence across event chain.
        run_id = str(payload.get("run_id", "") or "").strip() or uuid.uuid4().hex
        metrics = payload.get("metrics", {})
        normalized = self._normalize_metrics(metrics)
        score = self._score(normalized)
        child_gene = payload.get("child_gene", {})
        memory_record = self.memory.save(
            strategy_code=strategy_code,
            score=score,
            metrics=normalized,
            child_gene=child_gene if isinstance(child_gene, dict) else {},
            parent_strategy_id=str(payload.get("parent_strategy_id", "") or ""),
            parent_strategy_name=str(payload.get("parent_strategy_name", "") or ""),
        )
        out = dict(payload)
        out.update(
            {
                "run_id": run_id,
                "iteration": iteration,
                "status": "ok",
                "score": score,
                "strategy_code": strategy_code,
                "metrics": normalized,
                "best_timeframe": str(metrics.get("best_timeframe", "") or ""),
                "best_stock_code": str(metrics.get("best_stock_code", "") or ""),
                "child_gene_id": str(memory_record.get("child_gene_id", "") or ""),
                "child_gene_parent_ids": self._to_str_list(memory_record.get("child_gene_parent_ids", [])),
                "child_gene_fingerprint": str(memory_record.get("child_gene_fingerprint", "") or ""),
            }
        )
        self.bus.publish(
            "StrategyScored",
            out,
        )

    def _on_strategy_rejected(self, data: Dict[str, Any]) -> None:
        payload = data if isinstance(data, dict) else {}
        # Rejected runs also get run_id so auditing has the same key shape.
        run_id = str(payload.get("run_id", "") or "").strip() or uuid.uuid4().hex
        out = dict(payload)
        out.update(
            {
                "run_id": run_id,
                "iteration": int(payload.get("iteration", 0) or 0),
                "status": "rejected",
                "score": None,
                "metrics": {},
            }
        )
        self.bus.publish(
            "StrategyScored",
            out,
        )

    def _normalize_metrics(self, metrics: Any) -> Dict[str, float]:
        data = metrics if isinstance(metrics, dict) else {}
        return {
            "sharpe": self._to_float(data.get("sharpe", 0.0)),
            "win_rate": self._to_float(data.get("win_rate", 0.0)),
            "drawdown": self._to_float(data.get("drawdown", 0.0)),
            "total_return": self._to_float(data.get("total_return", 0.0)),
            "profit_factor": self._to_float(data.get("profit_factor", 0.0)),
        }

    def _score(self, metrics: Dict[str, float]) -> float:
        sharpe = metrics["sharpe"]
        win_rate = metrics["win_rate"]
        profit_factor = metrics["profit_factor"]
        drawdown = max(0.0, metrics["drawdown"])
        return (
            sharpe * self.SCORE_WEIGHTS["sharpe"]
            + win_rate * self.SCORE_WEIGHTS["win_rate"]
            + profit_factor * self.SCORE_WEIGHTS["profit_factor"]
            - drawdown * self.SCORE_WEIGHTS["drawdown"]
        )

    def _to_float(self, value: Any, default: float = 0.0) -> float:
        try:
            return float(value)
        except Exception:
            return float(default)

    def _to_str_list(self, value: Any) -> List[str]:
        # Local helper to keep StrategyScored payload shape stable.
        if isinstance(value, (list, tuple, set)):
            out = [str(x or "").strip() for x in value]
            return [x for x in out if x]
        text = str(value or "").strip()
        if not text:
            return []
        return [text]

