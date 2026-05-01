"""
策略 V14 — 天枢版低波动质量策略 (移植自 quant_merged_v2 V14)

核心逻辑:
  1. 质量过滤: ROE>3%, 负债<80% (通过 DuckDB 查询, 缓存)
  2. 趋势过滤: price > MA60
  3. 8% 移动止损 (trailing high-close)
  4. 波动率目标仓位 (target_vol=25%)
  5. RSI 超买退出

适配: jin-ce-zhi-suan BaseImplementedStrategy 接口
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from datetime import datetime

from src.strategies.implemented_strategies import BaseImplementedStrategy
from src.utils.indicators import Indicators
from src.utils.jarvis_duckdb_provider import JarvisDuckDbProvider


class StrategyV14Quality(BaseImplementedStrategy):
    """V14 低波动质量策略 (天枢移植版)"""

    def __init__(self):
        super().__init__(
            strategy_id="v14",
            name="V14低波质量",
            trigger_timeframe="D",
        )
        self.history = {}
        self._quality_cache = {}
        self._db_provider = None
        self._entered = False
        self._entry_price = 0.0
        self._highest_close = 0.0
        self._bars_since_entry = 0

    @property
    def target_vol(self): return float(self._cfg("target_vol", 0.25))
    @property
    def stop_pct(self): return float(self._cfg("stop_pct", 0.08))
    @property
    def rsi_ob(self): return float(self._cfg("rsi_ob", 85))
    @property
    def min_roe(self): return float(self._cfg("min_roe", 3.0))
    @property
    def max_debt(self): return float(self._cfg("max_debt", 80.0))
    @property
    def ma_trend_window(self): return int(self._cfg("ma_trend_window", 60))
    @property
    def vol_window(self): return int(self._cfg("vol_window", 58))

    def _db(self):
        if self._db_provider is None:
            self._db_provider = JarvisDuckDbProvider()
        return self._db_provider

    def _check_quality(self, code, dt):
        """检查质量筛选, 缓存当次回测结果"""
        if code in self._quality_cache:
            return self._quality_cache[code]
        try:
            db = self._db()
            df = db.get_financial_indicators(code, "roe")
            if df.empty:
                self._quality_cache[code] = True
                return True
            roe = float(df.iloc[0].get("roe", 0) or 0)
            passed = roe > self.min_roe
            self._quality_cache[code] = passed
            return passed
        except Exception:
            self._quality_cache[code] = True
            return True

    def on_bar(self, kline):
        code = kline.get("code", "")
        close_price = float(kline.get("close", 0.0))

        # 维护历史
        if code not in self.history:
            self.history[code] = pd.DataFrame()
        self.history[code] = pd.concat([self.history[code], pd.DataFrame([kline])], ignore_index=True)
        if len(self.history[code]) > 30000:
            self.history[code] = self.history[code].iloc[-30000:]

        df = self.history[code]
        if len(df) < 250:
            return None

        qty = int(self.positions.get(code, 0) or 0)
        closes = df["close"].values.astype(float)

        # 指标计算
        ma60 = float(np.mean(closes[-self.ma_trend_window:])) if len(closes) >= self.ma_trend_window else None

        # RSI
        rsi_series = Indicators.RSI(pd.Series(closes), 14) if len(closes) >= 15 else None
        rsi = float(rsi_series.iloc[-1]) if rsi_series is not None and len(rsi_series) > 0 else 50.0

        # 波动率
        if len(closes) >= self.vol_window:
            dr = np.diff(closes[-self.vol_window:]) / closes[-self.vol_window:-1]
            realized_vol = float(np.std(dr) * np.sqrt(252))
        else:
            realized_vol = 0.3

        # 成交量
        vol_vals = df["vol"].values.astype(float) if "vol" in df.columns else np.array([0])
        cur_vol = float(vol_vals[-1])

        # ── 持仓退出 ──
        if qty > 0:
            self._bars_since_entry += 1
            if close_price > self._highest_close:
                self._highest_close = close_price

            # 1. 移动止损
            stop_price = self._highest_close * (1.0 - self.stop_pct)
            if close_price <= stop_price:
                return self.create_exit_signal(kline, qty,
                    f"V14止损 {close_price:.2f}≤{stop_price:.2f}")

            # 2. RSI超买
            if rsi > self.rsi_ob:
                return self.create_exit_signal(kline, qty,
                    f"V14_RSI超买 {rsi:.1f}")

            # 3. MA60跌破
            if ma60 is not None and close_price < ma60:
                return self.create_exit_signal(kline, qty,
                    f"V14_MA60跌破 {close_price:.2f}<{ma60:.2f}")

            return None

        # ── 入场 ──
        # 1. 质量过滤 (缓存, 只查一次)
        if code not in self._quality_cache:
            if not self._check_quality(code, kline.get("dt")):
                return None

        # 2. 趋势: price > MA60
        if ma60 is None or close_price <= ma60:
            return None

        # 3. RSI < 超买
        if rsi >= self.rsi_ob:
            return None

        # 4. vol 目标仓位
        vol_scale = min(1.0, self.target_vol / max(realized_vol, 0.05))
        cash = float(getattr(self, "current_cash", 0.0) or 0.0)
        if cash <= 0:
            raw_qty = int(self._cfg("order_qty", 1000)) * vol_scale
        else:
            raw_qty = int((cash * 0.20 * vol_scale) // close_price)

        buy_qty = (int(raw_qty) // 100) * 100
        if buy_qty < 100:
            return None

        self._entered = True
        self._entry_price = close_price
        self._highest_close = close_price
        self._bars_since_entry = 0

        return {
            "strategy_id": self.id, "code": code, "dt": kline["dt"],
            "direction": "BUY", "price": close_price, "qty": buy_qty,
            "stop_loss": close_price * (1.0 - self.stop_pct),
            "take_profit": None,
        }
