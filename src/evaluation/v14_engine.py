"""
天枢 V14 引擎 — 移植自 quant_merged_v2 backtest_v14.py
支持双数据库: stock_daily.duckdb (原版5.3GB) + tianshu_data.duckdb
"""
from __future__ import annotations
import os, time, warnings, numpy as np, pandas as pd
from typing import Optional

warnings.filterwarnings("ignore")

DB_DEFAULT = "/media/felix/d/openclaw/data/db/tianshu_data.duckdb"
ORIGINAL_DB = "/media/felix/d/openclaw/workspace-coding-Jarvis/tushare_quant/core_data/stocks_daily.duckdb"


class V14Engine:
    """V14 完整回测引擎 — 双schema适配"""

    def __init__(self, db_path=None, n_load=2000):
        self.db_path = db_path or ORIGINAL_DB  # 默认用原版DB
        self.n_load = n_load
        self._con = None
        self.prices = self.rets = self.amounts = None
        self.ma20s = self.ma60s = self.rsis = None
        self.dates = self.codes = []
        self.nd = self.ns = 0; self.ci = {}
        self.roe_mat = self.debt_mat = None
        self.idx_arr = None
        self.VW=58; self.RB=5; self.TARGET_VOL=0.25; self.STOP_PCT=0.08
        self.MAX_W=0.25; self.COOL=20; self.INIT=100_000
        self.COST_BUY=0.00026; self.COST_SELL=0.00076

    @property
    def con(self):
        if self._con is None:
            import duckdb; self._con = duckdb.connect(self.db_path, read_only=True)
        return self._con

    def load(self):
        t0=time.time()
        import duckdb; self._con=duckdb.connect(self.db_path,read_only=True)
        con=self._con

        # Schema detection
        has_stocks=con.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_name='stocks_daily'").fetchone()[0]>0
        tbl='stocks_daily' if has_stocks else 'ohlcv_daily'
        dc='date' if has_stocks else 'trade_date'
        cc='ts_code'
        rc='pct_chg' if has_stocks else 'daily_ret'
        rd=1.0  # pct_chg 和 daily_ret 都已是小数
        ac='amount'

        # Top stocks
        codes_db=con.execute(f"SELECT {cc} FROM {tbl} GROUP BY {cc} HAVING COUNT(*)>{500} ORDER BY COUNT(*) DESC LIMIT {self.n_load}").df().iloc[:,0].tolist()
        cs=",".join([f"'{c}'" for c in codes_db])

        if has_stocks:
            # stocks_daily: 预计算指标
            raw=con.execute(f"SELECT {dc},{cc},close,{ac},pct_chg,MA20,MA60,RSI14 FROM {tbl} WHERE {cc} IN ({cs}) ORDER BY {dc}").df()
            self.prices=raw.pivot(index=dc,columns=cc,values="close").values.astype(np.float32)
            self.rets=raw.pivot(index=dc,columns=cc,values="pct_chg").values.astype(np.float32)/rd
            # 过滤 Inf/NaN
            self.rets=np.where(np.isfinite(self.rets),self.rets,0.0)
            self.amounts=raw.pivot(index=dc,columns=cc,values=ac).values.astype(np.float32)
            self.ma20s=raw.pivot(index=dc,columns=cc,values="MA20").values.astype(np.float32)
            self.ma60s=raw.pivot(index=dc,columns=cc,values="MA60").values.astype(np.float32)
            self.rsis=raw.pivot(index=dc,columns=cc,values="RSI14").values.astype(np.float32)
        else:
            raw=con.execute(f"SELECT {dc},{cc},close,{ac} FROM {tbl} WHERE {cc} IN ({cs}) ORDER BY {dc}").df()
            self.prices=raw.pivot(index=dc,columns=cc,values="close").values.astype(np.float32)
            self.amounts=raw.pivot(index=dc,columns=cc,values=ac).values.astype(np.float32)
            ret_df=con.execute(f"SELECT {dc},{cc},daily_ret FROM v_daily_return WHERE {cc} IN ({cs}) ORDER BY {dc}").df()
            self.rets=ret_df.pivot(index=dc,columns=cc,values="daily_ret").values.astype(np.float32)
            pdf=pd.DataFrame(self.prices)
            self.ma20s=pdf.rolling(20,min_periods=20).mean().values.astype(np.float32)
            self.ma60s=pdf.rolling(60,min_periods=60).mean().values.astype(np.float32)
            rdf=pd.DataFrame(self.rets)
            g=rdf.where(rdf>0,0.0).rolling(14,min_periods=14).mean()
            l=(-rdf.where(rdf<0,0.0)).rolling(14,min_periods=14).mean()
            rs=g.values/(l.values+1e-10)
            self.rsis=np.clip(100-100/(1+rs.astype(np.float64)),0,100).astype(np.float32)

        dates_all=raw[dc].unique()
        self.dates=[str(d)[:10] for d in dates_all]
        self.nd=len(self.dates); self.ns=self.prices.shape[1]
        self.codes=[c.replace("_",".") for c in codes_db[:self.ns]]
        self.ci={c:i for i,c in enumerate(self.codes)}
        self._load_quality(codes_db[:self.ns])
        self._load_index()
        print(f"✅ V14引擎就绪: {self.ns}股×{self.nd}天 ({time.time()-t0:.1f}s)")

    def _load_quality(self, codes_db):
        cs=",".join([f"'{c}'" for c in codes_db])
        try:
            fina=self.con.execute(f"SELECT ts_code,ann_date,roe,debt_to_assets FROM fina_quality WHERE ts_code IN ({cs}) AND roe IS NOT NULL ORDER BY ann_date").df()
        except:
            try:
                fina=self.con.execute(f"SELECT ts_code,ann_date,roe,debt_to_assets FROM fina_indicator WHERE ts_code IN ({cs}) AND roe IS NOT NULL ORDER BY ann_date").df()
            except:
                self.roe_mat=np.full((self.nd,self.ns),np.nan,dtype=np.float32)
                self.debt_mat=np.full((self.nd,self.ns),np.nan,dtype=np.float32)
                return
        if fina.empty:
            self.roe_mat=np.full((self.nd,self.ns),np.nan,dtype=np.float32)
            self.debt_mat=np.full((self.nd,self.ns),np.nan,dtype=np.float32)
            return
        dtm={d:i for i,d in enumerate(self.dates)}
        fina["cd"]=fina["ts_code"].str.replace("_",".")
        fina=fina[fina["cd"].isin(self.ci)]
        fina["as"]=pd.to_datetime(fina["ann_date"],format="%Y%m%d",errors="coerce").dt.strftime("%Y-%m-%d")
        fina["di"]=fina["as"].map(dtm); fina=fina[fina["di"].notna()].sort_values(["cd","di"])
        self.roe_mat=np.full((self.nd,self.ns),np.nan,dtype=np.float32)
        self.debt_mat=np.full((self.nd,self.ns),np.nan,dtype=np.float32)
        for cd in fina["cd"].unique():
            j=self.ci.get(cd,-1)
            if j<0: continue
            sub=fina[fina["cd"]==cd]; rows=sub[["di","roe","debt_to_assets"]].values
            for k in range(len(rows)):
                ds=int(rows[k,0]); de=int(rows[k+1,0]) if k+1<len(rows) else self.nd
                for d2 in range(max(ds,0),min(de,self.nd)):
                    if np.isnan(self.roe_mat[d2,j]): self.roe_mat[d2,j]=float(rows[k,1]) if not pd.isna(rows[k,1]) else np.nan
                    if np.isnan(self.debt_mat[d2,j]): self.debt_mat[d2,j]=float(rows[k,2]) if not pd.isna(rows[k,2]) else np.nan

    def _load_index(self):
        """加载指数 — 优先 pkl, 回退 DB"""
        import pickle
        pkl_paths = [
            '/media/felix/d/openclaw/workspace-coding-Jarvis/quant_merged_v2/daily_output/index_cache.pkl',
            os.path.join(os.path.dirname(__file__),'..','..','..','quant_merged_v2','daily_output','index_cache.pkl'),
        ]
        for pp in pkl_paths:
            if os.path.exists(pp):
                try:
                    with open(pp,'rb') as f: idx=pickle.load(f)
                    # 对齐 dates
                    idx_df=pd.DataFrame({'trade_date':idx['dates'],'close':idx['close']})
                    idx_df['trade_date']=idx_df['trade_date'].astype(str).str[:10]
                    dtm={d:i for i,d in enumerate(self.dates)}
                    aligned=np.full(self.nd,np.nan,dtype=np.float64)
                    for _,row in idx_df.iterrows():
                        d=row['trade_date']
                        if d in dtm: aligned[dtm[d]]=float(row['close'])
                    lv=None
                    for i in range(self.nd):
                        if not np.isnan(aligned[i]): lv=aligned[i]
                        elif lv is not None: aligned[i]=lv
                    self.idx_arr=aligned
                    return
                except: pass
        # Fallback: try DB
        try:
            idx=self.con.execute("SELECT trade_date,close FROM index_daily WHERE ts_code='000300.SH' ORDER BY trade_date").df()
        except:
            self.idx_arr=None; return
        idx['trade_date']=idx['trade_date'].astype(str).str[:10]
        dtm={d:i for i,d in enumerate(self.dates)}
        aligned=np.full(self.nd,np.nan,dtype=np.float64)
        for _,row in idx.iterrows():
            d=row['trade_date']
            if d in dtm: aligned[dtm[d]]=float(row['close'])
        lv=None
        for i in range(self.nd):
            if not np.isnan(aligned[i]): lv=aligned[i]
            elif lv is not None: aligned[i]=lv
        self.idx_arr=aligned

    def run(self, params=None):
        if params:
            for k,v in params.items(): setattr(self,k,v)
        nd,ns,ci=self.nd,self.ns,self.ci
        codes,VW,RB=self.codes,self.VW,self.RB
        TV,SP=self.TARGET_VOL,self.STOP_PCT
        MW,CL,INIT=self.MAX_W,self.COOL,self.INIT

        # Index
        if self.idx_arr is not None:
            idx_arr=self.idx_arr
            daily_idx=np.diff(idx_arr)/idx_arr[:-1]
            donch_high=pd.Series(idx_arr).rolling(20).max().values
            donch_low=pd.Series(idx_arr).rolling(10).min().values
            rv=pd.Series(np.diff(idx_arr)/idx_arr[:-1]).rolling(20).std().values*np.sqrt(252)
            rv=np.pad(rv,(1,0),'edge')
        else:
            idx_arr=np.ones(nd); daily_idx=np.zeros(nd)
            donch_high=np.full(nd,1e9); donch_low=np.full(nd,-1e9); rv=np.full(nd,0.2)

        # Regime
        reg_arr=np.full(nd,2,dtype=np.int8)
        for j in range(200,nd):
            p=idx_arr[j]
            if not np.isnan(donch_high[j]) and p>donch_high[j]: reg_arr[j]=0
            elif not np.isnan(donch_low[j]) and p<donch_low[j]: reg_arr[j]=1
            if j>=1 and j-1<len(daily_idx) and not np.isnan(daily_idx[j-1]) and daily_idx[j-1]<-0.03: reg_arr[j]=1

        # Sector
        def _sec(c):
            if "688" in c: return 0
            return 1 if (".SH" in c or "_SH" in c) and "688" not in c else 2
        sectors=np.array([_sec(c) for c in codes],dtype=np.int8)

        mi=max(VW,20)+55
        pos={}; cp=float(INIT); peak=cp; dr=[]; lrb=-RB; prv=-1; pmn=10
        blacklist={}; tb=ts=0; AMT_WINDOW=60
        stop_recs = []  # 止损记录
        daily_recs = []  # 每日指标

        for i in range(mi,nd):
            reg=int(reg_arr[i]); v=rv[i]
            # Dynamic pool
            lm=~np.isnan(self.prices[i,:])
            amt_slice=self.amounts[max(0,i-AMT_WINDOW):i,:]
            avg_amt=np.nanmean(amt_slice,axis=0)
            thr=np.nanmedian(avg_amt[lm]) if lm.sum()>0 else 0
            am=avg_amt>thr
            roe_m=~np.isnan(self.roe_mat[i,:])&(self.roe_mat[i,:]>3)
            debt_m=~np.isnan(self.debt_mat[i,:])&(self.debt_mat[i,:]<80)
            dp=lm&am&roe_m&debt_m; pool_size=dp.sum()

            # Breadth
            if pool_size>5:
                pi=np.where(dp)[0]
                breadth=(self.prices[i,pi]>self.ma20s[i,pi]).sum()/pool_size
            else: breadth=0

            # Risk
            vs=min(1.0,TV/max(float(v),0.05))
            peak=max(peak,cp); dd_pct=(peak-cp)/peak if peak>0 else 0
            ds=1.0
            if dd_pct>0.25: ds=0.10
            elif dd_pct>0.20: ds=0.15
            elif dd_pct>0.15: ds=0.25
            elif dd_pct>0.10: ds=0.50
            bs=1.0
            if breadth<0.15: bs=0.0
            elif breadth<0.25: bs=0.3
            elif breadth<0.35: bs=0.7
            cb=vs*ds*bs
            if reg==1: mx=0
            else:
                base=20 if reg==0 else 8
                mx=max(1,int(base*cb)) if cb>0.05 else 0
            frb=(reg!=prv and prv>=0) or (not pos) or (i-lrb>=RB) or abs(mx-pmn)>=3
            ct=0.0; crash=(i>0 and daily_idx[i-1]<-0.03)
            blacklist={c:v for c,v in blacklist.items() if i<v}

            # Stops
            tr=[]
            for c,info in list(pos.items()):
                jj=ci.get(c,-1)
                if jj<0: continue
                cpr=self.prices[i,jj]
                if np.isnan(cpr): continue
                info['hc']=max(info.get('hc',cpr),cpr)
                reason=None
                if cpr<info['hc']*(1-SP): reason='stop'
                elif not np.isnan(self.rsis[i,jj]) and self.rsis[i,jj]>85: reason='RSI'
                if reason: tr.append((c,reason))
            if crash and pos: tr=[(c,'crash') for c in list(pos.keys())]
            for c,reason in tr:
                w=pos.pop(c)['weight']
                ct+=cp*w*self.COST_SELL; ts+=1
                stop_recs.append({'date': str(self.dates[i])[:10], 'code': c, 'reason': reason})
                if reason in ('stop','crash'): blacklist[c]=i+CL

            if len(pos)>mx and mx>0:
                sp=sorted(pos.items(),key=lambda x:x[1]['weight'])[:len(pos)-mx]
                for c,info in sp:
                    w=pos.pop(c)['weight']; ct+=cp*w*self.COST_SELL; ts+=1
                frb=True
            if mx==0 and pos:
                for c in list(pos.keys()):
                    w=pos.pop(c)['weight']; ct+=cp*w*self.COST_SELL; ts+=1

            # Rebalance
            if frb and not crash and mx>0 and pool_size>=5:
                sl=max(0,i-VW); pi=np.where(dp)[0]
                if i-sl>=20 and len(pi)>=5:
                    recent=self.rets[sl:i,:][:,pi]
                    vol=np.nanstd(recent,axis=0); vol=np.clip(vol,np.nanquantile(vol,0.05),None)
                    iv=1.0/(vol+1e-8)
                    sc=np.nan_to_num((iv-np.nanmean(iv))/(np.nanstd(iv)+1e-8),0.0)
                    sc_full=np.full(ns,-999.0)
                    for k,j in enumerate(pi):
                        if codes[j] in blacklist: continue
                        sc_full[j]=sc[k]
                        if not np.isnan(self.roe_mat[i-1,j]):
                            sc_full[j]+=0.10*np.clip(self.roe_mat[i-1,j],-50,100)/100.0
                        if not np.isnan(self.debt_mat[i-1,j]):
                            sc_full[j]-=0.10*np.clip(self.debt_mat[i-1,j],0,200)/100.0
                        if not np.isnan(self.ma60s[i-1,j]) and self.prices[i-1,j]<self.ma60s[i-1,j]:
                            sc_full[j]=-999; continue

                    vm=sc_full>-999
                    if vm.sum()>=5:
                        vs_sec=sectors[vm]
                        if len(set(vs_sec))>=2:
                            mp=max(1,int(mx*0.4))
                            order=np.argsort(sc_full[vm])[::-1]
                            sc2={}; sel=[]
                            for p2 in order:
                                s=vs_sec[p2]
                                if sc2.get(s,0)<mp: sel.append(p2); sc2[s]=sc2.get(s,0)+1
                                if len(sel)>=mx*3: break
                            km=np.zeros(vm.sum(),dtype=bool); km[sel]=True
                            idm=np.where(vm)[0]
                            for k in range(len(idm)):
                                if not km[k]: sc_full[idm[k]]=-999

                    vm2=sc_full>-999
                    if vm2.sum()>=1:
                        avl=max(0,mx-len(pos))
                        nc={}
                        for k in np.argsort(sc_full[vm2])[::-1]:
                            c2=codes[np.where(vm2)[0][k]]
                            if c2 not in pos: nc[c2]=sc_full[np.where(vm2)[0][k]]
                        if avl>0 and nc:
                            tcc=list(nc.keys())[:avl*3]
                            cc2=[ci.get(c2,0) for c2 in tcc]
                            ppr=self.prices[:i,:][:,cc2]
                            vc2=np.where(np.sum(~np.isnan(ppr[-VW:]),axis=0)>=5)[0]
                            if len(vc2)>0:
                                vcc=[tcc[kk] for kk in vc2]
                                sm={c2:nc[c2] for c2 in vcc if c2 in nc}
                                if sm:
                                    wts={c2:1.0/len(sm) for c2 in sm}
                                    tw=sum(info['weight'] for info in pos.values()) if pos else 0
                                    sn=sum(wts.values())
                                    scale=(1-tw)/sn if sn>0 else 0
                                    for c2,w in wts.items():
                                        jj=ci.get(c2,-1)
                                        ep=self.prices[i-1,jj] if jj>=0 and not np.isnan(self.prices[i-1,jj]) else 0
                                        pos[c2]={'weight':w*scale,'hc':ep}
                                        ct+=cp*w*scale*self.COST_BUY; tb+=1

            rv2=0.0
            if pos:
                for c2,info in pos.items():
                    jj=ci.get(c2,-1)
                    if jj>=0 and not np.isnan(self.rets[i,jj]):
                        rv2+=info['weight']*self.rets[i,jj]
            rv2-=ct/cp if cp>0 else 0
            dr.append(rv2); cp*=(1+rv2)
            daily_recs.append({'date': str(self.dates[i])[:10], 'n_pos': len(pos), 
                               'capital': float(cp), 'pool_size': int(pool_size),
                               'breadth': round(float(breadth),4), 'regime': int(reg),
                               'dd_pct': round(float(dd_pct),4)})
            lrb=i; prv=reg; pmn=mx

        rs_=pd.Series(dr); eq=INIT*(1+rs_).cumprod()
        total_r=(1+rs_).prod()-1; yrs=len(rs_)/252
        ann_r=(1+total_r)**(1/yrs)-1 if yrs>0 and total_r>-1 else 0
        va=float(rs_.std()*np.sqrt(252))
        sh=float((ann_r-0.03)/va) if va>0 else 0
        dd_r=float((eq/eq.cummax()-1).min())
        win=float((rs_>0).sum()/len(rs_))
        return {"sharpe":round(sh,4),"annual_ret":round(ann_r,4),"max_dd":round(dd_r,4),
                "win_rate":round(win,4),"final_value":round(float(cp),0),
                "trades_buy":tb,"trades_sell":ts,
                "equity":eq,"returns":rs_,"dr":dr,
                "stop_recs":stop_recs,"daily_recs":daily_recs}

    def close(self):
        if self._con is not None: self._con.close(); self._con=None

    def chart(self, result, output_dir="/media/felix/d/openclaw/workspace-coding-Jarvis/tian-shu/daily_output"):
        """生成 V14 风格 4 面板图表 + CSV 输出"""
        import matplotlib
        matplotlib.use('Agg')
        matplotlib.rcParams['font.family'] = 'sans-serif'
        matplotlib.rcParams['font.sans-serif'] = ['DejaVu Sans']
        matplotlib.rcParams['axes.unicode_minus'] = False
        import matplotlib.pyplot as plt
        from matplotlib.ticker import FuncFormatter
        os.makedirs(output_dir, exist_ok=True)

        eq = result['equity']
        rs = result['returns']
        dr = result['dr']
        n = len(dr)
        mi = max(self.VW, 20) + 55
        all_dates = pd.to_datetime(self.dates)
        dates = all_dates[mi:mi+n]
        rs.index = dates
        eq.index = dates

        # Index benchmark
        idx_al = []
        if self.idx_arr is not None:
            prev_v2 = float(self.INIT)
            for d in dates:
                ip = np.where(all_dates == d)[0]
                if len(ip) > 0:
                    i = ip[0]
                    if i > 0 and self.idx_arr[i-1] > 0:
                        prev_v2 *= self.idx_arr[i] / self.idx_arr[i-1]
                    idx_al.append(prev_v2)
                else:
                    idx_al.append(prev_v2)
        else:
            idx_al = [float(self.INIT)] * len(dates)
        idx_eq = pd.Series(idx_al, index=dates)

        # Y-axis formatter (ASCII-safe)
        def y_fmt(x, p):
            if x >= 1e8: return f'{x/1e8:.1f}B'
            if x >= 1e4: return f'{x/1e4:.0f}W'
            return f'{x:.0f}'

        # 图表
        plt.style.use('dark_background')
        fig = plt.figure(figsize=(22, 16), facecolor='#1a1a2e')
        gs = fig.add_gridspec(4, 1, height_ratios=[2.5, 1.2, 0.8, 0.8], hspace=0.06)
        ax1 = fig.add_subplot(gs[0]); ax2 = fig.add_subplot(gs[1], sharex=ax1)
        ax3 = fig.add_subplot(gs[2], sharex=ax1); ax4 = fig.add_subplot(gs[3], sharex=ax1)

        for ax in [ax1, ax2, ax3, ax4]:
            ax.set_facecolor('#16213e')
            ax.tick_params(colors='#999', labelsize=9)
            for sp in ['top', 'right']: ax.spines[sp].set_visible(False)
            ax.spines['left'].set_color('#444'); ax.spines['bottom'].set_color('#444')
            ax.grid(True, alpha=0.10, color='white')
        for ax in [ax1, ax2, ax3]:
            ax.set_xlim(dates[0], dates[-1])

        # Panel 1: 净值
        ax1.semilogy(eq.index, eq.values, color='#00d4aa', lw=1.5, label='Tianshu V14')
        ax1.semilogy(idx_eq.index, idx_eq.values, color='#ff6b6b', lw=0.9, label='CSI300', alpha=0.55)
        ax1.legend(loc='upper left', facecolor='#16213e', edgecolor='#555', labelcolor='#ccc')
        ax1.set_title(
            f'V14 Dynamic Pool | Sharpe {result["sharpe"]:.2f} | Ann {result["annual_ret"]:.1%} | DD {result["max_dd"]:.1%} | WR {result["win_rate"]:.1%}',
            color='white', fontsize=15, fontweight='bold')
        ax1.set_ylabel('Portfolio', color='#ccc', fontsize=12)
        ax1.yaxis.set_major_formatter(FuncFormatter(y_fmt))

        # Panel 2: 回撤
        dd_series = eq / eq.cummax() - 1
        ax2.fill_between(dd_series.index, 0, dd_series.values * 100, color='#ff4444', alpha=0.4)
        ax2.plot(dd_series.index, dd_series.values * 100, color='#ff6666', lw=0.6)
        ax2.set_ylabel('Drawdown %', color='#ccc', fontsize=11)
        ax2.axhline(y=-10, color='#ffaa00', ls=':', lw=0.8, alpha=0.5)
        ax2.axhline(y=-20, color='#ff6600', ls='--', lw=0.5, alpha=0.3)

        # Panel 3: 滚动胜率
        win60 = rs.rolling(60).apply(lambda x: (x > 0).sum() / 60)
        ax3.fill_between(win60.index, 0, win60.values * 100, color='#4ecdc4', alpha=0.4)
        ax3.plot(win60.index, win60.values * 100, color='#4ecdc4', lw=0.8)
        ax3.axhline(y=50, color='#ffaa00', ls='--', lw=0.8, alpha=0.5)
        ax3.set_ylabel('Win 60d %', color='#4ecdc4', fontsize=10)

        # Panel 4: 持仓数量 / 动态池大小 (对标V14原版)
        if 'daily_recs' in result and result['daily_recs']:
            dr_df = pd.DataFrame(result['daily_recs'])
            dr_df['date'] = pd.to_datetime(dr_df['date'])
            dr_df = dr_df.set_index('date')
            pn = dr_df['n_pos'].reindex(dates, fill_value=0)
            ax4.fill_between(pn.index, 0, pn.values, color='#ffaa00', alpha=0.5)
            ax4.plot(pn.index, pn.values, color='#ffaa00', lw=0.8)
            ax4.set_ylabel('Positions', color='#ffaa00', fontsize=10)
            ax4.tick_params(axis='y', colors='#ffaa00')
        else:
            ax4.text(0.5, 0.5, 'No position data', transform=ax4.transAxes,
                     ha='center', va='center', color='#666', fontsize=12)

        plt.tight_layout(rect=[0, 0.02, 1, 1])
        png = f'{output_dir}/tianshu_v14.png'
        plt.savefig(png, dpi=150, bbox_inches='tight', facecolor='#1a1a2e')
        plt.close()

        # CSV outputs
        import json
        # 净值+收益+年度
        pd.DataFrame({'date': dates, 'nav': eq.values}).to_csv(
            f'{output_dir}/tianshu_nav.csv', index=False)
        pd.DataFrame({'date': dates, 'daily_ret': rs.values}).to_csv(
            f'{output_dir}/tianshu_returns.csv', index=False)
        annual_r = rs.groupby(rs.index.year).apply(lambda x: (1+x).prod()-1)
        pd.DataFrame({'year': annual_r.index, 'return': annual_r.values}).to_csv(
            f'{output_dir}/tianshu_annual.csv', index=False)
        
        # 每日指标 (来自引擎的 daily_recs, 含 pool_size/breadth/regime)
        if 'daily_recs' in result and result['daily_recs']:
            pd.DataFrame(result['daily_recs']).to_csv(f'{output_dir}/tianshu_daily_indicators.csv', index=False)
        else:
            pd.DataFrame({'date': dates, 'nav': eq.values, 'daily_ret': rs.values}).to_csv(
                f'{output_dir}/tianshu_daily_indicators.csv', index=False)
        
        # 止损交易记录
        if 'stop_recs' in result and result['stop_recs']:
            pd.DataFrame(result['stop_recs']).to_csv(f'{output_dir}/tianshu_trades.csv', index=False)
        
        # 每日持仓明细 (持仓股票+权重)
        if 'daily_recs' in result:
            holdings = []
            for day_rec in result['daily_recs']:
                d = day_rec.get('date','')
                n = day_rec.get('n_pos',0)
                holdings.append({
                    'date': d,
                    'n_positions': n,
                    'capital': round(day_rec.get('capital',0), 0),
                })
            pd.DataFrame(holdings).to_csv(f'{output_dir}/tianshu_holdings.csv', index=False)

        summary = {
            'sharpe': result['sharpe'],
            'annual_ret': result['annual_ret'],
            'max_dd': result['max_dd'],
            'win_rate': result['win_rate'],
            'final_value': result['final_value'],
            'trades_buy': result['trades_buy'],
            'trades_sell': result['trades_sell'],
        }
        with open(f'{output_dir}/tianshu_result.json', 'w') as f:
            json.dump(summary, f, indent=2, ensure_ascii=False, default=float)

        print(f'\n📁 {png}')
        print(f'📁 {output_dir}/tianshu_nav.csv')
        print(f'📁 {output_dir}/tianshu_returns.csv')
        print(f'📁 {output_dir}/tianshu_annual.csv')
        print(f'📁 {output_dir}/tianshu_daily_indicators.csv')
        print(f'📁 {output_dir}/tianshu_trades.csv')
        print(f'📁 {output_dir}/tianshu_holdings.csv')
        print(f'📁 {output_dir}/tianshu_result.json')
        return png
