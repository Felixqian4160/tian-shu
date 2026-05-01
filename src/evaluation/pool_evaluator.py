"""
天枢池模式评估引擎 — V14 矩阵化回测核心 (v2: 加速 + 风控)

性能: 500股加载 <5s (pandas rolling), 因子扫描 <1s
"""
from __future__ import annotations
import os, time, warnings, numpy as np, pandas as pd
from typing import Callable, Optional, Dict, List

warnings.filterwarnings("ignore")

def _find_db_path() -> str:
    for p in [os.path.join(os.path.dirname(__file__),"..","..","..","quant_merged_v2","data","quant.duckdb"),
              os.path.join(os.path.dirname(__file__),"..","..","quant_merged_v2","data","quant.duckdb"),
              os.environ.get("TIANSHU_DUCKDB_PATH","")]:
        if p and os.path.exists(p): return p
    raise FileNotFoundError("找不到 DuckDB")

class PoolEvaluator:
    def __init__(self, db_path=None):
        self.db_path = db_path or _find_db_path()
        self._con = None
        self.prices = self.rets = self.amounts = None
        self.ma20s = self.ma60s = self.rsis = None
        self.roe_mat = self.debt_mat = None
        self.dates = []; self.codes = []
        self.nd = self.ns = 0; self.loaded = False

    @property
    def con(self):
        if self._con is None:
            import duckdb; self._con = duckdb.connect(self.db_path, read_only=True)
        return self._con

    def load_data(self, n_stocks=2000, min_days=500):
        t0 = time.time()
        print(f"📂 加载 Top {n_stocks} 股数据...")
        codes_db = self.con.execute(f"""
            SELECT ts_code FROM ohlcv_daily GROUP BY ts_code
            HAVING COUNT(*) > {min_days} ORDER BY COUNT(*) DESC LIMIT {n_stocks}
        """).df().ts_code.tolist()
        print(f"   入选: {len(codes_db)} 只")
        cs = ",".join([f"'{c}'" for c in codes_db])
        raw = self.con.execute(f"""
            SELECT trade_date, ts_code, close, amount
            FROM ohlcv_daily WHERE ts_code IN ({cs}) ORDER BY trade_date
        """).df()
        self.prices = raw.pivot(index="trade_date", columns="ts_code", values="close").values.astype(np.float32)
        self.amounts = raw.pivot(index="trade_date", columns="ts_code", values="amount").values.astype(np.float32)
        ret_raw = self.con.execute(f"""
            SELECT trade_date, ts_code, daily_ret
            FROM v_daily_return WHERE ts_code IN ({cs}) ORDER BY trade_date
        """).df()
        self.rets = ret_raw.pivot(index="trade_date", columns="ts_code", values="daily_ret").values.astype(np.float32)
        self.dates = [str(d)[:10] for d in raw.trade_date.unique()]
        self.nd, self.ns = len(self.dates), self.prices.shape[1]
        self.codes = [c.replace("_",".") for c in codes_db[:self.ns]]
        self._compute_indicators()
        self._load_quality(codes_db[:self.ns])
        print(f"   ✅ 加载完成: {self.nd}天×{self.ns}股 ({time.time()-t0:.1f}s)")
        self.loaded = True

    def _compute_indicators(self):
        """pandas rolling 全矩阵秒级计算"""
        pdf = pd.DataFrame(self.prices)
        self.ma20s = pdf.rolling(20, min_periods=20).mean().values.astype(np.float32)
        self.ma60s = pdf.rolling(60, min_periods=60).mean().values.astype(np.float32)
        rdf = pd.DataFrame(self.rets)
        g = rdf.where(rdf > 0, 0.0).rolling(14, min_periods=14).mean()
        l = (-rdf.where(rdf < 0, 0.0)).rolling(14, min_periods=14).mean()
        rs = g.values / (l.values + 1e-10)
        self.rsis = np.clip(100.0 - 100.0/(1.0+rs.astype(np.float64)), 0, 100).astype(np.float32)

    def _load_quality(self, codes_db):
        try:
            cs = ",".join([f"'{c}'" for c in codes_db[:self.ns]])
            fina = self.con.execute(f"""
                SELECT ts_code, ann_date, roe, debt_to_assets FROM fina_indicator
                WHERE ts_code IN ({cs}) AND roe IS NOT NULL ORDER BY ann_date
            """).df()
        except Exception:
            self.roe_mat = np.full((self.nd, self.ns), np.nan, dtype=np.float32)
            self.debt_mat = np.full((self.nd, self.ns), np.nan, dtype=np.float32)
            return
        if fina.empty:
            self.roe_mat = np.full((self.nd, self.ns), np.nan, dtype=np.float32)
            self.debt_mat = np.full((self.nd, self.ns), np.nan, dtype=np.float32)
            return
        ci = {c: i for i, c in enumerate(self.codes)}
        fina["cd"] = fina["ts_code"].str.replace("_",".")
        fina = fina[fina["cd"].isin(ci)]
        fina["as"] = pd.to_datetime(fina["ann_date"], format="%Y%m%d", errors="coerce").dt.strftime("%Y-%m-%d")
        di = {d: i for i, d in enumerate(self.dates)}
        fina["di"] = fina["as"].map(di)
        fina = fina[fina["di"].notna()].sort_values(["cd","di"])
        self.roe_mat = np.full((self.nd, self.ns), np.nan, dtype=np.float32)
        self.debt_mat = np.full((self.nd, self.ns), np.nan, dtype=np.float32)
        for cd in fina["cd"].unique():
            j = ci.get(cd, -1)
            if j < 0: continue
            sub = fina[fina["cd"]==cd]; rows = sub[["di","roe","debt_to_assets"]].values
            for k in range(len(rows)):
                ds, de = int(rows[k,0]), int(rows[k+1,0]) if k+1<len(rows) else self.nd
                for d2 in range(max(ds,0), min(de,self.nd)):
                    if np.isnan(self.roe_mat[d2,j]): self.roe_mat[d2,j] = float(rows[k,1]) if not pd.isna(rows[k,1]) else np.nan
                    if np.isnan(self.debt_mat[d2,j]): self.debt_mat[d2,j] = float(rows[k,2]) if not pd.isna(rows[k,2]) else np.nan

    def evaluate_factor(self, factor_fn, top_k=20, rebalance=20, min_history=252, stop_loss=0.15, max_dd_cap=0.30):
        """向量化评估 + 15%止损 + 30%回撤熔断"""
        assert self.loaded
        nd, ns, start = self.nd, self.ns, min_history + 20
        if start >= nd: return {"sharpe":0,"annual_ret":0,"max_dd":0,"win_rate":0,"n_days":nd-start}
        pr = np.zeros(nd - start); tj = np.array([], dtype=int)
        pk, nav, halt, hb = 1.0, 1.0, False, 0
        saw_trade = False
        for i in range(start, nd):
            if halt:
                hb += 1
                if hb >= rebalance: halt = hb = 0
                pr[i-start] = 0.0; continue
            if (i-start) % rebalance == 0:
                try:
                    sc = factor_fn(prices=self.prices, rets=self.rets, ma20s=self.ma20s, ma60s=self.ma60s, rsis=self.rsis, day_idx=i)
                    v = ~np.isnan(sc) & (sc > -999)
                    tj = np.where(v)[0][np.argsort(sc[v])[::-1][:top_k]] if v.sum()>=top_k else np.array([],dtype=int)
                except Exception: tj = np.array([], dtype=int)
            if len(tj) > 0:
                dr = self.rets[i, tj]; r = float(np.nanmean(dr)) if np.any(~np.isnan(dr)) else 0.0
                if r < -stop_loss: tj = np.array([], dtype=int); r = -stop_loss  # 止损清仓
            else: r = 0.0
            pr[i-start] = r; nav *= (1.0+r)
            if np.abs(r) > 1e-10: saw_trade = True
            if nav > pk: pk = nav
            if (nav-pk)/pk < -max_dd_cap: halt = True; tj = np.array([],dtype=int)  # 熔断
        if not saw_trade or np.sum(np.abs(pr)) < 1e-10:
            return {"sharpe":0,"annual_ret":0,"max_dd":0,"win_rate":0,"n_days":nd-start}
        ar = float(np.mean(pr)*252); av = float(np.std(pr)*np.sqrt(252))
        sh = ar/av if av>0 else 0.0
        cu = np.cumprod(1.0+pr); mx = np.maximum.accumulate(cu)
        dd = float(np.min((cu-mx)/mx))
        wr = float(np.sum(pr>0.001)/max(np.sum(np.abs(pr)>1e-10),1))
        return {"sharpe":round(sh,4),"annual_ret":round(ar,4),"max_dd":round(dd,4),"win_rate":round(wr,4),"n_days":nd-start}

    def rank_stocks(self, factor_fn, day_idx, top_k=50, quality_filter=True):
        try:
            sc = factor_fn(prices=self.prices, rets=self.rets, ma20s=self.ma20s, ma60s=self.ma60s, rsis=self.rsis, day_idx=day_idx)
        except Exception: return []
        mask = ~np.isnan(sc) & (sc > -999)
        if quality_filter and self.roe_mat is not None:
            mask &= ~np.isnan(self.roe_mat[day_idx]) & (self.roe_mat[day_idx] > 3)
            mask &= ~np.isnan(self.debt_mat[day_idx]) & (self.debt_mat[day_idx] < 80)
        vi = np.where(mask)[0]
        if len(vi)==0: return []
        return [self.codes[i] for i in vi[np.argsort(sc[vi])[::-1][:top_k]] if i < len(self.codes)]

    def close(self):
        if self._con is not None: self._con.close(); self._con = None

# ── 因子 ──
def factor_low_vol(prices, rets, ma20s, ma60s, rsis, day_idx):
    lb = min(day_idx, 58); sl = max(0, day_idx-lb)
    if day_idx-sl<5: return np.full(prices.shape[1], -999.0)
    vol = np.nanstd(rets[sl:day_idx], axis=0)
    return np.where(~np.isnan(vol), 1.0/(np.clip(vol, np.nanquantile(vol,0.05), None)+1e-8), -999.0)

def factor_momentum(prices, rets, ma20s, ma60s, rsis, day_idx):
    lb = min(day_idx, 60); sl = max(0, day_idx-lb)
    if day_idx-sl<5: return np.full(prices.shape[1], -999.0)
    return np.where(~np.isnan(np.nanmean(rets[sl:day_idx],axis=0)), np.nanmean(rets[sl:day_idx],axis=0)*252, -999.0)

def factor_trend_quality(prices, rets, ma20s, ma60s, rsis, day_idx):
    ns = prices.shape[1]; sc = np.full(ns, -999.0)
    for j in range(ns):
        if np.isnan(prices[day_idx,j]): continue
        tr = prices[day_idx,j]/ma60s[day_idx,j]-1 if not np.isnan(ma60s[day_idx,j]) and ma60s[day_idx,j]>0 else 0
        if day_idx>=20:
            v = np.nanstd(rets[max(0,day_idx-20):day_idx,j]); lv = 1.0/(v+1e-8) if v>0 else 0
        else: lv = 0
        rp = max(0, rsis[day_idx,j]-70)*0.01 if not np.isnan(rsis[day_idx,j]) else 0
        sc[j] = tr*0.4 + lv*0.4 - rp
    return sc

def scan_factors(ev, factors):
    rows=[]
    for n,fn in factors.items():
        r = ev.evaluate_factor(fn, top_k=30)
        rows.append({"factor":n,"sharpe":r["sharpe"],"annual_ret":r["annual_ret"],"max_dd":r["max_dd"],"win_rate":r["win_rate"]})
    return pd.DataFrame(rows).sort_values("sharpe", ascending=False)
