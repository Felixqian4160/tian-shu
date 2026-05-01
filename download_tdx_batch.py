#!/usr/bin/env python3
"""天枢 TDX批量下载 — 扩展股票池到 50+ 只"""
import time, duckdb
import pandas as pd
from mootdx.quotes import Quotes

DB_PATH = "../quant_merged_v2/data/quant.duckdb"
BATCH, MAX_START = 800, 6400
TARGET = 50  # 目标股票数

# 从 DuckDB 取数据最完整的股票
con = duckdb.connect(DB_PATH, read_only=True)
top_codes = con.execute("""
    SELECT ts_code FROM ohlcv_daily 
    GROUP BY ts_code HAVING COUNT(*) > 4500 
    ORDER BY COUNT(*) DESC LIMIT 100
""").df().ts_code.tolist()
con.close()

# 去重 + 取前 TARGET 只
codes_raw = [c.split('.')[0] for c in top_codes]
seen = set()
codes = []
for c in codes_raw:
    if c not in seen:
        seen.add(c)
        codes.append(c)
    if len(codes) >= TARGET:
        break

def market(c):
    return 1 if c.startswith(("6","5","9")) else 0

print(f"🔧 TDX 批量: {len(codes)} 只股票")
print(f"   范围: start=0~{MAX_START}, batch={BATCH}\n")

q = Quotes.factory(market="std")
con = duckdb.connect(DB_PATH)

# 清旧表
con.execute("DROP TABLE IF EXISTS ohlcv_15min")
con.execute("""
    CREATE TABLE ohlcv_15min (
        ts_code VARCHAR, trade_time TIMESTAMP,
        open DOUBLE, high DOUBLE, low DOUBLE, close DOUBLE,
        vol DOUBLE, amount DOUBLE
    )
""")

total_bars = 0
t0 = time.time()
for i, code in enumerate(codes):
    suffix = "SH" if market(code) else "SZ"
    ts = f"{code}.{suffix}"
    
    # 分批拉取
    dfs = []
    for start in range(0, MAX_START + 1, BATCH):
        try:
            r = q.bars(symbol=code, frequency=1, start=start, offset=BATCH)
            if r is None or len(r) < 10:
                break
            dfs.append(r)
        except:
            break
        time.sleep(0.15)
    
    if not dfs:
        print(f"  {ts}: ❌")
        continue
    
    df = pd.concat(dfs)
    df = df.loc[:, ~df.columns.duplicated()]
    df = df.rename(columns={"datetime": "trade_time", "volume": "vol"})
    df["ts_code"] = ts
    df["trade_time"] = pd.to_datetime(df["trade_time"])
    
    cols = ["ts_code","trade_time","open","high","low","close","vol","amount"]
    df = df[[c for c in cols if c in df.columns]].drop_duplicates("trade_time")
    
    con.register("_b", df)
    con.execute("INSERT INTO ohlcv_15min SELECT ts_code, trade_time, open, high, low, close, vol, amount FROM _b")
    
    total_bars += len(df)
    dt = df.trade_time
    eta = (time.time()-t0)/(i+1)*(len(codes)-i-1)
    print(f"  [{i+1:>3}/{len(codes)}] {ts}: {len(df):>5} bars  ({dt.min().date()}~{dt.max().date()})  ETA {eta:.0f}s")

con.execute("CREATE INDEX IF NOT EXISTS idx_15min_ct ON ohlcv_15min(ts_code, trade_time)")
con.close()

print(f"\n✅ 完成: {len(codes)}只, {total_bars:,} bars, {time.time()-t0:.0f}s")
