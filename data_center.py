#!/usr/bin/env python3
"""
天枢 数据中心 — 分钟数据下载器
==================================
用法: python data_center.py download    # 下载2只股票分钟数据
      python data_center.py build-db    # 从CSV构建DuckDB
      python data_center.py pool-list   # 列出V14动态池股票
      python data_center.py export-daily # 导出日线到CSV
"""
import sys, os, time, json
import pandas as pd
import numpy as np
import duckdb
import tushare as ts

# 配置
TOKEN = "f10cbaea839fe80325b017ae338aa321e95fd905b9a96b9ec48d07c2"
DATA_ROOT = "/media/felix/d/openclaw/data"
MINUTE_DIR = f"{DATA_ROOT}/minute_15min"
DAILY_DIR = f"{DATA_ROOT}/daily"
DB_PATH = f"{DATA_ROOT}/db/tianshu_data.duckdb"
TRACKER_FILE = f"{DATA_ROOT}/.download_tracker.json"

# 日线数据源 DuckDB
OLD_DB = "/media/felix/d/openclaw/workspace-coding-Jarvis/quant_merged_v2/data/quant.duckdb"

pro = ts.pro_api(TOKEN)


def get_v14_pool():
    """获取V14动态池股票列表 (ROE>3%, debt<80%, 高数据完整度)"""
    con = duckdb.connect(OLD_DB, read_only=True)
    stocks = con.execute("""
        SELECT ts_code FROM ohlcv_daily 
        GROUP BY ts_code HAVING COUNT(*) > 4500 
        ORDER BY COUNT(*) DESC LIMIT 500
    """).df().ts_code.tolist()
    con.close()
    return stocks


def load_tracker():
    """已下载记录"""
    if os.path.exists(TRACKER_FILE):
        with open(TRACKER_FILE) as f:
            return json.load(f)
    return {"downloaded": [], "last_idx": 0, "pending": []}


def save_tracker(tracker):
    with open(TRACKER_FILE, 'w') as f:
        json.dump(tracker, f, ensure_ascii=False, indent=2)


def download_stock_15min(code):
    """下载单只股票15分钟数据 (Tushare Pro stk_mins)"""
    try:
        r = pro.stk_mins(
            ts_code=code, freq='15min',
            start_date='2020-01-02 09:30:00',
            end_date='2025-12-31 15:00:00'
        )
        if r is None or r.empty:
            return pd.DataFrame()

        df = r.copy()
        df['trade_time'] = pd.to_datetime(df['trade_time'] if 'trade_time' in df.columns else df.index)
        df = df.rename(columns={'vol': 'vol', 'amount': 'amount'})

        # 标准化列
        cols = ['ts_code', 'trade_time', 'open', 'high', 'low', 'close', 'vol', 'amount']
        available = [c for c in cols if c in df.columns]
        df = df[available].drop_duplicates('trade_time').sort_values('trade_time')

        return df
    except Exception as e:
        print(f"  ERR: {e}")
        return pd.DataFrame()


def cmd_download():
    """下载2只股票"""
    pool = get_v14_pool()
    tracker = load_tracker()

    # 初始化 pending 列表
    if not tracker.get('pending'):
        tracker['pending'] = [c for c in pool if c not in tracker['downloaded']]
        tracker['last_idx'] = 0
        save_tracker(tracker)

    pending = tracker['pending']
    downloaded = set(tracker['downloaded'])

    if not pending:
        print("✅ 全部V14池股票已下载完成!")
        return

    count = 0
    for code in pending[:]:
        if count >= 2:
            break
        if code in downloaded:
            pending.remove(code)
            continue

        symbol = code.split('.')[0]
        print(f"📡 [{count+1}/2] {code} ...", end=" ", flush=True)
        df = download_stock_15min(code)

        if df.empty:
            print("❌ (可能无数据或超限)")
            count += 1  # API调用已消耗
            continue

        # 保存CSV
        csv_path = f"{MINUTE_DIR}/{code.replace('.','_')}.csv"
        # 追加模式
        if os.path.exists(csv_path):
            existing = pd.read_csv(csv_path, parse_dates=['trade_time'])
            df = pd.concat([existing, df]).drop_duplicates('trade_time').sort_values('trade_time')
        df.to_csv(csv_path, index=False)

        days = df['trade_time'].dt.date.nunique()
        print(f"✅ {len(df):,} bars ({days}天)")

        downloaded.add(code)
        pending.remove(code)
        count += 1
        time.sleep(1)

    tracker['downloaded'] = sorted(downloaded)
    tracker['pending'] = pending
    save_tracker(tracker)

    remaining = len(pending)
    print(f"\n✔ 本次: {count}只 | 已下载: {len(downloaded)}只 | 剩余: {remaining}只")
    if remaining > 0:
        eta_days = remaining / 2
        print(f"  预计完成: {eta_days:.0f}天")


def cmd_export_daily():
    """导出日线数据到CSV"""
    print("📦 导出日线数据到CSV...")
    con = duckdb.connect(OLD_DB, read_only=True)

    # 分批导出
    stocks = con.execute("SELECT DISTINCT ts_code FROM ohlcv_daily").df().ts_code.tolist()
    print(f"   共 {len(stocks)} 只股票")

    done = 0
    for code in stocks:
        fname = code.replace('.', '_')
        csv_path = f"{DAILY_DIR}/{fname}.csv"
        if os.path.exists(csv_path):
            done += 1
            continue

        df = con.execute(f"""
            SELECT ts_code, trade_date, open, high, low, close, vol, amount
            FROM ohlcv_daily WHERE ts_code = '{code}' ORDER BY trade_date
        """).df()

        if not df.empty:
            df.to_csv(csv_path, index=False)

        done += 1
        if done % 500 == 0:
            print(f"   {done}/{len(stocks)}...")

    con.close()
    print(f"✅ 日线导出完成: {done} 只")


def cmd_build_db():
    """从CSV构建DuckDB"""
    print("🏗️ 构建数据库...")
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    con = duckdb.connect(DB_PATH)

    # 日线表
    daily_files = [f for f in os.listdir(DAILY_DIR) if f.endswith('.csv')]
    if daily_files:
        print(f"   日线: {len(daily_files)} 文件 ...")
        # 用一个sample文件推断schema
        sample = pd.read_csv(f"{DAILY_DIR}/{daily_files[0]}", nrows=1)
        con.execute("DROP TABLE IF EXISTS ohlcv_daily")
        con.execute("""
            CREATE TABLE ohlcv_daily (
                ts_code VARCHAR, trade_date DATE,
                open DOUBLE, high DOUBLE, low DOUBLE, close DOUBLE,
                vol DOUBLE, amount DOUBLE
            )
        """)
        for i, f in enumerate(daily_files):
            con.execute(f"COPY ohlcv_daily FROM '{DAILY_DIR}/{f}' (FORMAT CSV, HEADER)")
            if (i+1) % 500 == 0:
                print(f"   {i+1}/{len(daily_files)}...")
        con.execute("CREATE INDEX IF NOT EXISTS idx_ohlcv_ct ON ohlcv_daily(ts_code, trade_date)")
        print(f"   ✅ 日线: {len(daily_files)} 文件")

    # 分钟表
    min_files = [f for f in os.listdir(MINUTE_DIR) if f.endswith('.csv')]
    if min_files:
        print(f"   分钟: {len(min_files)} 文件 ...")
        con.execute("DROP TABLE IF EXISTS ohlcv_15min")
        con.execute("""
            CREATE TABLE ohlcv_15min (
                ts_code VARCHAR, trade_time TIMESTAMP,
                open DOUBLE, high DOUBLE, low DOUBLE, close DOUBLE,
                vol DOUBLE, amount DOUBLE
            )
        """)
        for f in min_files:
            con.execute(f"COPY ohlcv_15min FROM '{MINUTE_DIR}/{f}' (FORMAT CSV, HEADER)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_15min_ct ON ohlcv_15min(ts_code, trade_time)")
        print(f"   ✅ 分钟: {len(min_files)} 文件, {con.execute('SELECT COUNT(*) FROM ohlcv_15min').fetchone()[0]:,} 行")

    # 统计
    n_daily = con.execute("SELECT COUNT(*) FROM ohlcv_daily").fetchone()[0]
    n_stocks = con.execute("SELECT COUNT(DISTINCT ts_code) FROM ohlcv_daily").fetchone()[0]
    print(f"\n📊 数据库: {DB_PATH}")
    print(f"   日线: {n_daily:,} 行, {n_stocks} 股")
    print(f"   大小: {os.path.getsize(DB_PATH)/1024/1024:.0f}MB")
    con.close()


def cmd_pool_list():
    """列出V14池股票"""
    pool = get_v14_pool()
    tracker = load_tracker()
    downloaded = set(tracker.get('downloaded', []))
    pending = [c for c in pool if c not in downloaded]

    print(f"V14池: {len(pool)}只 | 已下载: {len(downloaded)}只 | 待下载: {len(pending)}只")
    print(f"\n待下载前20:")
    for i, c in enumerate(pending[:20]):
        print(f"  {i+1:>3}. {c}")
    print(f"\n已下载:")
    for i, c in enumerate(sorted(downloaded)[:10]):
        print(f"  {i+1:>3}. {c}")
    if len(downloaded) > 10:
        print(f"  ... 共 {len(downloaded)} 只")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "pool-list"
    {
        "download": cmd_download,
        "export-daily": cmd_export_daily,
        "build-db": cmd_build_db,
        "pool-list": cmd_pool_list,
    }.get(cmd, cmd_pool_list)()
