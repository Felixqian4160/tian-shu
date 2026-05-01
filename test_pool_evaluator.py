#!/usr/bin/env python3
"""天枢 方案C — 池模式评估引擎 + 因子扫描"""
import sys, os, time

def main():
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))
    os.chdir(os.path.dirname(__file__))

from src.evaluation.pool_evaluator import (
    PoolEvaluator, factor_low_vol, factor_momentum, factor_trend_quality, scan_factors
)

print("=" * 60)
print("【方案C】池模式矩阵回测引擎")
print("=" * 60)

# 加载 500 只股票
ev = PoolEvaluator()
ev.load_data(n_stocks=500, min_days=500)

# 因子扫描
print("\n📊 因子扫描 (500股 × 4932天)...")
t0 = time.time()

factors = {
    "低波动率": factor_low_vol,
    "动量": factor_momentum,
    "趋势质量": factor_trend_quality,
}

for name, fn in factors.items():
    result = ev.evaluate_factor(fn, top_k=30)
    dt = time.time() - t0
    print(f"  {name:8s} | 夏普={result['sharpe']:6.2f} | 年化={result['annual_ret']*100:5.1f}% | "
          f"回撤={result['max_dd']*100:5.1f}% | 胜率={result['win_rate']*100:4.1f}% | {dt:.1f}s")

# Top 选股展示
print("\n🎯 最近交易日 Top 10 (趋势质量因子):")
day_idx = ev.nd - 10
top = ev.rank_stocks(factor_trend_quality, day_idx, top_k=10)
for i, s in enumerate(top):
    print(f"  {i+1}. {s}")

ev.close()
    print("\n✅ 方案C 池模式引擎验证通过")
    print(f"   总耗时: {time.time() - t0:.1f}s")

if __name__ == "__main__":
    main()
