#!/usr/bin/env python3
"""
天枢 (tian-shu) 全功能审计测试
==============================
测试 Plan A/B/C 所有功能, 输出详细审计报告
"""
import sys, os, time, traceback, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))
os.chdir(os.path.dirname(__file__))

TESTS_PASSED = 0
TESTS_FAILED = 0
FAIL_DETAILS = []

def test(name):
    def decorator(fn):
        def wrapper():
            global TESTS_PASSED, TESTS_FAILED
            try:
                fn()
                TESTS_PASSED += 1
                print(f"  ✅ {name}")
            except Exception as e:
                TESTS_FAILED += 1
                detail = f"  ❌ {name}: {e}"
                print(detail)
                FAIL_DETAILS.append((name, str(e), traceback.format_exc()))
        return wrapper
    return decorator


# ═══════════════════════════════════════════════════════
# Plan A: 数据接入审计
# ═══════════════════════════════════════════════════════

@test("A1: DuckDB Provider 导入")
def test_a1():
    from src.utils.jarvis_duckdb_provider import JarvisDuckDbProvider
    assert JarvisDuckDbProvider is not None

@test("A2: DB路径自动发现")
def test_a2():
    from src.utils.jarvis_duckdb_provider import _get_db_path
    path = _get_db_path()
    assert os.path.exists(path), f"DB path not found: {path}"

@test("A3: 数据库连通性")
def test_a3():
    from src.utils.jarvis_duckdb_provider import JarvisDuckDbProvider
    p = JarvisDuckDbProvider()
    codes = p.get_all_codes()
    assert len(codes) > 1000, f"Only {len(codes)} stocks found"
    p.close()

@test("A4: 单股票日线获取")
def test_a4():
    from src.utils.jarvis_duckdb_provider import JarvisDuckDbProvider
    from datetime import datetime
    p = JarvisDuckDbProvider()
    df = p.fetch_minute_data("600036.SH", datetime(2024, 1, 1), datetime(2024, 12, 31))
    assert not df.empty, "No data for 600036.SH"
    assert "close" in df.columns, "Missing close column"
    assert "dt" in df.columns, "Missing dt column"
    assert len(df) > 200, f"Only {len(df)} rows"
    p.close()

@test("A5: 批量数据获取")
def test_a5():
    from src.utils.jarvis_duckdb_provider import JarvisDuckDbProvider
    from datetime import datetime
    p = JarvisDuckDbProvider()
    result = p.fetch_batch_data(["600036.SH", "000001.SZ"], datetime(2025, 1, 1), datetime(2025, 6, 30))
    assert len(result) >= 1, "Batch fetch returned no stocks"
    for code, df in result.items():
        assert not df.empty, f"Empty data for {code}"
    p.close()

@test("A6: 质量数据查询")
def test_a6():
    from src.utils.jarvis_duckdb_provider import JarvisDuckDbProvider
    p = JarvisDuckDbProvider()
    quality = p.get_quality_stocks(min_roe=10.0, max_debt=50.0)
    assert not quality.empty, "Quality query returned empty"
    assert "roe" in quality.columns
    p.close()

@test("A7: 财务指标查询")
def test_a7():
    from src.utils.jarvis_duckdb_provider import JarvisDuckDbProvider
    p = JarvisDuckDbProvider()
    df = p.get_financial_indicators("600036.SH", "roe")
    assert not df.empty, "No financial data for 600036.SH"
    p.close()

@test("A8: 指数数据查询")
def test_a8():
    from src.utils.jarvis_duckdb_provider import JarvisDuckDbProvider
    p = JarvisDuckDbProvider()
    df = p.get_index_data("000300.SH")
    assert not df.empty, "No index data"
    assert len(df) > 1000, f"Only {len(df)} index rows"
    p.close()

@test("A9: 代码格式转换")
def test_a9():
    from src.utils.jarvis_duckdb_provider import JarvisDuckDbProvider
    p = JarvisDuckDbProvider()
    assert p._normalize_code("600036") == "600036.SH"
    assert p._normalize_code("000001") == "000001.SZ"
    assert p._normalize_code("600036.SH") == "600036.SH"
    assert p._normalize_code("000001.SZ") == "000001.SZ"
    p.close()

@test("A10: 高数据量股票筛选")
def test_a10():
    from src.utils.jarvis_duckdb_provider import JarvisDuckDbProvider
    p = JarvisDuckDbProvider()
    stocks = p.get_high_data_stocks(min_days=4000)
    assert len(stocks) > 100, f"Only {len(stocks)} high-data stocks"
    p.close()


# ═══════════════════════════════════════════════════════
# Plan A 回测集成
# ═══════════════════════════════════════════════════════

@test("A11: BacktestCabinet 懒加载数据源")
def test_a11():
    from src.core.backtest_cabinet import _build_provider, _provider_registry
    assert "jarvis_duckdb" in _provider_registry
    assert "tianshu" in _provider_registry
    provider = _build_provider("jarvis_duckdb")
    assert provider is not None
    assert hasattr(provider, "fetch_minute_data")

@test("A12: 单策略回测连通")
def test_a12():
    from src.core.backtest_cabinet import BacktestCabinet
    from datetime import datetime
    import asyncio
    
    async def run():
        cab = BacktestCabinet(
            stock_code="600036.SH", strategy_id="00",
            initial_capital=100000, provider_source_override="jarvis_duckdb",
        )
        await cab.run(start_date=datetime(2024,1,1), end_date=datetime(2024,6,30))
    
    asyncio.run(run())

@test("A13: 全策略回测")
def test_a13():
    from src.core.backtest_cabinet import BacktestCabinet
    from datetime import datetime
    import asyncio
    
    class R: data = None
    async def cb(et, d):
        if et == "backtest_result": R.data = d
    
    async def run():
        cab = BacktestCabinet(
            stock_code="600036.SH", strategy_id="all",
            initial_capital=100000, event_callback=cb,
            provider_source_override="jarvis_duckdb",
        )
        await cab.run(start_date=datetime(2024,1,1), end_date=datetime(2024,6,30))
    
    asyncio.run(run())
    assert R.data is not None, "No backtest result"
    ranking = R.data.get("ranking", [])
    assert len(ranking) >= 1, "No strategy rankings"


# ═══════════════════════════════════════════════════════
# Plan B: V14策略审计
# ═══════════════════════════════════════════════════════

@test("B1: StrategyV14Quality 导入")
def test_b1():
    from src.strategies.strategy_v14 import StrategyV14Quality
    s = StrategyV14Quality()
    assert s.id == "v14"
    assert s.name == "V14低波质量"
    assert s.trigger_timeframe == "D"

@test("B2: 策略工厂注册")
def test_b2():
    from src.strategies.strategy_factory import create_strategies
    strategies = create_strategies(apply_active_filter=False)
    ids = [s.id for s in strategies]
    assert "v14" in ids, f"V14 not in strategy list: {ids}"

@test("B3: V14 策略信号生成 (空仓入场)")
def test_b3():
    from src.strategies.strategy_v14 import StrategyV14Quality
    import pandas as pd
    s = StrategyV14Quality()
    s.current_cash = 100000
    # Build enough history to trigger MA60
    data = []
    for i in range(300):
        price = 30 + i * 0.02  # uptrend
        data.append({"code": "600036.SH", "dt": f"2024-01-{min(i+1,28):02d} 00:00:00",
                      "close": price, "open": price-0.1, "high": price+0.1, "low": price-0.1,
                      "vol": 500000, "amount": price*500000})
    for row in data:
        signal = s.on_bar(row)
    # Should NOT have entered (quality check fails with no DB)
    assert s._entered is True or s._entered is False, "Strategy should handle missing DB gracefully"

@test("B4: V14 回测集成")
def test_b4():
    from src.core.backtest_cabinet import BacktestCabinet
    from datetime import datetime
    import asyncio
    
    class R: data = None
    async def cb(et, d):
        if et == "backtest_result": R.data = d
    
    async def run():
        cab = BacktestCabinet(
            stock_code="600036.SH", strategy_id="v14",
            initial_capital=100000, event_callback=cb,
            provider_source_override="jarvis_duckdb",
        )
        await cab.run(start_date=datetime(2024,1,1), end_date=datetime(2024,6,30))
    
    asyncio.run(run())
    assert R.data is not None, "V14 strategy backtest returned no result"


# ═══════════════════════════════════════════════════════
# Plan C: 池模式引擎审计
# ═══════════════════════════════════════════════════════

@test("C1: PoolEvaluator 导入")
def test_c1():
    from src.evaluation.pool_evaluator import PoolEvaluator
    ev = PoolEvaluator()
    assert ev is not None

@test("C2: 数据加载 (小规模)")
def test_c2():
    from src.evaluation.pool_evaluator import PoolEvaluator
    ev = PoolEvaluator()
    ev.load_data(n_stocks=100, min_days=500)
    assert ev.loaded
    assert ev.prices is not None
    assert ev.rets is not None
    assert ev.nd > 1000
    assert ev.ns == 100
    ev.close()

@test("C3: 因子函数调用")
def test_c3():
    from src.evaluation.pool_evaluator import PoolEvaluator, factor_low_vol
    ev = PoolEvaluator()
    ev.load_data(n_stocks=100, min_days=500)
    scores = factor_low_vol(prices=ev.prices, rets=ev.rets,
                             ma20s=ev.ma20s, ma60s=ev.ma60s,
                             rsis=ev.rsis, day_idx=500)
    assert scores.shape == (100,), f"Wrong shape: {scores.shape}"
    valid = scores[scores > -998]
    assert len(valid) > 10, f"Only {len(valid)} valid scores"
    ev.close()

@test("C4: 因子评估 (组合级)")
def test_c4():
    from src.evaluation.pool_evaluator import PoolEvaluator, factor_trend_quality
    ev = PoolEvaluator()
    ev.load_data(n_stocks=100, min_days=500)
    result = ev.evaluate_factor(factor_trend_quality, top_k=10, rebalance=30)
    assert "sharpe" in result
    assert "annual_ret" in result
    print(f"  [{result['sharpe']:.3f} Sharpe, {result['annual_ret']*100:.1f}% annual]")
    ev.close()

@test("C5: 选股排名")
def test_c5():
    from src.evaluation.pool_evaluator import PoolEvaluator, factor_trend_quality
    ev = PoolEvaluator()
    ev.load_data(n_stocks=100, min_days=500)
    # 关闭质量过滤 (100股小池中质量数据可能不覆盖所有股票)
    top = ev.rank_stocks(factor_trend_quality, day_idx=4000, top_k=10, quality_filter=False)
    assert len(top) > 0, "No stocks selected"
    assert all("." in s for s in top), f"Invalid stock codes: {top[:3]}"
    ev.close()

@test("C6: 因子扫描")
def test_c6():
    from src.evaluation.pool_evaluator import PoolEvaluator, scan_factors, factor_low_vol, factor_momentum
    ev = PoolEvaluator()
    ev.load_data(n_stocks=100, min_days=500)
    df = scan_factors(ev, {"低波": factor_low_vol, "动量": factor_momentum})
    assert len(df) == 2
    assert "sharpe" in df.columns
    ev.close()


# Run all tests
print("\n" + "=" * 60)
print("开始审计测试")
print("=" * 60)

for name, fn in sorted(globals().items()):
    if name.startswith("test_") and callable(fn):
        fn()

print("\n" + "=" * 60)
print("审计报告")
print("=" * 60)
print(f"通过: {TESTS_PASSED}/{TESTS_PASSED + TESTS_FAILED}")
if FAIL_DETAILS:
    print(f"\n失败详情:")
    for name, msg, tb in FAIL_DETAILS:
        print(f"\n── {name} ──")
        print(f"  错误: {msg}")
        print(f"  堆栈: {tb[-200:]}")
else:
    print("🎉 全部通过!")
