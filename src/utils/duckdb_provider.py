import os
import re
from datetime import datetime, timedelta

import pandas as pd

from src.utils.config_loader import ConfigLoader
from src.utils.indicators import Indicators


class DuckDbProvider:
    def __init__(self, db_path=None):
        cfg = ConfigLoader.reload()
        self.db_path = str(db_path or cfg.get("data_provider.duckdb_path", "")).strip()
        self.page_size = max(1000, int(cfg.get("data_provider.duckdb_query_page_size", 20000) or 20000))
        self.last_error = ""
        self._table_defaults = {
            "1min": "dat_1mins",
            "5min": "dat_5mins",
            "10min": "dat_10mins",
            "15min": "dat_15mins",
            "30min": "dat_30mins",
            "60min": "dat_60mins",
            "D": "dat_day",
        }

    def _load_duckdb(self):
        try:
            import duckdb
            return duckdb
        except Exception as e:
            self.last_error = f"duckdb 未安装或导入失败: {e}"
            return None

    def _resolve_db_path(self):
        raw = str(self.db_path or "").strip()
        if not raw:
            return ""
        if raw == ":memory:" or os.path.exists(raw):
            return raw
        root, ext = os.path.splitext(raw)
        if (not ext) and os.path.exists(f"{raw}.duckdb"):
            return f"{raw}.duckdb"
        return raw

    def _connect(self, read_only=True):
        resolved_path = self._resolve_db_path()
        if not resolved_path:
            self.last_error = "DuckDB 路径未配置"
            return None
        if resolved_path != ":memory:" and not os.path.exists(resolved_path):
            self.last_error = f"DuckDB 文件不存在: {resolved_path}"
            return None
        duckdb = self._load_duckdb()
        if duckdb is None:
            return None
        try:
            return duckdb.connect(database=resolved_path, read_only=bool(read_only))
        except Exception as e:
            self.last_error = f"DuckDB 连接失败: {e}"
            return None

    def _code_variants(self, code):
        c = str(code).upper().strip()
        variants = [c]
        if c.startswith("SH") or c.startswith("SZ"):
            raw = c[2:]
            if len(raw) == 6:
                suffix = ".SH" if c.startswith("SH") else ".SZ"
                variants.append(f"{raw}{suffix}")
        if "." not in c and len(c) == 6 and c.isdigit():
            suffix = ".SH" if c.startswith("6") else ".SZ"
            variants.append(f"{c}{suffix}")
        no_suffix = c.replace(".SH", "").replace(".SZ", "")
        if no_suffix and no_suffix != c:
            variants.append(no_suffix)
        out = []
        seen = set()
        for x in variants:
            if x and x not in seen:
                seen.add(x)
                out.append(x)
        return out

    def _normalize_ts_series(self, values):
        ts = pd.to_datetime(values, errors="coerce")
        try:
            tz_obj = getattr(ts.dt, "tz", None)
            if tz_obj is not None:
                ts = ts.dt.tz_convert("Asia/Shanghai").dt.tz_localize(None)
        except Exception:
            pass
        return ts

    def _normalize_df(self, df):
        if df is None or df.empty:
            return pd.DataFrame()
        if "trade_time" in df.columns and "dt" not in df.columns:
            df = df.rename(columns={"trade_time": "dt"})
        if "ts_code" in df.columns and "code" not in df.columns:
            df = df.rename(columns={"ts_code": "code"})
        required = ["code", "dt", "open", "high", "low", "close", "vol", "amount"]
        for c in required:
            if c not in df.columns:
                return pd.DataFrame()
        df["dt"] = self._normalize_ts_series(df["dt"])
        for c in ["open", "high", "low", "close", "vol", "amount"]:
            df[c] = pd.to_numeric(df[c], errors="coerce")
        df = df.dropna(subset=["dt", "open", "high", "low", "close"])
        df = df.sort_values("dt").drop_duplicates(subset=["dt"]).reset_index(drop=True)
        return df[["code", "dt", "open", "high", "low", "close", "vol", "amount"]]

    def _normalize_for_upsert(self, df):
        norm = self._normalize_df(df)
        if norm.empty:
            return pd.DataFrame()
        norm["code"] = norm["code"].astype(str).str.upper()
        norm["trade_time"] = pd.to_datetime(norm["dt"], errors="coerce")
        norm = norm.dropna(subset=["trade_time"])
        return norm[["code", "trade_time", "open", "high", "low", "close", "vol", "amount"]].copy()

    def _safe_table_name(self, name):
        t = str(name or "").strip()
        if not t:
            return ""
        if not re.match(r"^[A-Za-z0-9_]+$", t):
            return ""
        return t

    def _quoted_table(self, table):
        return f'"{table}"'

    def _resolve_table_name(self, interval):
        cfg = ConfigLoader.reload()
        key_map = {
            "1min": "data_provider.duckdb_table_1min",
            "5min": "data_provider.duckdb_table_5min",
            "10min": "data_provider.duckdb_table_10min",
            "15min": "data_provider.duckdb_table_15min",
            "30min": "data_provider.duckdb_table_30min",
            "60min": "data_provider.duckdb_table_60min",
            "D": "data_provider.duckdb_table_day",
        }
        cfg_name = self._safe_table_name(cfg.get(key_map.get(interval, ""), ""))
        if cfg_name:
            return cfg_name
        return self._table_defaults.get(interval, "")

    def _query_time_text(self, value):
        dt = pd.to_datetime(value, errors="coerce")
        if pd.isna(dt):
            return str(value or "")
        try:
            if getattr(dt, "tzinfo", None) is not None:
                dt = dt.tz_localize(None)
        except Exception:
            pass
        return dt.strftime("%Y-%m-%d %H:%M:%S")

    def _fetch_rows_paged(self, conn, table, code, start_time, end_time):
        offset = 0
        chunks = []
        start_text = self._query_time_text(start_time)
        end_text = self._query_time_text(end_time)
        sql = (
            f"SELECT code, trade_time AS dt, open, high, low, close, vol, amount "
            f"FROM {self._quoted_table(table)} "
            f"WHERE code = ? AND CAST(trade_time AS VARCHAR) >= ? AND CAST(trade_time AS VARCHAR) <= ? "
            f"ORDER BY CAST(trade_time AS VARCHAR) ASC LIMIT ? OFFSET ?"
        )
        while True:
            frame = conn.execute(sql, [code, start_text, end_text, self.page_size, offset]).fetchdf()
            if frame is None or frame.empty:
                break
            chunks.append(frame)
            if len(frame) < self.page_size:
                break
            offset += self.page_size
        if not chunks:
            return pd.DataFrame()
        return pd.concat(chunks, ignore_index=True)


    def _query_range(self, code, start_time, end_time, interval):
        table = self._resolve_table_name(interval)
        if not table:
            self.last_error = f"未配置 {interval} 对应的 DuckDB 表名"
            return pd.DataFrame()
        conn = self._connect(read_only=True)
        if conn is None:
            return pd.DataFrame()
        try:
            for c in self._code_variants(code):
                raw_df = self._fetch_rows_paged(conn, table, c, start_time, end_time)
                if raw_df is not None and not raw_df.empty:
                    return self._normalize_df(raw_df)
            return pd.DataFrame()
        except Exception as e:
            self.last_error = f"DuckDB 查询失败: {e}"
            return pd.DataFrame()
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def check_connectivity(self, code):
        conn = self._connect(read_only=True)
        if conn is None:
            return False, self.last_error or "DuckDB 连接失败"
        try:
            conn.execute("SELECT 1 AS ok").fetchone()
            table = self._resolve_table_name("1min")
            if not table:
                return True, "ok_no_data"
            sql = (
                f"SELECT 1 AS ok FROM {self._quoted_table(table)} "
                f"WHERE code = ? LIMIT 1"
            )
            for c in self._code_variants(code):
                row = conn.execute(sql, [c]).fetchone()
                if row:
                    return True, "ok"
            return True, "ok_no_data"
        except Exception as e:
            self.last_error = f"DuckDB 连通性检查失败: {e}"
            return False, self.last_error
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def fetch_minute_data(self, code, start_time, end_time):
        return self._query_range(code, start_time, end_time, "1min")

    def fetch_daily_data(self, code, start_time, end_time):
        return self._query_range(code, start_time, end_time, "D")

    def fetch_kline_data_strict(self, code, start_time, end_time, interval="1min"):
        iv = str(interval or "1min")
        return self._query_range(code, start_time, end_time, iv)

    def fetch_kline_data(self, code, start_time, end_time, interval="1min"):
        iv = str(interval or "1min")
        if iv == "1min":
            return self.fetch_minute_data(code, start_time, end_time)
        if iv == "D":
            daily = self.fetch_daily_data(code, start_time, end_time)
            if not daily.empty:
                return daily
            minute = self.fetch_minute_data(code, start_time, end_time)
            return Indicators.resample(minute, "D") if not minute.empty else pd.DataFrame()
        tf_df = self._query_range(code, start_time, end_time, iv)
        if not tf_df.empty:
            return tf_df
        minute = self.fetch_minute_data(code, start_time, end_time)
        if minute.empty:
            return pd.DataFrame()
        return Indicators.resample(minute, iv)

    def get_latest_bar(self, code):
        table = self._resolve_table_name("1min")
        if not table:
            self.last_error = "未配置 duckdb_table_1min"
            return None
        conn = self._connect(read_only=True)
        if conn is None:
            return None
        sql = (
            f"SELECT code, trade_time AS dt, open, high, low, close, vol, amount "
            f"FROM {self._quoted_table(table)} WHERE code = ? ORDER BY CAST(trade_time AS VARCHAR) DESC LIMIT 1"
        )
        try:
            for c in self._code_variants(code):
                row = conn.execute(sql, [c]).fetchdf()
                if row is None or row.empty:
                    continue
                df = self._normalize_df(row)
                if df.empty:
                    continue
                r = df.iloc[-1]
                return {
                    "code": str(r["code"]),
                    "dt": r["dt"],
                    "open": float(r["open"]),
                    "high": float(r["high"]),
                    "low": float(r["low"]),
                    "close": float(r["close"]),
                    "vol": float(r["vol"]),
                    "amount": float(r["amount"]),
                }
        except Exception as e:
            self.last_error = f"DuckDB latest 查询失败: {e}"
            return None
        finally:
            try:
                conn.close()
            except Exception:
                pass
        return None

    def _delete_then_insert_rows(self, conn, table, rows):
        delete_sql = (
            f"DELETE FROM {self._quoted_table(table)} "
            f"WHERE code = ? AND CAST(trade_time AS VARCHAR) = ?"
        )
        insert_sql = (
            f"INSERT INTO {self._quoted_table(table)} (code, trade_time, open, high, low, close, vol, amount) "
            f"VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        delete_params = [
            (str(row[0]), self._query_time_text(row[1]))
            for row in rows
        ]
        conn.executemany(delete_sql, delete_params)
        conn.executemany(insert_sql, rows)

    def upsert_kline_data(self, df, interval="1min", batch_size=2000):
        table = self._resolve_table_name(str(interval or "1min"))
        if not table:
            self.last_error = f"未配置 {interval} 对应的 DuckDB 表名"
            return 0
        norm = self._normalize_for_upsert(df)
        if norm.empty:
            return 0
        rows = [
            (
                str(r["code"]),
                pd.to_datetime(r["trade_time"]).to_pydatetime(),
                float(r["open"]),
                float(r["high"]),
                float(r["low"]),
                float(r["close"]),
                float(r["vol"]),
                float(r["amount"]),
            )
            for _, r in norm.iterrows()
        ]
        conn = self._connect(read_only=False)
        if conn is None:
            return 0
        written = 0
        upsert_sql = (
            f"INSERT INTO {self._quoted_table(table)} (code, trade_time, open, high, low, close, vol, amount) "
            f"VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
            f"ON CONFLICT (code, trade_time) DO UPDATE SET "
            f"open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close, "
            f"vol=EXCLUDED.vol, amount=EXCLUDED.amount"
        )
        try:
            step = max(1, int(batch_size or 2000))
            for i in range(0, len(rows), step):
                chunk = rows[i:i + step]
                try:
                    conn.executemany(upsert_sql, chunk)
                except Exception as e:
                    err_text = str(e).lower()
                    if "conflict target" in err_text or ("unique" in err_text and "primary key" in err_text):
                        self._delete_then_insert_rows(conn, table, chunk)
                    else:
                        raise
                written += len(chunk)
        except Exception as e:
            self.last_error = f"DuckDB 写入缓存失败: {e}"
            return 0
        finally:
            try:
                conn.close()
            except Exception:
                pass
        return written
