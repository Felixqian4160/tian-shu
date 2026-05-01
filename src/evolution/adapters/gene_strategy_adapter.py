from __future__ import annotations

import re
import random
import time
from typing import Any, Dict, List, Optional

from src.evolution.core.strategy_gene import ExecutionGene
from src.evolution.core.strategy_gene import RiskGene
from src.evolution.core.strategy_gene import SignalGene
from src.evolution.core.strategy_gene import StrategyGene
from src.evolution.memory.gene_run_store import PostgresGeneRunRepository
from src.utils.config_loader import ConfigLoader


class GeneStrategyAdapter:
    """Adapter that converts structured strategy genes into runnable strategy code."""
    
    def __init__(self, gene_run_repo: Optional[Any] = None):
        # Repository is optional so unit tests/offline mode can run without PostgreSQL dependency.
        self._gene_run_repo = gene_run_repo
        # Cache adaptive family weights for short period to reduce DB query overhead.
        self._family_weights_cache: Optional[Dict[str, float]] = None
        self._family_weights_cache_expires_at: float = 0.0
        # In-memory weight history for dashboard trend observability.
        self._family_weight_history: List[Dict[str, Any]] = []

    def build_seed_gene(
        self,
        seed_code: str,
        parent_gene_id: str,
        parent_name: str,
        timeframes: Optional[List[str]] = None,
    ) -> StrategyGene:
        """Build a normalized seed gene by extracting lightweight hints from seed strategy code."""
        hint = self._extract_seed_hint(seed_code=seed_code)
        trigger_timeframe = self._pick_timeframe(hint.get("trigger_timeframe", ""), timeframes=timeframes)
        strategy_family = self._pick_strategy_family(seed_code=seed_code, hint=hint)
        gene = StrategyGene(
            name=f"GeneFrom_{parent_name or parent_gene_id or 'seed'}",
            strategy_family=strategy_family,
            parent_gene_ids=[str(parent_gene_id or "").strip()] if str(parent_gene_id or "").strip() else [],
            signal=SignalGene(
                ma_fast=hint.get("ma_fast", 9),
                ma_slow=hint.get("ma_slow", 26),
                rsi_period=hint.get("rsi_period", 14),
                rsi_buy=hint.get("rsi_buy", 55.0),
                rsi_sell=hint.get("rsi_sell", 45.0),
            ),
            risk=RiskGene(
                stop_loss_pct=hint.get("stop_loss_pct", 0.03),
                take_profit_pct=hint.get("take_profit_pct", 0.08),
                max_hold_bars=hint.get("max_hold_bars", 240),
                t_plus_one=True,
                block_buy_on_limit_up=True,
                block_sell_on_limit_down=True,
            ),
            execution=ExecutionGene(
                trigger_timeframe=trigger_timeframe,
                min_history_bars=hint.get("min_history_bars", 80),
                order_qty_mode="fixed",
                order_qty=1000,
                order_cash_pct=0.1,
            ),
            tags=["mvp", "gene", "a_share"],
            meta={"seed_hint": hint},
        )
        return gene.normalized()

    def evolve_gene(
        self,
        parent_gene: StrategyGene,
        iteration: int,
        family_adaptive_blend_ratio: Optional[float] = None,
    ) -> StrategyGene:
        """Create one child gene by deterministic mutation for reproducible runs."""
        seed = max(1, int(iteration or 1))
        child = parent_gene.normalized().mutate(mutation_rate=0.35, seed=seed)
        # Family selection uses configurable weights to improve long-run diversity.
        child.strategy_family = self._schedule_strategy_family(
            seed=seed,
            base_family=child.strategy_family,
            blend_ratio_override=family_adaptive_blend_ratio,
        )
        return child.normalized()

    def get_family_weight_snapshot(self) -> Dict[str, Any]:
        """Expose configured/effective family weights for dashboard observability."""
        cfg = ConfigLoader.reload()
        configured_trend = self._safe_weight(cfg.get("evolution.gene.family_weights.trend_following", 0.6), 0.6)
        configured_mean = self._safe_weight(cfg.get("evolution.gene.family_weights.mean_reversion", 0.4), 0.4)
        adaptive_enabled = bool(cfg.get("evolution.gene.family_adaptive.enabled", False))
        effective = self._get_adaptive_family_weights(
            trend_weight=configured_trend,
            mean_weight=configured_mean,
            cfg=cfg,
        )
        self._append_family_weight_history(
            trend=float(effective.get("trend_following", configured_trend)),
            mean=float(effective.get("mean_reversion", configured_mean)),
        )
        max_items = max(5, int(cfg.get("evolution.gene.family_adaptive.history_max_items", 20) or 20))
        history = self._family_weight_history[-max_items:]
        return {
            "adaptive_enabled": adaptive_enabled,
            "configured": {
                "trend_following": configured_trend,
                "mean_reversion": configured_mean,
            },
            "effective": {
                "trend_following": float(effective.get("trend_following", configured_trend)),
                "mean_reversion": float(effective.get("mean_reversion", configured_mean)),
            },
            "history": [dict(item) for item in history],
        }

    def render_strategy_code(
        self,
        gene: StrategyGene,
        strategy_id: str,
        strategy_name: str,
        class_name: str,
    ) -> str:
        """Render gene into a BaseImplementedStrategy-compatible Python class."""
        g = gene.normalized()
        sid = str(strategy_id or "").strip() or "EVOL_GENE"
        sname = str(strategy_name or "").strip() or "Evolution Gene Strategy"
        cname = self._safe_class_name(class_name=class_name)
        tf = g.execution.trigger_timeframe
        if g.strategy_family == "mean_reversion":
            return self._render_mean_reversion_code(gene=g, sid=sid, sname=sname, cname=cname, tf=tf)
        return self._render_trend_following_code(gene=g, sid=sid, sname=sname, cname=cname, tf=tf)

    def _render_trend_following_code(
        self,
        gene: StrategyGene,
        sid: str,
        sname: str,
        cname: str,
        tf: str,
    ) -> str:
        """Render trend-following strategy code from normalized gene."""
        g = gene.normalized()
        return f'''from src.strategies.implemented_strategies import BaseImplementedStrategy
import pandas as pd
from src.utils.indicators import Indicators


class {cname}(BaseImplementedStrategy):
    """Auto-generated strategy class from StrategyGene (MVP)."""

    def __init__(self):
        # Strategy identity and trigger timeframe are gene-driven.
        super().__init__("{sid}", "{sname}", trigger_timeframe="{tf}")
        # Per-symbol in-memory bar cache.
        self.history = {{}}

    def _is_limit_up(self, kline):
        # MVP heuristic: if close reaches the daily high, treat as potential limit-up bar.
        close_price = float(kline.get("close", 0.0) or 0.0)
        high_price = float(kline.get("high", 0.0) or 0.0)
        return high_price > 0 and close_price >= high_price

    def _is_limit_down(self, kline):
        # MVP heuristic: if close reaches the daily low, treat as potential limit-down bar.
        close_price = float(kline.get("close", 0.0) or 0.0)
        low_price = float(kline.get("low", 0.0) or 0.0)
        return low_price > 0 and close_price <= low_price

    def on_bar(self, kline):
        code = kline["code"]
        if code not in self.history:
            self.history[code] = pd.DataFrame()
        # Keep a bounded cache to avoid uncontrolled memory growth.
        self.history[code] = pd.concat([self.history[code], pd.DataFrame([kline])], ignore_index=True).tail(5000)
        df = self.history[code]

        if len(df) < {g.execution.min_history_bars}:
            return None

        close = df["close"]
        ma_fast = Indicators.MA(close, {g.signal.ma_fast})
        ma_slow = Indicators.MA(close, {g.signal.ma_slow})
        rsi = Indicators.RSI(close, {g.signal.rsi_period})
        if len(ma_fast) < 2 or len(ma_slow) < 2 or len(rsi) < 2:
            return None

        qty = int(self.positions.get(code, 0))
        curr_close = float(kline["close"])
        cross_up = float(ma_fast.iloc[-2]) <= float(ma_slow.iloc[-2]) and float(ma_fast.iloc[-1]) > float(ma_slow.iloc[-1])
        cross_down = float(ma_fast.iloc[-2]) >= float(ma_slow.iloc[-2]) and float(ma_fast.iloc[-1]) < float(ma_slow.iloc[-1])
        rsi_now = float(rsi.iloc[-1])

        # Entry: enforce A-share rule "limit-up bar cannot buy".
        if qty <= 0 and cross_up and rsi_now >= {g.signal.rsi_buy}:
            if self._is_limit_up(kline):
                return None
            buy_qty = int(self._qty())
            if buy_qty <= 0:
                return None
            return {{
                "strategy_id": self.id,
                "code": code,
                "dt": kline["dt"],
                "direction": "BUY",
                "price": curr_close,
                "qty": buy_qty,
                "stop_loss": curr_close * (1 - {g.risk.stop_loss_pct}),
                "take_profit": curr_close * (1 + {g.risk.take_profit_pct})
            }}

        # Exit: enforce A-share rule "limit-down bar cannot sell".
        if qty > 0 and (cross_down or rsi_now <= {g.signal.rsi_sell}):
            if self._is_limit_down(kline):
                return None
            return self.create_exit_signal(kline, qty, "Evolution Gene Exit")
        return None
'''

    def _render_mean_reversion_code(
        self,
        gene: StrategyGene,
        sid: str,
        sname: str,
        cname: str,
        tf: str,
    ) -> str:
        """Render mean-reversion strategy code from normalized gene."""
        g = gene.normalized()
        band_period = max(g.signal.ma_slow, 10)
        return f'''from src.strategies.implemented_strategies import BaseImplementedStrategy
import pandas as pd
from src.utils.indicators import Indicators


class {cname}(BaseImplementedStrategy):
    """Auto-generated mean-reversion strategy class from StrategyGene (MVP)."""

    def __init__(self):
        # Strategy identity and trigger timeframe are gene-driven.
        super().__init__("{sid}", "{sname}", trigger_timeframe="{tf}")
        # Per-symbol in-memory bar cache.
        self.history = {{}}

    def _is_limit_up(self, kline):
        # MVP heuristic: if close reaches the daily high, treat as potential limit-up bar.
        close_price = float(kline.get("close", 0.0) or 0.0)
        high_price = float(kline.get("high", 0.0) or 0.0)
        return high_price > 0 and close_price >= high_price

    def _is_limit_down(self, kline):
        # MVP heuristic: if close reaches the daily low, treat as potential limit-down bar.
        close_price = float(kline.get("close", 0.0) or 0.0)
        low_price = float(kline.get("low", 0.0) or 0.0)
        return low_price > 0 and close_price <= low_price

    def on_bar(self, kline):
        code = kline["code"]
        if code not in self.history:
            self.history[code] = pd.DataFrame()
        # Keep a bounded cache to avoid uncontrolled memory growth.
        self.history[code] = pd.concat([self.history[code], pd.DataFrame([kline])], ignore_index=True).tail(5000)
        df = self.history[code]

        if len(df) < {g.execution.min_history_bars}:
            return None

        close = df["close"]
        basis = Indicators.MA(close, {band_period})
        std = close.rolling(window={band_period}).std()
        rsi = Indicators.RSI(close, {g.signal.rsi_period})
        if len(basis) < 2 or len(std) < 2 or len(rsi) < 2:
            return None

        qty = int(self.positions.get(code, 0))
        curr_close = float(kline["close"])
        basis_now = float(basis.iloc[-1])
        std_now = float(std.iloc[-1] or 0.0)
        if std_now <= 0:
            return None
        lower_band = basis_now - 2.0 * std_now
        rsi_now = float(rsi.iloc[-1])

        # Entry: buy oversold bounce below lower band, and enforce limit-up rule.
        if qty <= 0 and curr_close <= lower_band and rsi_now <= {g.signal.rsi_sell}:
            if self._is_limit_up(kline):
                return None
            buy_qty = int(self._qty())
            if buy_qty <= 0:
                return None
            return {{
                "strategy_id": self.id,
                "code": code,
                "dt": kline["dt"],
                "direction": "BUY",
                "price": curr_close,
                "qty": buy_qty,
                "stop_loss": curr_close * (1 - {g.risk.stop_loss_pct}),
                "take_profit": curr_close * (1 + {g.risk.take_profit_pct})
            }}

        # Exit: mean reversion back to basis or RSI overbought, and enforce limit-down rule.
        if qty > 0 and (curr_close >= basis_now or rsi_now >= {g.signal.rsi_buy}):
            if self._is_limit_down(kline):
                return None
            return self.create_exit_signal(kline, qty, "Evolution MeanReversion Exit")
        return None
'''

    def generate_from_seed(
        self,
        seed_code: str,
        parent_strategy_id: str,
        parent_strategy_name: str,
        iteration: int,
        timeframes: Optional[List[str]] = None,
        family_adaptive_blend_ratio: Optional[float] = None,
        analysis_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Build seed gene, evolve once, and render runnable strategy code."""
        seed_gene = self.build_seed_gene(
            seed_code=seed_code,
            parent_gene_id=parent_strategy_id,
            parent_name=parent_strategy_name,
            timeframes=timeframes,
        )
        adjusted_seed_gene = self._apply_analysis_feedback(seed_gene, analysis_context)
        child = self.evolve_gene(
            parent_gene=adjusted_seed_gene,
            iteration=iteration,
            family_adaptive_blend_ratio=family_adaptive_blend_ratio,
        )
        class_name = self._safe_class_name(f"EvolutionGeneStrategy_{iteration}_{parent_strategy_id}")
        strategy_id = f"EVG_{max(1, int(iteration or 1))}"
        strategy_name = f"Evolution Gene {max(1, int(iteration or 1))} from {parent_strategy_name or parent_strategy_id}"
        code = self.render_strategy_code(
            gene=child,
            strategy_id=strategy_id,
            strategy_name=strategy_name,
            class_name=class_name,
        )
        return {
            "seed_gene": adjusted_seed_gene,
            "child_gene": child,
            "strategy_code": code,
            "strategy_id": strategy_id,
            "strategy_name": strategy_name,
            "class_name": class_name,
        }

    def _apply_analysis_feedback(self, seed_gene: StrategyGene, analysis_context: Optional[Dict[str, Any]] = None) -> StrategyGene:
        analysis = analysis_context if isinstance(analysis_context, dict) else {}
        tags = [str(x or "").strip() for x in (analysis.get("feedback_tags") or []) if str(x or "").strip()]
        if not tags:
            return seed_gene.normalized()
        gene = seed_gene.normalized()
        if "first_divergence_risk" in tags or "risk_rule_drift" in tags:
            gene.risk.stop_loss_pct = min(0.08, round(gene.risk.stop_loss_pct * 0.9, 4))
            gene.risk.take_profit_pct = max(gene.risk.stop_loss_pct + 0.01, round(gene.risk.take_profit_pct * 0.95, 4))
        if "first_divergence_signal" in tags or "signal_count_drift" in tags:
            gene.signal.rsi_buy = min(80.0, round(gene.signal.rsi_buy + 1.0, 2))
            gene.signal.rsi_sell = max(20.0, round(gene.signal.rsi_sell - 1.0, 2))
            gene.execution.min_history_bars = min(300, int(gene.execution.min_history_bars) + 5)
        if "timing_drift" in tags or "slippage_drift" in tags:
            gene.execution.trigger_timeframe = str(gene.execution.trigger_timeframe or "1min")
        return gene.normalized()

    def _extract_seed_hint(self, seed_code: str) -> Dict[str, Any]:
        """Extract lightweight hints from seed code using regex-based heuristics."""
        text = str(seed_code or "")
        hint: Dict[str, Any] = {}
        int_patterns = {
            "ma_fast": r"MA\(\s*close\s*,\s*(\d+)\s*\)",
            "ma_slow": r"ma_slow.*?(\d+)|MA\(\s*close\s*,\s*(\d+)\s*\)",
            "rsi_period": r"RSI\(\s*close\s*,\s*(\d+)\s*\)",
            "min_history_bars": r"len\(df\)\s*<\s*(\d+)",
            "max_hold_bars": r"max_hold_bars[\"']?\s*,\s*(\d+)",
        }
        float_patterns = {
            "stop_loss_pct": r"stop_loss.*?\*\s*\(1\s*-\s*([0-9.]+)\)",
            "take_profit_pct": r"take_profit.*?\*\s*\(1\s*\+\s*([0-9.]+)\)",
            "rsi_buy": r"rsi_now\s*>=\s*([0-9.]+)",
            "rsi_sell": r"rsi_now\s*<=\s*([0-9.]+)",
        }
        for key, pattern in int_patterns.items():
            m = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
            if not m:
                continue
            groups = [x for x in m.groups() if x]
            if not groups:
                continue
            try:
                hint[key] = int(groups[0])
            except Exception:
                continue
        for key, pattern in float_patterns.items():
            m = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
            if not m:
                continue
            try:
                hint[key] = float(m.group(1))
            except Exception:
                continue
        tf_match = re.search(r"trigger_timeframe\s*=\s*[\"']([^\"']+)[\"']", text, flags=re.IGNORECASE)
        if tf_match:
            hint["trigger_timeframe"] = str(tf_match.group(1) or "").strip()
        return hint

    def _pick_strategy_family(self, seed_code: str, hint: Dict[str, Any]) -> str:
        """Pick strategy family from seed hints with deterministic fallback."""
        _ = hint
        text = str(seed_code or "").lower()
        # Heuristic keywords from common mean-reversion implementations.
        keywords = ["mean_reversion", "boll", "bollinger", "zscore", "revert"]
        if any(word in text for word in keywords):
            return "mean_reversion"
        return "trend_following"

    def _schedule_strategy_family(
        self,
        seed: int,
        base_family: str,
        blend_ratio_override: Optional[float] = None,
    ) -> str:
        """Select strategy family with configurable weights and deterministic random seed."""
        cfg = ConfigLoader.reload()
        trend_weight = self._safe_weight(cfg.get("evolution.gene.family_weights.trend_following", 0.6), 0.6)
        mean_weight = self._safe_weight(cfg.get("evolution.gene.family_weights.mean_reversion", 0.4), 0.4)
        # Keep base family slight preference so mutation doesn't drift too aggressively.
        if str(base_family or "").strip() == "mean_reversion":
            mean_weight += 0.1
        else:
            trend_weight += 0.1
        # Optionally adapt family weights using recent family performance statistics.
        adapted = self._get_adaptive_family_weights(
            trend_weight=trend_weight,
            mean_weight=mean_weight,
            cfg=cfg,
            blend_ratio_override=blend_ratio_override,
        )
        trend_weight = adapted["trend_following"]
        mean_weight = adapted["mean_reversion"]
        total = trend_weight + mean_weight
        if total <= 0:
            trend_weight, mean_weight = 0.6, 0.4
            total = 1.0
        probs = [trend_weight / total, mean_weight / total]
        rng = random.Random(seed)
        return rng.choices(["trend_following", "mean_reversion"], weights=probs, k=1)[0]

    def _get_adaptive_family_weights(
        self,
        trend_weight: float,
        mean_weight: float,
        cfg: Any,
        blend_ratio_override: Optional[float] = None,
    ) -> Dict[str, float]:
        """Blend base weights with recent family stats when adaptive mode is enabled."""
        adaptive_enabled = bool(cfg.get("evolution.gene.family_adaptive.enabled", False))
        if not adaptive_enabled:
            return {
                "trend_following": trend_weight,
                "mean_reversion": mean_weight,
            }
        # Cache window limits DB load during frequent iterations.
        ttl_sec = max(1, int(cfg.get("evolution.gene.family_adaptive.cache_ttl_sec", 30) or 30))
        now = time.time()
        if self._family_weights_cache and now < self._family_weights_cache_expires_at:
            return dict(self._family_weights_cache)
        rows = self._query_family_stats_rows()
        if not rows:
            out = {"trend_following": trend_weight, "mean_reversion": mean_weight}
            self._family_weights_cache = dict(out)
            self._family_weights_cache_expires_at = now + ttl_sec
            return out
        # Build quality score from score/sharpe/drawdown and combine with sample size.
        family_quality = {
            "trend_following": self._family_quality(rows, "trend_following"),
            "mean_reversion": self._family_quality(rows, "mean_reversion"),
        }
        quality_total = family_quality["trend_following"] + family_quality["mean_reversion"]
        if quality_total <= 0:
            out = {"trend_following": trend_weight, "mean_reversion": mean_weight}
            self._family_weights_cache = dict(out)
            self._family_weights_cache_expires_at = now + ttl_sec
            return out
        adaptive_trend = family_quality["trend_following"] / quality_total
        adaptive_mean = family_quality["mean_reversion"] / quality_total
        # Blend ratio controls adaptation aggressiveness.
        blend_raw = blend_ratio_override if blend_ratio_override is not None else cfg.get("evolution.gene.family_adaptive.blend_ratio", 0.35)
        blend = self._safe_weight(blend_raw, 0.35)
        if blend > 1.0:
            blend = 1.0
        base_total = trend_weight + mean_weight
        if base_total <= 0:
            base_total = 1.0
        base_trend = trend_weight / base_total
        base_mean = mean_weight / base_total
        merged_trend = (1.0 - blend) * base_trend + blend * adaptive_trend
        merged_mean = (1.0 - blend) * base_mean + blend * adaptive_mean
        # Convert back to stable positive weights.
        out = {
            "trend_following": max(0.01, merged_trend),
            "mean_reversion": max(0.01, merged_mean),
        }
        self._family_weights_cache = dict(out)
        self._family_weights_cache_expires_at = now + ttl_sec
        return out

    def _query_family_stats_rows(self) -> List[Dict[str, Any]]:
        """Read family stats rows from repository with fail-safe fallback."""
        repo = self._gene_run_repo or PostgresGeneRunRepository()
        try:
            data = repo.query_family_stats()
        except Exception:
            return []
        if not isinstance(data, dict):
            return []
        rows = data.get("rows", [])
        if not isinstance(rows, list):
            return []
        return [x for x in rows if isinstance(x, dict)]

    def _family_quality(self, rows: List[Dict[str, Any]], family: str) -> float:
        """Calculate a positive quality score per family from aggregated metrics."""
        candidates = [x for x in rows if str(x.get("family", "")).strip().lower() == family]
        if not candidates:
            return 0.0
        row = candidates[0]
        run_count = max(0.0, float(row.get("run_count", 0) or 0))
        avg_score = float(row.get("avg_score", 0.0) or 0.0)
        avg_sharpe = float(row.get("avg_sharpe", 0.0) or 0.0)
        avg_drawdown = float(row.get("avg_drawdown", 0.0) or 0.0)
        # Positive score rewards high score/sharpe and penalizes drawdown.
        perf = (avg_score + 1.0) * (avg_sharpe + 1.0) / max(0.2, (1.0 + avg_drawdown))
        if perf < 0:
            perf = 0.0
        # Sample-size boost uses sqrt to avoid domination by very old large families.
        size_boost = run_count ** 0.5
        return max(0.0, perf * max(1.0, size_boost))

    def _append_family_weight_history(self, trend: float, mean: float) -> None:
        """Append one effective-weight point into in-memory history buffer."""
        self._family_weight_history.append(
            {
                "ts": int(time.time()),
                "trend_following": max(0.0, float(trend)),
                "mean_reversion": max(0.0, float(mean)),
            }
        )
        if len(self._family_weight_history) > 200:
            self._family_weight_history = self._family_weight_history[-200:]

    def _safe_weight(self, value: Any, default: float) -> float:
        """Parse family weight as float and clamp to a safe range."""
        try:
            out = float(value)
        except Exception:
            out = float(default)
        if out < 0.0:
            return 0.0
        if out > 10.0:
            return 10.0
        return out

    def _pick_timeframe(self, seed_tf: str, timeframes: Optional[List[str]]) -> str:
        """Pick timeframe by profile first, fallback to seed hint and finally 1min."""
        values = [str(x or "").strip() for x in (timeframes or []) if str(x or "").strip()]
        if values:
            return values[0]
        tf = str(seed_tf or "").strip()
        return tf or "1min"

    def _safe_class_name(self, class_name: str) -> str:
        """Sanitize class name into a legal Python identifier."""
        token = re.sub(r"[^0-9a-zA-Z_]+", "", str(class_name or ""))
        if not token:
            token = "EvolutionGeneStrategy"
        if token[0].isdigit():
            token = f"S{token}"
        return token
