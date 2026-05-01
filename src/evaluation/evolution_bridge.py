"""
天枢进化桥接 — PoolEvaluator 作为策略进化评估后端

提供:
  1. PoolStrategyEvaluator: 在 2000 股池上评估策略代码
  2. GeneticOptimizer: 因子参数遗传优化
  3. 脱离 LLM 依赖的轻量进化循环

用法:
  bridge = EvolutionBridge(n_stocks=500)
  metrics = bridge.evaluate(factor_trend_quality)
  → {"sharpe": 0.54, "annual_ret": 0.052, ...}
"""
from __future__ import annotations

import time
import numpy as np
import pandas as pd
from typing import Callable, Dict, List, Optional, Any
from src.evaluation.pool_evaluator import PoolEvaluator


class EvolutionBridge:
    """进化桥接: PoolEvaluator 作为评估后端"""

    def __init__(self, n_stocks: int = 500, min_days: int = 500):
        self.n_stocks = n_stocks
        self.evaluator = PoolEvaluator()
        self._loaded = False

    def _ensure_loaded(self):
        if not self._loaded:
            t0 = time.time()
            self.evaluator.load_data(n_stocks=self.n_stocks, min_days=500)
            self._loaded = True

    def evaluate_factor(
        self, factor_fn: Callable, **eval_kwargs
    ) -> Dict[str, float]:
        """评估一个因子在池上的表现, 返回进化引擎兼容的 metrics dict"""
        self._ensure_loaded()
        r = self.evaluator.evaluate_factor(factor_fn, **eval_kwargs)
        return {
            "sharpe": r.get("sharpe", 0),
            "annual_ret": r.get("annual_ret", 0),
            "max_dd": r.get("max_dd", 0),
            "win_rate": r.get("win_rate", 0),
            "n_days": r.get("n_days", 0),
        }

    def evaluate_params(
        self,
        factor_template: Callable,
        params: Dict[str, Any],
        **eval_kwargs,
    ) -> Dict[str, float]:
        """用指定参数评估因子模板"""
        def fn(**kwargs):
            return factor_template(**kwargs, **params)
        return self.evaluate_factor(fn, **eval_kwargs)

    def scan_factors(
        self, factors: Dict[str, Callable], **eval_kwargs
    ) -> pd.DataFrame:
        """批量扫描因子"""
        self._ensure_loaded()
        rows = []
        for name, fn in factors.items():
            r = self.evaluate_factor(fn, **eval_kwargs)
            rows.append({"factor": name, **r})
        return pd.DataFrame(rows).sort_values("sharpe", ascending=False)

    def close(self):
        self.evaluator.close()
        self._loaded = False


class GeneticOptimizer:
    """
    因子参数遗传优化器

    在池上用遗传算法搜索最优参数组合, 无需 LLM。
    目标: max(sharpe)

    用法:
      opt = GeneticOptimizer(bridge)
      best_params, best_score = opt.optimize(
          param_fn,          # 参数化的因子函数
          param_space={      # 搜索空间
              "ma_fast": [5, 10, 20, 30, 60],
              "ma_slow": [20, 40, 60, 120, 250],
          },
          generations=5, population=20,
      )
    """

    def __init__(self, bridge: EvolutionBridge):
        self.bridge = bridge
        self.history: List[Dict] = []

    def optimize(
        self,
        param_fn: Callable,
        param_space: Dict[str, List],
        generations: int = 5,
        population: int = 20,
        top_k_survivors: int = 5,
        **eval_kwargs,
    ) -> tuple:
        """
        遗传优化主循环

        Args:
            param_fn: 参数化因子函数 fn(prices,rets,..., **params) → scores
            param_space: {param_name: [候选值列表]}
            generations: 迭代代数
            population: 每代个体数
            top_k_survivors: 存活到下一代的个体数

        Returns:
            (best_params, best_score)
        """
        param_names = list(param_space.keys())
        best_params = {}
        best_score = float("-inf")

        for gen in range(generations):
            # 生成种群
            if gen == 0:
                # 第一代: 随机采样
                candidates = []
                for _ in range(population):
                    candidate = {}
                    for k, vals in param_space.items():
                        candidate[k] = float(np.random.choice(vals))
                    candidates.append(candidate)
            else:
                # 后代: 存活者的变异
                survivors = sorted_pop[:top_k_survivors]
                candidates = list(survivors)
                for _ in range(population - top_k_survivors):
                    parent = survivors[np.random.randint(len(survivors))]
                    child = dict(parent)
                    # 随机变异一个参数
                    mut_key = np.random.choice(param_names)
                    child[mut_key] = float(np.random.choice(param_space[mut_key]))
                    candidates.append(child)

            # 评估
            scored = []
            for i, c in enumerate(candidates):
                def fn(prices, rets, ma20s, ma60s, rsis, day_idx):
                    return param_fn(prices, rets, ma20s, ma60s, rsis, day_idx, **c)

                metrics = self.bridge.evaluate_factor(fn, **eval_kwargs)
                score = metrics["sharpe"]  # 纯夏普 (避免高波动偏差)
                scored.append((score, c, metrics))
                if score > best_score:
                    best_score = score
                    best_params = dict(c)

            # 排序
            scored.sort(key=lambda x: x[0], reverse=True)
            sorted_pop = [c for _, c, _ in scored]

            # 记录
            top_score = scored[0][0]
            avg_score = np.mean([s for s, _, _ in scored])
            self.history.append({
                "generation": gen,
                "best_score": top_score,
                "avg_score": avg_score,
                "best_params": dict(scored[0][1]),
                "best_metrics": scored[0][2],
            })
            print(f"  Gen {gen}: best={top_score:.4f} avg={avg_score:.4f} "
                  f"params={scored[0][1]}")

        return best_params, best_score


# ── 参数化因子模板 (供优化器使用) ──────────────────────────

def param_factor_ma_cross(
    prices, rets, ma20s, ma60s, rsis, day_idx,
    ma_fast=10, ma_slow=60, vol_window=58,
):
    """参数化均线交叉因子"""
    ns = prices.shape[1]
    scores = np.full(ns, -999.0)
    for j in range(ns):
        if np.isnan(prices[day_idx, j]):
            continue
        # 快慢均线
        if day_idx >= ma_slow:
            ma_f = np.nanmean(prices[max(0, day_idx - ma_fast):day_idx, j])
            ma_s = np.nanmean(prices[max(0, day_idx - ma_slow):day_idx, j])
            trend = (ma_f / ma_s - 1) if ma_s > 0 else 0
        else:
            trend = 0
        # 低波
        if day_idx >= vol_window:
            vol = np.nanstd(rets[max(0, day_idx - vol_window):day_idx, j])
            lv = 1.0 / (vol + 1e-8) if vol > 0 else 0
        else:
            lv = 0
        # RSI 惩罚
        rp = max(0, rsis[day_idx, j] - 75) * 0.01 if not np.isnan(rsis[day_idx, j]) else 0
        scores[j] = trend * 0.5 + lv * 0.3 - rp
    return scores


def param_factor_vol_reversal(
    prices, rets, ma20s, ma60s, rsis, day_idx,
    vol_threshold=2.0, reversal_window=5,
):
    """参数化波动率反转因子 (高波后的均值回归)"""
    ns = prices.shape[1]
    scores = np.full(ns, -999.0)
    for j in range(ns):
        if day_idx < reversal_window + 20:
            continue
        if np.isnan(prices[day_idx, j]):
            continue
        # 近期波动率 vs 长期波动率
        recent_vol = np.nanstd(rets[max(0, day_idx - reversal_window):day_idx, j])
        long_vol = np.nanstd(rets[max(0, day_idx - 60):day_idx, j])
        if long_vol > 0 and recent_vol / long_vol > vol_threshold:
            # 高波: 做空(低分)
            scores[j] = -1.0
        elif long_vol > 0 and recent_vol / long_vol < 0.5:
            # 低波: 做多(高分)
            scores[j] = 1.0
        else:
            scores[j] = 0.0
    return scores
