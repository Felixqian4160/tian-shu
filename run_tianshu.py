#!/usr/bin/env python3
"""
天枢统一运行器 — 量化策略全流程

用法:
  python run_tianshu.py scan     # 因子扫描 + 遗传优化
  python run_tianshu.py backtest # 策略回测矩阵
  python run_tianshu.py rank     # 全池选股排名
  python run_tianshu.py all      # 全部
"""
import sys, os, time, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))
os.chdir(os.path.dirname(__file__))

import numpy as np
from datetime import datetime


def cmd_scan():
    """因子扫描 + 遗传优化"""
    from src.evaluation.pool_evaluator import PoolEvaluator, factor_low_vol, factor_trend_quality, factor_momentum
    from src.evaluation.evolution_bridge import EvolutionBridge, GeneticOptimizer

    print("📊 天枢 因子进化扫描")
    print("=" * 60)

    bridge = EvolutionBridge(n_stocks=500)
    bridge._ensure_loaded()

    # 基线扫描
    print("\n── 基线因子 ──")
    factors = {"低波动率": factor_low_vol, "趋势质量": factor_trend_quality, "动量": factor_momentum}
    for name, fn in factors.items():
        r = bridge.evaluate_factor(fn, top_k=30, rebalance=10, stop_loss=0.15, max_dd_cap=0.30)
        print(f"  {name:8s}: Sharpe={r['sharpe']:6.3f}  年化={r['annual_ret']*100:5.1f}%  "
              f"回撤={r['max_dd']*100:5.1f}%  胜率={r['win_rate']*100:4.1f}%")

    # 遗传优化低波因子
    print("\n── 遗传优化 ──")
    def param_lowvol(prices, rets, ma20s, ma60s, rsis, day_idx,
                     lookback=58, vol_clip_pct=0.05):
        lb = min(day_idx, int(lookback)); sl = max(0, day_idx - lb)
        if day_idx - sl < 5: return np.full(prices.shape[1], -999.0)
        vol = np.nanstd(rets[sl:day_idx], axis=0)
        vol = np.clip(vol, np.nanquantile(vol, vol_clip_pct), None)
        return np.where(~np.isnan(vol), 1.0 / (vol + 1e-8), -999.0)

    opt = GeneticOptimizer(bridge)
    best, score = opt.optimize(
        param_lowvol,
        {"lookback": [20, 40, 58, 100, 252], "vol_clip_pct": [0.01, 0.05, 0.10, 0.20]},
        generations=8, population=24,
        top_k=30, rebalance=10, stop_loss=0.15, max_dd_cap=0.30,
    )
    print(f"\n  最优: {best}  (得分={score:.4f})")

    # 验证
    def opt_fn(p, r, m20, m60, rsis, di):
        return param_lowvol(p, r, m20, m60, rsis, di,
                           lookback=best['lookback'], vol_clip_pct=best['vol_clip_pct'])
    final = bridge.evaluate_factor(opt_fn, top_k=30, rebalance=10, stop_loss=0.15, max_dd_cap=0.30)
    base = bridge.evaluate_factor(factor_low_vol, top_k=30, rebalance=10, stop_loss=0.15, max_dd_cap=0.30)
    print(f"\n  优化前: Sharpe={base['sharpe']:.4f} 年化={base['annual_ret']*100:.1f}%")
    print(f"  优化后: Sharpe={final['sharpe']:.4f} 年化={final['annual_ret']*100:.1f}%")

    bridge.close()
    return 0


def cmd_backtest():
    """多股票策略回测矩阵"""
    from src.core.backtest_cabinet import BacktestCabinet
    import asyncio

    STOCKS = [
        ("600036.SH", "招商银行"), ("000001.SZ", "平安银行"),
        ("600519.SH", "贵州茅台"), ("000651.SZ", "格力电器"),
        ("600276.SH", "恒瑞医药"), ("000858.SZ", "五粮液"),
        ("601318.SH", "中国平安"), ("002415.SZ", "海康威视"),
    ]
    STRATEGIES = ["00", "03", "05", "06", "07"]

    print("📊 天枢 多股票策略矩阵")
    print("=" * 60)

    results = {}

    async def run_one(code, sid):
        class C:
            data = None
            async def cb(self, et, d):
                if et == "backtest_result": self.data = d

        c = C()
        cab = BacktestCabinet(
            stock_code=code, strategy_id=sid, initial_capital=1_000_000,
            event_callback=c.cb, provider_source_override="jarvis_duckdb",
        )
        await cab.run(start_date=datetime(2024, 1, 1), end_date=datetime(2025, 12, 31))
        return c.data

    async def main():
        total = len(STOCKS) * len(STRATEGIES)
        done = 0
        for code, name in STOCKS:
            for sid in STRATEGIES:
                done += 1
                r = await run_one(code, sid)
                if r and r.get("ranking"):
                    row = r["ranking"][0]
                    results[f"{name}_{sid}"] = {
                        "rating": row.get("rating", "-"),
                        "ret": row.get("annualized_roi", 0) * 100,
                        "dd": row.get("max_dd", 0) * 100,
                        "wr": row.get("win_rate", 0) * 100,
                    }

        # 矩阵输出
        print(f"\n{'':<10}", end="")
        for sid in STRATEGIES:
            print(f"{sid:>8}", end="")
        print(f"  {'评级':>4}")

        for code, name in STOCKS:
            best_ret, best_sid = -999, ""
            print(f"{name:<10}", end="")
            for sid in STRATEGIES:
                k = f"{name}_{sid}"
                v = results.get(k, {}).get("ret", 0)
                print(f"{v:>7.1f}%", end="")
                if v > best_ret:
                    best_ret, best_sid = v, sid
            best_r = results.get(f"{name}_{best_sid}", {}).get("rating", "-")
            print(f"  {best_r:>4}")

    asyncio.run(main())

    # 策略统计
    print(f"\n── 策略统计 ──")
    for sid in STRATEGIES:
        vals = [results.get(f"{name}_{sid}", {}).get("ret", 0) for _, name in STOCKS]
        valid = [v for v in vals if abs(v) > 0.01]
        print(f"  {sid}: 平均={np.mean(valid):5.1f}%  最高={np.max(valid):5.1f}%  "
              f"最低={np.min(valid):5.1f}%  覆盖率={len(valid)}/{len(vals)}")

    return 0


def cmd_rank():
    """全池选股 TOP 20"""
    from src.evaluation.pool_evaluator import PoolEvaluator, factor_trend_quality, factor_low_vol

    print("🎯 天枢 全池选股 TOP 20")
    print("=" * 60)

    ev = PoolEvaluator()
    ev.load_data(n_stocks=2000, min_days=500)

    print(f"\n池规模: {ev.ns}股 × {ev.nd}天 ({ev.dates[0]} ~ {ev.dates[-1]})")
    print(f"\n── 趋势质量因子 Top 20 ──")
    top = ev.rank_stocks(factor_trend_quality, ev.nd - 5, top_k=20, quality_filter=True)
    for i, s in enumerate(top):
        print(f"  {i + 1:2d}. {s}")

    print(f"\n── 低波动率因子 Top 20 ──")
    top2 = ev.rank_stocks(factor_low_vol, ev.nd - 5, top_k=20, quality_filter=False)
    for i, s in enumerate(top2):
        print(f"  {i + 1:2d}. {s}")

    ev.close()
    return 0


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    t0 = time.time()

    if cmd in ("scan", "all"):
        cmd_scan()
    if cmd in ("backtest", "all"):
        cmd_backtest()
    if cmd in ("rank", "all"):
        cmd_rank()

    print(f"\n⏱️ 总耗时: {time.time() - t0:.1f}s")
