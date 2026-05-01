"""
天枢 DuckDB 数据源 — 对接 quant_merged_v2 的高质量 DuckDB 数据库

数据覆盖:
  - ohlcv_daily: 14.4M 行, 5508 只股票, 2006-2026 日线
  - fina_indicator: 104K 行财务指标 (ROE/负债/增速等)
  - stock_basic: 5508 只股票元数据
  - index_daily: 5173 行沪深300指数日线

接口兼容 jin-ce-zhi-suan 的 DataProvider 协议:
  - fetch_minute_data(code, start, end) → DataFrame with [code, dt, open, high, low, close, vol, amount]
"""

from __future__ import annotations

import os
import logging
from datetime import datetime, timedelta
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

# DuckDB 数据库默认路径 (相对于 tian-shu 项目根目录)
_DEFAULT_DB_PATH: Optional[str] = None


def _get_db_path() -> str:
    """获取 DuckDB 数据库路径"""
    global _DEFAULT_DB_PATH
    if _DEFAULT_DB_PATH and os.path.exists(_DEFAULT_DB_PATH):
        return _DEFAULT_DB_PATH

    # 默认路径: 优先用数据中心的新DB, 回退到旧DB
    candidates = [
        os.environ.get("TIANSHU_DUCKDB_PATH", ""),
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "data", "db", "tianshu_data.duckdb"),
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "quant_merged_v2", "data", "quant.duckdb"),
        os.path.join(os.path.dirname(__file__), "..", "..", "quant_merged_v2", "data", "quant.duckdb"),
    ]
    for p in candidates:
        if p and os.path.exists(p):
            _DEFAULT_DB_PATH = p
            return p

    raise FileNotFoundError(
        "找不到 DuckDB 数据库。请设置环境变量 TIANSHU_DUCKDB_PATH "
        "或确保 quant_merged_v2/data/quant.duckdb 存在"
    )


class JarvisDuckDbProvider:
    """
    天枢 DuckDB 数据源提供者

    从 quant_merged_v2 的 DuckDB 数据库读取日线 OHLCV 数据，
    包装为 jin-ce-zhi-suan 兼容的分钟线 DataFrame 格式。

    用法:
        provider = JarvisDuckDbProvider()
        df = provider.fetch_minute_data("600036.SH", datetime(2024,1,1), datetime(2025,12,31))
        # df 包含列: code, dt, open, high, low, close, vol, amount
    """

    _conn = None  # 全局连接复用

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or _get_db_path()
        self.last_error = ""
        # 缓存: 全量价格矩阵 (只加载一次)
        self._price_cache: Optional[pd.DataFrame] = None
        self._code_set: Optional[set] = None
        self._index_cache: Optional[pd.DataFrame] = None
        self._quality_cache: Optional[pd.DataFrame] = None

    @property
    def conn(self):
        """懒加载 DuckDB 连接（自动导入 duckdb）"""
        if self._conn is None:
            import duckdb
            self._conn = duckdb.connect(self.db_path, read_only=True)
        return self._conn

    # ── 核心接口: fetch_minute_data ──────────────────────────────

    def fetch_minute_data(
        self, code: str, start_time: datetime, end_time: datetime,
        freq: str = "1min"
    ) -> pd.DataFrame:
        """
        获取指定股票的日线数据，包装为分钟线格式。

        Args:
            code: 股票代码 (如 "600036.SH", "000001.SZ")
            start_time: 开始时间
            end_time: 结束时间

        Returns:
            DataFrame 包含列: [code, dt, open, high, low, close, vol, amount]
            如果无数据返回空 DataFrame
        """
        try:
            ts_code = self._normalize_code(code)

            # 降级链: 优先用请求的粒度, 不存在则逐级降级
            freq_chain = ["1min","5min","15min","30min","60min","D"]
            try_idx = freq_chain.index(freq) if freq in freq_chain else len(freq_chain)-1
            
            table = None
            for f in freq_chain[try_idx:]:
                tname = f"ohlcv_{f}" if f != "D" else "ohlcv_daily"
                exists = self.conn.execute(
                    f"SELECT COUNT(*) FROM information_schema.tables WHERE table_name='{tname}'"
                ).fetchone()[0]
                if exists > 0:
                    table = tname
                    freq = f
                    break
            
            if table is None:
                table = "ohlcv_daily"
                freq = "D"
            
            if freq == "D":
                time_col = "trade_date"
                start_str = start_time.strftime("%Y-%m-%d")
                end_str = end_time.strftime("%Y-%m-%d")
            else:
                time_col = "trade_time"
                start_str = start_time.strftime("%Y-%m-%d %H:%M:%S")
                end_str = end_time.strftime("%Y-%m-%d %H:%M:%S")

            # 查询
            if table == "ohlcv_daily":
                df = self.conn.execute(f"""
                    SELECT trade_date AS dt, open, high, low, close, vol, amount
                    FROM {table}
                    WHERE ts_code = '{ts_code}'
                      AND trade_date BETWEEN '{start_str}' AND '{end_str}'
                    ORDER BY trade_date
                """).df()
            else:
                df = self.conn.execute(f"""
                    SELECT trade_time AS dt, open, high, low, close, vol, amount
                    FROM {table}
                    WHERE ts_code = '{ts_code}'
                      AND trade_time BETWEEN '{start_str}' AND '{end_str}'
                    ORDER BY trade_time
                """).df()

            if df.empty:
                self.last_error = f"no_data code={code} table={table} range={start_str}..{end_str}"
                return pd.DataFrame()

            # 转换为兼容格式
            df["code"] = code
            df["dt"] = pd.to_datetime(df["dt"])
            for c in ["open", "high", "low", "close", "vol", "amount"]:
                if c in df.columns:
                    df[c] = pd.to_numeric(df[c], errors="coerce")

            cols = ["code", "dt", "open", "high", "low", "close", "vol", "amount"]
            return df[[c for c in cols if c in df.columns]].reset_index(drop=True)

        except Exception as e:
            self.last_error = f"fetch_failed code={code} err={e}"
            logger.warning(f"DuckDB fetch {code}: {e}")
            return pd.DataFrame()

    def fetch_daily_data(
        self, code: str, start_time: datetime, end_time: datetime
    ) -> pd.DataFrame:
        """
        获取日线数据（原始格式，不做分钟转换）

        Returns:
            DataFrame 包含列: [trade_date, open, high, low, close, vol, amount]
        """
        try:
            start_str = start_time.strftime("%Y-%m-%d")
            end_str = end_time.strftime("%Y-%m-%d")
            ts_code = self._normalize_code(code)

            df = self.conn.execute(f"""
                SELECT trade_date, ts_code, open, high, low, close, vol, amount
                FROM ohlcv_daily
                WHERE ts_code = '{ts_code}'
                  AND trade_date BETWEEN '{start_str}' AND '{end_str}'
                ORDER BY trade_date
            """).df()

            return df
        except Exception as e:
            self.last_error = f"daily_fetch_failed code={code} err={e}"
            return pd.DataFrame()

    def fetch_kline_data(
        self, code: str, start_time: datetime, end_time: datetime, interval: str = "1min"
    ) -> pd.DataFrame:
        """兼容 kline 接口 — 根据 interval 选择表"""
        freq = interval if interval in ("1min","5min","15min","30min","60min","D") else "1min"
        return self.fetch_minute_data(code, start_time, end_time, freq=freq)

    # ── 批量接口 ─────────────────────────────────────────────────

    def fetch_batch_data(
        self, codes: list[str], start_time: datetime, end_time: datetime
    ) -> dict[str, pd.DataFrame]:
        """
        批量获取多只股票数据

        Returns:
            {code: DataFrame} 字典
        """
        result = {}
        start_str = start_time.strftime("%Y-%m-%d")
        end_str = end_time.strftime("%Y-%m-%d")

        normalized = [self._normalize_code(c) for c in codes]
        code_str = "', '".join(normalized)

        try:
            df = self.conn.execute(f"""
                SELECT ts_code, trade_date, open, high, low, close, vol, amount
                FROM ohlcv_daily
                WHERE ts_code IN ('{code_str}')
                  AND trade_date BETWEEN '{start_str}' AND '{end_str}'
                ORDER BY ts_code, trade_date
            """).df()

            if df.empty:
                return result

            for ts_code, group in df.groupby("ts_code"):
                # 反向映射回原始代码格式
                orig_code = self._denormalize_code(ts_code, codes)
                result[orig_code] = self._to_minute_format(group, orig_code)

            return result
        except Exception as e:
            self.last_error = f"batch_fetch_failed err={e}"
            return result

    # ── 质量数据接口 ─────────────────────────────────────────────

    def get_quality_stocks(
        self,
        min_roe: float = 3.0,
        max_debt: float = 80.0,
        min_growth: float = 0.0,
    ) -> pd.DataFrame:
        """
        获取质量筛选后的股票池 (对应 quant_merged_v2 的 quality_matrix)

        Args:
            min_roe: 最低 ROE (%)
            max_debt: 最高负债率 (%)
            min_growth: 最低净利润增长率 (%)

        Returns:
            DataFrame 包含: ts_code, name, industry, roe, netprofit_yoy, debt_to_assets, fcff
        """
        try:
            df = self.conn.execute(f"""
                SELECT ts_code, name, industry, roe, netprofit_yoy, debt_to_assets, fcff
                FROM v_quality_stocks
                WHERE roe > {min_roe}
                  AND debt_to_assets < {max_debt}
                  AND netprofit_yoy > {min_growth}
                ORDER BY roe DESC
            """).df()

            return df
        except Exception as e:
            self.last_error = f"quality_stocks_failed err={e}"
            return pd.DataFrame()

    def get_high_data_stocks(self, min_days: int = 4500) -> list[str]:
        """
        获取数据完整度最高的股票 (至少 min_days 个交易日)

        Args:
            min_days: 最少交易日数

        Returns:
            股票代码列表
        """
        try:
            rows = self.conn.execute(f"""
                SELECT ts_code, COUNT(*) as days
                FROM ohlcv_daily
                GROUP BY ts_code
                HAVING COUNT(*) > {min_days}
                ORDER BY COUNT(*) DESC
            """).fetchall()

            return [r[0] for r in rows]
        except Exception as e:
            self.last_error = f"high_data_stocks_failed err={e}"
            return []

    def get_financial_indicators(
        self, code: str, field: str = "roe"
    ) -> pd.DataFrame:
        """
        获取单只股票的财务指标时序

        Args:
            code: 股票代码
            field: 指标名 (roe, debt_to_assets, netprofit_yoy, eps, etc.)

        Returns:
            DataFrame: ann_date, end_date, {field}
        """
        try:
            ts_code = self._normalize_code(code)
            valid_fields = {
                "roe", "eps", "bps", "debt_to_assets", "netprofit_yoy",
                "gross_margin", "current_ratio", "assets_turn", "ocfps",
                "cfps", "fcff", "fcfe"
            }
            if field not in valid_fields:
                field = "roe"

            df = self.conn.execute(f"""
                SELECT ann_date, end_date, {field}
                FROM fina_indicator
                WHERE ts_code = '{ts_code}'
                ORDER BY end_date DESC
            """).df()

            return df
        except Exception as e:
            self.last_error = f"financial_failed code={code} err={e}"
            return pd.DataFrame()

    def get_index_data(
        self, code: str = "000300.SH",
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
    ) -> pd.DataFrame:
        """获取指数日线数据 (默认沪深300)"""
        try:
            where_clauses = [f"ts_code = '{code}'"]
            if start_time:
                where_clauses.append(f"trade_date >= '{start_time.strftime('%Y-%m-%d')}'")
            if end_time:
                where_clauses.append(f"trade_date <= '{end_time.strftime('%Y-%m-%d')}'")

            where = " AND ".join(where_clauses)
            df = self.conn.execute(f"""
                SELECT trade_date, close
                FROM index_daily
                WHERE {where}
                ORDER BY trade_date
            """).df()

            return df
        except Exception as e:
            self.last_error = f"index_failed code={code} err={e}"
            return pd.DataFrame()

    # ── 市场数据查询 ─────────────────────────────────────────────

    def get_all_codes(self) -> list[str]:
        """获取所有股票代码"""
        if self._code_set is None:
            rows = self.conn.execute(
                "SELECT DISTINCT ts_code FROM ohlcv_daily"
            ).fetchall()
            self._code_set = {r[0] for r in rows}
        return sorted(self._code_set)

    def get_stock_info(self, code: str) -> Optional[dict]:
        """获取股票基本信息"""
        ts_code = self._normalize_code(code)
        row = self.conn.execute(f"""
            SELECT ts_code, symbol, name, industry, list_date, market
            FROM stock_basic
            WHERE ts_code = '{ts_code}'
        """).fetchone()

        if row:
            return {
                "ts_code": row[0], "symbol": row[1], "name": row[2],
                "industry": row[3], "list_date": row[4], "market": row[5],
            }
        return None

    def get_trade_dates(
        self, start: datetime, end: datetime
    ) -> list[str]:
        """获取交易日历"""
        try:
            rows = self.conn.execute(f"""
                SELECT DISTINCT trade_date
                FROM ohlcv_daily
                WHERE trade_date BETWEEN '{start.strftime('%Y-%m-%d')}' AND '{end.strftime('%Y-%m-%d')}'
                ORDER BY trade_date
            """).fetchall()
            return [r[0].strftime("%Y-%m-%d") if hasattr(r[0], 'strftime') else str(r[0]) for r in rows]
        except Exception:
            return []

    # ── 内部工具方法 ─────────────────────────────────────────────

    def _normalize_code(self, code: str) -> str:
        """确保代码使用点号格式: 600036.SH (DuckDB 格式)"""
        code = code.strip().upper()
        # 已经是点号格式
        if "." in code:
            return code
        # 6位纯数字: A股
        if len(code) == 6 and code.isdigit():
            if code.startswith(("0", "3")):
                return f"{code}.SZ"
            else:
                return f"{code}.SH"
        return code

    def _denormalize_code(self, ts_code: str, candidates: list[str]) -> str:
        """将 DuckDB 代码格式反向映射回用户输入的格式"""
        ts_code = ts_code.strip().upper()
        for c in candidates:
            if self._normalize_code(c) == ts_code:
                return c
        return ts_code

    def _to_minute_format(self, df: pd.DataFrame, code: str) -> pd.DataFrame:
        """
        将 DuckDB 日线数据转换为 jin-ce-zhi-suan 兼容的分钟线格式

        DuckDB 列: trade_date, open, high, low, close, vol, amount
        输出列:    code, dt, open, high, low, close, vol, amount
        """
        if df is None or df.empty:
            return pd.DataFrame()

        out = df.copy()

        # 重命名列
        col_map = {}
        if "trade_date" in out.columns and "dt" not in out.columns:
            col_map["trade_date"] = "dt"
        if "ts_code" in out.columns and "code" not in out.columns:
            col_map["ts_code"] = "code"

        if col_map:
            out = out.rename(columns=col_map)

        # 确保有 code 列
        if "code" not in out.columns:
            out["code"] = code

        # dt 转为 datetime (DuckDB DATE → pandas Timestamp)
        if "dt" in out.columns:
            out["dt"] = pd.to_datetime(out["dt"])

        # 确保所需的数值列存在且为数值类型
        for col in ["open", "high", "low", "close", "vol", "amount"]:
            if col in out.columns:
                out[col] = pd.to_numeric(out[col], errors="coerce")

        # 选择需要的列 (按 jin-ce-zhi-suan 期望的顺序)
        required = ["code", "dt", "open", "high", "low", "close", "vol", "amount"]
        available = [c for c in required if c in out.columns]
        out = out[available]

        # 去除空值行
        out = out.dropna(subset=["dt", "open", "high", "low", "close"])

        return out.reset_index(drop=True)

    def close(self):
        """关闭数据库连接"""
        if self._conn is not None:
            self._conn.close()
            self._conn = None
