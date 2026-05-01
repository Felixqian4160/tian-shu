#!/usr/bin/env python3
"""
天枢 TDX真实分钟数据下载 v2
- mootdx 网络镜像, 15分钟粒度
- 分批拉取: start=0,800,1600,...,6400
- 覆盖 2024-06 ~ 2026-04
"""
import sys, os, time
import pandas as pd
import numpy as np
import duckdb
from mootdx.quotes import Quotes

TEST_STOCKS = ["600036","000001","600519","000651","600276","000858","601318","002415"]
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "quant_merged_v2", "data", "quant.duckdb")
BATCH_SIZE = 800
MAX_START = 6400

def market(code):
    return 1 if code.startswith(("6","5","9")) else 0

def download_full(q, code):
    """分批拉取全部可用历史"""
    dfs = []
    for start in range(0, MAX_START + 1, BATCH_SIZE):
        try:
            r = q.bars(symbol=code, frequency=1, start=start, offset=BATCH_SIZE)
            if r is None or len(r) < 10:
                break
            dfs.append(r)
        except:
            break
        time.sleep(0.2)
    
    if not dfs:
        return pd.DataFrame()

    df = pd.concat(dfs)
    df = df.loc[:, ~df.columns.duplicated()]
    df = df.rename(columns={
        "datetime": "trade_time", "volume": "vol",
    })
    suffix = "SH" if market(code) else "SZ"
    df["ts_code"] = f"{code}.{suffix}"
    df["trade_time"] = pd.to_datetime(df["trade_time"])
    
    cols = ["ts_code","trade_time","open","high","low","close","vol","amount"]
    return df[[c for c in cols if c in df.columns]].drop_duplicates("trade_time").sort_values("trade_time")

def resample_simple(df, freq):
    df2 = df.set_index("trade_time")
    r = pd.DataFrame({
        "open": df2["open"].resample(freq).first(),
        "high": df2["high"].resample(freq).max(),
        "low": df2["low"].resample(freq).min(),
        "close": df2["close"].resample(freq).last(),
        "vol": df2["vol"].resample(freq).sum(),
        "amount": df2["amount"].resample(freq).sum(),
    }).dropna()
    r["ts_code"] = df["ts_code"].iloc[0]
    r["trade_time"] = r.index
    return r.reset_index(drop=True)

def main():
    t0 = time.time()
    print(f"🔧 TDX 真实分钟数据 v2")
    print(f"   粒度: 15min | 分批: 0~{MAX_START} | 目标: {len(TEST_STOCKS)}股\n")
    
    q = Quotes.factory(market="std")
    con = duckdb.connect(DB_PATH)

    for table in ["ohlcv_15min"]:
        try: con.execute(f"DROP TABLE IF EXISTS {table}")
        except: pass

    totals = {}
    for code in TEST_STOCKS:
        suffix = "SH" if market(code) else "SZ"
        ts = f"{code}.{suffix}"
        t1 = time.time()
        print(f"📡 {ts} ...", end=" ", flush=True)
        
        df = download_full(q, code)
        if df.empty:
            print("❌")
            continue
        
        batches = len(set(df.trade_time.dt.date))
        print(f"✅ {len(df):,} bars, {batches}天, {df.trade_time.min().date()}~{df.trade_time.max().date()}", end=" ")
        
        for freq, table in [("15min","ohlcv_15min")]:  # 只存15min, 其他按需
            df_out = df
            cols = ["ts_code","trade_time","open","high","low","close","vol","amount"]
            df_out = df_out[[c for c in cols if c in df_out.columns]].copy()
            
            if totals.get(table, 0) == 0:
                con.execute(f"""
                    CREATE TABLE IF NOT EXISTS {table} (
                        ts_code VARCHAR, trade_time TIMESTAMP,
                        open DOUBLE, high DOUBLE, low DOUBLE, close DOUBLE,
                        vol DOUBLE, amount DOUBLE
                    )
                """)
            
            con.register("_tmp", df_out)
            # 显式指定列, 避免列数不匹配
            con.execute(f"INSERT INTO {table} SELECT ts_code, trade_time, open, high, low, close, vol, amount FROM _tmp")
            totals[table] = totals.get(table, 0) + len(df_out)
        
        dt = time.time() - t1
        print(f"({dt:.0f}s)")

    for table in totals:
        try: con.execute(f"CREATE INDEX IF NOT EXISTS idx_{table}_ct ON {table}(ts_code, trade_time)")
        except: pass

    total = sum(totals.values())
    print(f"\n{'='*60}")
    print(f"✅ 完成 ({time.time()-t0:.0f}s)")
    for t in ["ohlcv_15min"]:
        print(f"  {t:<20s} {totals.get(t,0):>12,d} 行")
    print(f"  {'总计':<20s} {total:>12,d} 行")
    con.close()

if __name__ == "__main__":
    main()
