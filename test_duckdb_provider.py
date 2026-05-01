#!/usr/bin/env python3
"""
天枢 DuckDB 数据源连通性测试 + 回测验证

验证:
  1. DuckDB 数据库是否能正常读取
  2. JarvisDuckDbProvider 接口是否兼容 jin-ce-zhi-suan
  3. 用一只股票跑一次快速回测
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))
os.chdir(os.path.dirname(__file__))

from datetime import datetime
from src.utils.jarvis_duckdb_provider import JarvisDuckDbProvider


def test_connectivity():
    """1. 数据库连通性测试"""
    print("=" * 60)
    print("【测试1】DuckDB 数据库连通性")
    print("=" * 60)

    provider = JarvisDuckDbProvider()

    # 获取股票总数
    codes = provider.get_all_codes()
    print(f"✅ 数据库可读取，共 {len(codes)} 只股票")

    # 获取高数据量股票
    high = provider.get_high_data_stocks(min_days=4000)
    print(f"✅ 数据完整度 >4000 天的股票: {len(high)} 只")
    print(f"   前5: {high[:5]}")

    # 获取质量股票池
    quality = provider.get_quality_stocks(min_roe=5.0, max_debt=60.0)
    print(f"✅ ROE>5% 且负债<60% 的股票: {len(quality)} 只")

    provider.close()
    print()


def test_fetch_single_stock():
    """2. 单股票日线数据获取"""
    print("=" * 60)
    print("【测试2】单股票数据获取 (招商银行 600036.SH)")
    print("=" * 60)

    provider = JarvisDuckDbProvider()

    # 获取日线数据 (包装为分钟线格式)
    df = provider.fetch_minute_data(
        "600036.SH",
        datetime(2024, 1, 1),
        datetime(2025, 12, 31)
    )

    if df.empty:
        print("❌ 未获取到数据!")
    else:
        print(f"✅ 获取到 {len(df)} 条K线")
        print(f"   列: {list(df.columns)}")
        print(f"   日期范围: {df['dt'].min()} ~ {df['dt'].max()}")
        print(f"   价格范围: {df['close'].min():.2f} ~ {df['close'].max():.2f}")
        print(f"\n   前3条:")
        print(df.head(3).to_string())
        print(f"\n   后3条:")
        print(df.tail(3).to_string())

    provider.close()
    print()


def test_fetch_index():
    """3. 指数数据获取"""
    print("=" * 60)
    print("【测试3】沪深300指数数据")
    print("=" * 60)

    provider = JarvisDuckDbProvider()
    df = provider.get_index_data("000300.SH")
    if not df.empty:
        print(f"✅ 沪深300: {len(df)} 条数据")
        print(f"   日期: {df['trade_date'].min()} ~ {df['trade_date'].max()}")
        print(f"   最近收盘: {df['close'].iloc[-1]:.2f}")
    else:
        print("❌ 指数数据为空")

    provider.close()
    print()


def test_batch_fetch():
    """4. 批量数据获取"""
    print("=" * 60)
    print("【测试4】批量获取 (3只股票)")
    print("=" * 60)

    provider = JarvisDuckDbProvider()

    codes = ["600036.SH", "000001.SZ", "600519.SH"]
    result = provider.fetch_batch_data(codes, datetime(2025, 1, 1), datetime(2025, 12, 31))

    for code, df in result.items():
        print(f"  {code}: {len(df)} 条K线")

    provider.close()
    print()


def test_financial():
    """5. 财务指标获取"""
    print("=" * 60)
    print("【测试5】财务指标 (招商银行 ROE)")
    print("=" * 60)

    provider = JarvisDuckDbProvider()

    df = provider.get_financial_indicators("600036.SH", "roe")
    if not df.empty:
        print(f"✅ 获取到 {len(df)} 条财务记录")
        print(f"   最近ROE:")
        for _, row in df.head(5).iterrows():
            print(f"     {row['end_date']} | ROE={row['roe']:.2f}%")
    else:
        print("⚠️ 财务数据为空 (可能表名或字段不对)")

    provider.close()
    print()


def test_backtest_integration():
    """6. 集成到回测框架的测试"""
    print("=" * 60)
    print("【测试6】三省六部回测集成 (招商银行, 单策略)")
    print("=" * 60)

    from src.core.backtest_cabinet import BacktestCabinet

    cab = BacktestCabinet(
        stock_code="600036.SH",
        strategy_id="01",      # 三周期共振波段
        initial_capital=1_000_000,
        provider_source_override="jarvis_duckdb",
    )

    import asyncio

    async def run():
        await cab.run(
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2025, 12, 31),
        )

    asyncio.run(run())
    print()


if __name__ == "__main__":
    # Skip if no DuckDB data available
    try:
        from src.utils.jarvis_duckdb_provider import _get_db_path
        _get_db_path()
    except FileNotFoundError:
        print("SKIP: DuckDB database not found. Set TIANSHU_DUCKDB_PATH or ensure quant_merged_v2/data/quant.duckdb exists.")
        import sys; sys.exit(0)

    test_connectivity()
    test_fetch_single_stock()
    test_fetch_index()
    test_batch_fetch()
    test_financial()

    print("=" * 60)
    print("是否运行回测集成测试? (y/n)")
    print("=" * 60)
    # test_backtest_integration()  # 取消注释以运行回测
