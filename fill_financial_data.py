#!/usr/bin/env python3
"""天枢 早期财务数据补全 v3 — 全量THS接口"""
import time, duckdb, pandas as pd, akshare as ak

DB = "/media/felix/d/openclaw/workspace-coding-Jarvis/tushare_quant/core_data/stocks_daily.duckdb"
con = duckdb.connect(DB)

# V14 池 2000 只
pool = con.execute("""
    SELECT ts_code FROM stocks_daily 
    WHERE date >= '2006-01-01'
    GROUP BY ts_code HAVING COUNT(*) > 500 
    ORDER BY COUNT(*) DESC LIMIT 2000
""").df().ts_code.tolist()

print(f"目标: {len(pool)} 只 | 数据源: 同花顺")
print()

new_total = 0
t0 = time.time()
failed = 0
BATCH = 50

for i in range(0, len(pool), BATCH):
    batch = pool[i:i+BATCH]
    bn = 0
    for code in batch:
        symbol = code.split('.')[0]
        try:
            df = ak.stock_financial_abstract_ths(symbol=symbol, indicator='按报告期')
            df['报告期'] = pd.to_datetime(df['报告期'])
            df = df[(df['报告期'] >= '2006-01-01') & (df['报告期'] <= '2013-12-31')]
            
            for _, row in df.iterrows():
                roe_raw = row.get('净资产收益率')
                debt_raw = row.get('资产负债率')
                if roe_raw is False or str(roe_raw).strip() in ('','False'): continue
                
                roe_val = float(str(roe_raw).replace('%',''))
                debt_val = float(str(debt_raw).replace('%','')) if (debt_raw is not False and str(debt_raw).strip() not in ('','False')) else None
                dt = row['报告期'].strftime('%Y%m%d')
                
                ex = con.execute(f"SELECT COUNT(*) FROM fina_quality WHERE ts_code='{code}' AND ann_date='{dt}'").fetchone()[0]
                if ex > 0: continue
                
                con.execute(f"INSERT INTO fina_quality (ts_code,ann_date,end_date,roe,debt_to_assets) VALUES ('{code}','{dt}','{dt}',{roe_val},{debt_val if debt_val else 'NULL'})")
                bn += 1
        except:
            failed += 1
            time.sleep(1)  # 被限速歇1秒
        time.sleep(0.15)
    
    new_total += bn
    et = time.time() - t0
    status = f"+{bn}条(累计{new_total})" if bn > 0 else f"批次0(已{new_total})"
    print(f"  [{i+1}-{i+len(batch)}] {status} | 失败{failed} | {et:.0f}s")

# 验证
for yr in range(2006, 2014):
    n = con.execute(f"SELECT COUNT(DISTINCT ts_code) FROM fina_quality WHERE ann_date LIKE '{yr}%' AND roe IS NOT NULL").fetchone()[0]
    print(f"  {yr}年: {n} 只")
total = con.execute("SELECT COUNT(*) FROM fina_quality").fetchone()[0]
print(f"\n✅ +{new_total}条 | 总计{total:,}条 | 失败{failed}次")
con.close()
