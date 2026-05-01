from __future__ import annotations

import copy
import hashlib
import json
import random
import uuid
from dataclasses import asdict
from dataclasses import dataclass
from dataclasses import field
from typing import Any, Dict, List


def _clamp_float(value: Any, min_value: float, max_value: float, default: float) -> float:
    """Convert arbitrary input to float and clamp into the provided range."""
    try:
        out = float(value)
    except Exception:
        out = float(default)
    if out < min_value:
        return float(min_value)
    if out > max_value:
        return float(max_value)
    return float(out)


def _clamp_int(value: Any, min_value: int, max_value: int, default: int) -> int:
    """Convert arbitrary input to int and clamp into the provided range."""
    try:
        out = int(float(value))
    except Exception:
        out = int(default)
    if out < min_value:
        return int(min_value)
    if out > max_value:
        return int(max_value)
    return int(out)


@dataclass
class SignalGene:
    """Signal gene describes indicator parameters used by the MVP strategy template."""

    ma_fast: int = 9
    ma_slow: int = 26
    rsi_period: int = 14
    rsi_buy: float = 55.0
    rsi_sell: float = 45.0

    def normalize(self) -> "SignalGene":
        """Return a normalized copy with bounded and internally-consistent values."""
        normalized = copy.deepcopy(self)
        normalized.ma_fast = _clamp_int(self.ma_fast, min_value=2, max_value=80, default=9)
        normalized.ma_slow = _clamp_int(self.ma_slow, min_value=5, max_value=200, default=26)
        normalized.rsi_period = _clamp_int(self.rsi_period, min_value=5, max_value=60, default=14)
        normalized.rsi_buy = _clamp_float(self.rsi_buy, min_value=50.0, max_value=90.0, default=55.0)
        normalized.rsi_sell = _clamp_float(self.rsi_sell, min_value=10.0, max_value=50.0, default=45.0)
        if normalized.ma_fast >= normalized.ma_slow:
            normalized.ma_fast = max(2, normalized.ma_slow - 1)
        if normalized.rsi_sell >= normalized.rsi_buy:
            normalized.rsi_sell = max(10.0, normalized.rsi_buy - 5.0)
        return normalized


@dataclass
class RiskGene:
    """Risk gene encodes risk limits and A-share hard constraints."""

    stop_loss_pct: float = 0.03
    take_profit_pct: float = 0.08
    max_hold_bars: int = 240
    t_plus_one: bool = True
    block_buy_on_limit_up: bool = True
    block_sell_on_limit_down: bool = True

    def normalize(self) -> "RiskGene":
        """Return a normalized copy while enforcing A-share hard rules."""
        normalized = copy.deepcopy(self)
        normalized.stop_loss_pct = _clamp_float(self.stop_loss_pct, 0.005, 0.2, 0.03)
        normalized.take_profit_pct = _clamp_float(self.take_profit_pct, 0.01, 0.5, 0.08)
        normalized.max_hold_bars = _clamp_int(self.max_hold_bars, 1, 20_000, 240)
        # Enforce A-share hard constraints at normalization stage.
        normalized.t_plus_one = True
        normalized.block_buy_on_limit_up = True
        normalized.block_sell_on_limit_down = True
        return normalized


@dataclass
class ExecutionGene:
    """Execution gene controls timeframe and position sizing behavior."""

    trigger_timeframe: str = "1min"
    min_history_bars: int = 80
    order_qty_mode: str = "fixed"
    order_qty: int = 1000
    order_cash_pct: float = 0.1

    def normalize(self) -> "ExecutionGene":
        """Return a normalized copy with supported trigger period and order fields."""
        normalized = copy.deepcopy(self)
        timeframe = str(self.trigger_timeframe or "").strip() or "1min"
        allowed = {"1min", "5min", "15min", "30min", "60min", "D", "W"}
        normalized.trigger_timeframe = timeframe if timeframe in allowed else "1min"
        normalized.min_history_bars = _clamp_int(self.min_history_bars, 10, 100_000, 80)
        mode = str(self.order_qty_mode or "").strip().lower()
        normalized.order_qty_mode = mode if mode in {"fixed", "cash_pct"} else "fixed"
        normalized.order_qty = _clamp_int(self.order_qty, 0, 10_000_000, 1000)
        normalized.order_cash_pct = _clamp_float(self.order_cash_pct, 0.0, 1.0, 0.1)
        return normalized


@dataclass
class StrategyGene:
    """Root gene object for the evolution MVP."""

    gene_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    name: str = "EvolutionGeneMVP"
    strategy_family: str = "trend_following"
    parent_gene_ids: List[str] = field(default_factory=list)
    signal: SignalGene = field(default_factory=SignalGene)
    risk: RiskGene = field(default_factory=RiskGene)
    execution: ExecutionGene = field(default_factory=ExecutionGene)
    tags: List[str] = field(default_factory=lambda: ["mvp", "a_share"])
    meta: Dict[str, Any] = field(default_factory=dict)

    def normalized(self) -> "StrategyGene":
        """Return a deep-copied normalized gene for safe persistence/usage."""
        out = copy.deepcopy(self)
        out.name = str(self.name or "").strip() or "EvolutionGeneMVP"
        family = str(self.strategy_family or "").strip().lower()
        out.strategy_family = family if family in {"trend_following", "mean_reversion"} else "trend_following"
        out.parent_gene_ids = [str(x).strip() for x in self.parent_gene_ids if str(x).strip()]
        out.tags = [str(x).strip() for x in self.tags if str(x).strip()]
        if "a_share" not in out.tags:
            out.tags.append("a_share")
        out.signal = self.signal.normalize()
        out.risk = self.risk.normalize()
        out.execution = self.execution.normalize()
        return out

    def validate(self) -> List[str]:
        """Validate gene and return a list of human-readable errors."""
        errors: List[str] = []
        data = self.normalized()
        if not data.gene_id:
            errors.append("gene_id is empty")
        if data.strategy_family not in {"trend_following", "mean_reversion"}:
            errors.append("strategy_family must be trend_following or mean_reversion")
        if data.signal.ma_fast >= data.signal.ma_slow:
            errors.append("signal.ma_fast must be smaller than signal.ma_slow")
        if data.signal.rsi_sell >= data.signal.rsi_buy:
            errors.append("signal.rsi_sell must be smaller than signal.rsi_buy")
        if not data.risk.t_plus_one:
            errors.append("risk.t_plus_one must be true for A-share")
        if not data.risk.block_buy_on_limit_up:
            errors.append("risk.block_buy_on_limit_up must be true for A-share")
        if not data.risk.block_sell_on_limit_down:
            errors.append("risk.block_sell_on_limit_down must be true for A-share")
        return errors

    def to_dict(self) -> Dict[str, Any]:
        """Serialize gene into a JSON-friendly dictionary."""
        return asdict(self.normalized())

    @classmethod
    def from_dict(cls, payload: Any) -> "StrategyGene":
        """Create gene from dictionary payload with backward-compatible defaults."""
        data = payload if isinstance(payload, dict) else {}
        signal_payload = data.get("signal", {})
        risk_payload = data.get("risk", {})
        execution_payload = data.get("execution", {})
        return cls(
            gene_id=str(data.get("gene_id", "") or uuid.uuid4().hex),
            name=str(data.get("name", "") or "EvolutionGeneMVP"),
            strategy_family=str(data.get("strategy_family", "") or "trend_following"),
            parent_gene_ids=[str(x).strip() for x in data.get("parent_gene_ids", []) if str(x).strip()],
            signal=SignalGene(
                ma_fast=signal_payload.get("ma_fast", 9),
                ma_slow=signal_payload.get("ma_slow", 26),
                rsi_period=signal_payload.get("rsi_period", 14),
                rsi_buy=signal_payload.get("rsi_buy", 55.0),
                rsi_sell=signal_payload.get("rsi_sell", 45.0),
            ),
            risk=RiskGene(
                stop_loss_pct=risk_payload.get("stop_loss_pct", 0.03),
                take_profit_pct=risk_payload.get("take_profit_pct", 0.08),
                max_hold_bars=risk_payload.get("max_hold_bars", 240),
                t_plus_one=bool(risk_payload.get("t_plus_one", True)),
                block_buy_on_limit_up=bool(risk_payload.get("block_buy_on_limit_up", True)),
                block_sell_on_limit_down=bool(risk_payload.get("block_sell_on_limit_down", True)),
            ),
            execution=ExecutionGene(
                trigger_timeframe=execution_payload.get("trigger_timeframe", "1min"),
                min_history_bars=execution_payload.get("min_history_bars", 80),
                order_qty_mode=execution_payload.get("order_qty_mode", "fixed"),
                order_qty=execution_payload.get("order_qty", 1000),
                order_cash_pct=execution_payload.get("order_cash_pct", 0.1),
            ),
            tags=[str(x).strip() for x in data.get("tags", ["mvp", "a_share"]) if str(x).strip()],
            meta=data.get("meta", {}) if isinstance(data.get("meta"), dict) else {},
        ).normalized()

    def fingerprint(self) -> str:
        """Generate stable fingerprint used for de-duplication and reproducibility."""
        payload = json.dumps(self.to_dict(), ensure_ascii=True, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def mutate(self, mutation_rate: float = 0.2, seed: int | None = None) -> "StrategyGene":
        """Create a mutated child gene while preserving A-share hard constraints."""
        child = self.normalized()
        rng = random.Random(seed)
        rate = _clamp_float(mutation_rate, 0.0, 1.0, 0.2)

        # Mutate signal parameters.
        if rng.random() < rate:
            child.signal.ma_fast += rng.choice([-2, -1, 1, 2])
        if rng.random() < rate:
            child.signal.ma_slow += rng.choice([-4, -2, 2, 4, 6])
        if rng.random() < rate:
            child.signal.rsi_period += rng.choice([-2, -1, 1, 2])
        if rng.random() < rate:
            child.signal.rsi_buy += rng.choice([-2.0, -1.0, 1.0, 2.0])
        if rng.random() < rate:
            child.signal.rsi_sell += rng.choice([-2.0, -1.0, 1.0, 2.0])

        # Mutate risk parameters.
        if rng.random() < rate:
            child.risk.stop_loss_pct += rng.choice([-0.005, -0.002, 0.002, 0.005])
        if rng.random() < rate:
            child.risk.take_profit_pct += rng.choice([-0.01, -0.005, 0.005, 0.01])
        if rng.random() < rate:
            child.risk.max_hold_bars += rng.choice([-30, -10, 10, 30, 60])

        # Mutate execution parameters.
        if rng.random() < rate:
            child.execution.min_history_bars += rng.choice([-20, -10, 10, 20, 30])
        if rng.random() < rate:
            child.execution.order_qty += rng.choice([-500, -200, 200, 500, 1000])
        if rng.random() < rate:
            child.execution.order_cash_pct += rng.choice([-0.02, -0.01, 0.01, 0.02])
        if rng.random() < rate * 0.3:
            # Low-probability family mutation to diversify search space.
            child.strategy_family = (
                "mean_reversion" if child.strategy_family == "trend_following" else "trend_following"
            )

        child.gene_id = uuid.uuid4().hex
        child.parent_gene_ids = [self.gene_id]
        child.meta = dict(child.meta)
        child.meta["mutation_of"] = self.gene_id
        return child.normalized()

    def crossover(self, other: "StrategyGene", seed: int | None = None) -> "StrategyGene":
        """Create a child gene by mixing two parent genes."""
        if not isinstance(other, StrategyGene):
            raise TypeError("other must be StrategyGene")
        left = self.normalized()
        right = other.normalized()
        rng = random.Random(seed)
        child = StrategyGene()

        # Pick each field from one parent to keep implementation simple and testable.
        child.signal = SignalGene(
            ma_fast=left.signal.ma_fast if rng.random() < 0.5 else right.signal.ma_fast,
            ma_slow=left.signal.ma_slow if rng.random() < 0.5 else right.signal.ma_slow,
            rsi_period=left.signal.rsi_period if rng.random() < 0.5 else right.signal.rsi_period,
            rsi_buy=left.signal.rsi_buy if rng.random() < 0.5 else right.signal.rsi_buy,
            rsi_sell=left.signal.rsi_sell if rng.random() < 0.5 else right.signal.rsi_sell,
        )
        child.risk = RiskGene(
            stop_loss_pct=left.risk.stop_loss_pct if rng.random() < 0.5 else right.risk.stop_loss_pct,
            take_profit_pct=left.risk.take_profit_pct if rng.random() < 0.5 else right.risk.take_profit_pct,
            max_hold_bars=left.risk.max_hold_bars if rng.random() < 0.5 else right.risk.max_hold_bars,
            t_plus_one=True,
            block_buy_on_limit_up=True,
            block_sell_on_limit_down=True,
        )
        child.execution = ExecutionGene(
            trigger_timeframe=left.execution.trigger_timeframe
            if rng.random() < 0.5
            else right.execution.trigger_timeframe,
            min_history_bars=left.execution.min_history_bars
            if rng.random() < 0.5
            else right.execution.min_history_bars,
            order_qty_mode=left.execution.order_qty_mode if rng.random() < 0.5 else right.execution.order_qty_mode,
            order_qty=left.execution.order_qty if rng.random() < 0.5 else right.execution.order_qty,
            order_cash_pct=left.execution.order_cash_pct if rng.random() < 0.5 else right.execution.order_cash_pct,
        )
        child.gene_id = uuid.uuid4().hex
        child.name = f"{left.name}_x_{right.name}"
        child.strategy_family = left.strategy_family if rng.random() < 0.5 else right.strategy_family
        child.parent_gene_ids = [left.gene_id, right.gene_id]
        child.tags = sorted(set(left.tags + right.tags))
        child.meta = {
            "crossover_of": [left.gene_id, right.gene_id],
        }
        return child.normalized()
