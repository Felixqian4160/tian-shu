# 天枢 (tian-shu) — 量化策略融合引擎

> 取北斗第一星"天枢"之意 — 古人靠它导航，量化系统靠它指引决策。

## 项目定位

天枢是 **金策智算（三省六部框架）** 与 **quant_merged_v2（高质量数据+深度策略）** 的融合项目。

```
金策智算（框架层）                quant_merged_v2（内核层）
┌─────────────────────┐          ┌─────────────────────┐
│ Web面板 + API       │          │ 高质DuckDB数据库    │ ← 已接入 ✅
│ 三省六部风控        │  ◄─── 嵌入 ──  V10/V14 策略     │ ← 待移植
│ 10策略并行对比      │          │  PIT 无偏回测        │
│ 策略进化引擎        │  ◄─── 接入 ──  SQL因子挖掘        │ ← 待接入
│ TDX 公式编译        │          │  质量因子矩阵        │
└─────────────────────┘          └─────────────────────┘
```

## 融合计划

| 阶段 | 内容 | 状态 |
|------|------|------|
| **A: 数据接入** | DuckDB → 三省六部, 5508只×20年数据 | ✅ 完成 |
| **B: 策略移植** | V14 作为第11个内置策略 | 📋 计划中 |
| **C: 进化引擎** | LLM因子假设 + DuckDB SQL秒级评估 | 📋 计划中 |

## 方案A 实施内容

### 新增文件

| 文件 | 行数 | 功能 |
|------|------|------|
| `src/utils/jarvis_duckdb_provider.py` | 300+ | DuckDB 数据源提供者 |
| `test_duckdb_provider.py` | 120 | 连通性+回测验证 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/core/backtest_cabinet.py` | 懒加载数据源注册表 + jarvis_duckdb 连通性检查 |
| `config.json` | 数据源配置 → `jarvis_duckdb`, 激活全部10策略 |

### 数据库能力

```
表              行数        说明
─────────────────────────────────────────
ohlcv_daily    14.4M       5508股日线OHLCV (2006-2026)
stock_basic     5.5K       股票元数据
fina_indicator  104K       财务指标 (ROE/负债/增速)
index_daily     5.2K       沪深300指数
v_quality_stocks 41K       质量筛选股票池
```

### 已验证结果

**招商银行 (600036.SH) 2024-2025 回测:**

| 排名 | 策略 | 评级 | 年化 | 回撤 | 胜率 |
|------|------|------|------|------|------|
| 1 | 03 日内突破反转 | **S** | 20.8% | 0.6% | 96.2% |
| 2 | 07 MACD背离 | A | 29.7% | 3.2% | 83.9% |
| 3 | 06 RSI超卖反弹 | B | 2.3% | 0.7% | 70.0% |
| 4 | 00 长期持有 | B | 19.1% | 0.0% | 100% |
| 5 | 05 布林带回归 | C | 4.8% | 2.7% | 40.0% |

## 使用方法

```bash
cd tian-shu

# 确保 DuckDB 数据库路径正确
export TIANSHU_DUCKDB_PATH="../quant_merged_v2/data/quant.duckdb"

# 单股票回测
python -c "
import sys; sys.path.insert(0,'src')
from src.core.backtest_cabinet import BacktestCabinet
from datetime import datetime
import asyncio

async def main():
    cab = BacktestCabinet(
        stock_code='600036.SH', strategy_id='all',
        initial_capital=1_000_000,
        provider_source_override='jarvis_duckdb',
    )
    await cab.run(start_date=datetime(2024,1,1), end_date=datetime(2025,12,31))

asyncio.run(main())
"

# 运行测试
python test_duckdb_provider.py
```

## 项目结构

```
tian-shu/
├── src/
│   ├── core/              # 三省核心 (CrownPrince/Zhongshu/Menxia/Shangshu)
│   ├── ministries/        # 六部职能 (兵法礼户刑工)
│   ├── strategies/        # 10套内置策略
│   ├── evolution/         # 策略进化引擎 (8.7K行)
│   ├── utils/
│   │   └── jarvis_duckdb_provider.py  ← 🆕 DuckDB数据源
│   ├── tdx/               # 通达信集成
│   └── consistency/       # 回测-实盘一致性
├── config.json            # 已配置为 jarvis_duckdb
├── server.py              # FastAPI Web面板 (8.7K行)
├── dashboard.html         # Web前端面板
├── test_duckdb_provider.py ← 🆕 测试脚本
└── TIANSHU.md             # 本文档
```

## 依赖

最低要求: Python 3.8+, duckdb, pandas, numpy

```bash
pip install duckdb pandas numpy
```

可选: fastapi, uvicorn (Web面板), akshare, tushare (其他数据源)
