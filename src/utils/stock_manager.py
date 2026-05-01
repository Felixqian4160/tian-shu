import pandas as pd
import os
try:
    import akshare as ak
except ImportError:
    ak = None

class StockManager:
    def __init__(self):
        self.stocks = []
        self.data_path = "data/stock_list.csv"
        self._load_data()

    def _load_data(self):
        # 1. Try to load from local CSV
        if os.path.exists(self.data_path):
            try:
                df = pd.read_csv(self.data_path)
                self.stocks = df.to_dict('records')
                print(f"[OK] Loaded {len(self.stocks)} stocks from local cache.")
                return
            except Exception as e:
                print(f"[WARN] Failed to load local stock list: {e}")

        # 2. Try to fetch from Akshare (if available)
        # Note: Akshare might be blocked, so we wrap in try/except
        try:
            print("[INFO] Fetching stock list from Akshare...")
            # This interface is usually more stable than real-time quotes
            df = ak.stock_info_a_code_name() 
            # df columns: code, name
            
            # Generate simple Pinyin (simplified, as we don't have pypinyin)
            # For a real system we would use pypinyin. 
            # Here we just assume we don't have pinyin for the full list unless we have the lib.
            # But we can add a few hardcoded popular ones.
            
            self.stocks = df.to_dict('records')
            
            # Save to CSV
            os.makedirs(os.path.dirname(self.data_path), exist_ok=True)
            df.to_csv(self.data_path, index=False)
            print(f"[OK] Fetched and saved {len(self.stocks)} stocks.")
            return
        except Exception as e:
            print(f"[WARN] Akshare fetch failed: {e}")

        # 3. Fallback: Hardcoded Popular Stocks
        print("[WARN] Using fallback stock list.")
        self.stocks = [
            {"code": "600519", "name": "贵州茅台", "pinyin": "GZMT"},
            {"code": "300750", "name": "宁德时代", "pinyin": "NDSD"},
            {"code": "601318", "name": "中国平安", "pinyin": "ZGPA"},
            {"code": "600036", "name": "招商银行", "pinyin": "ZSYH"},
            {"code": "000858", "name": "五粮液", "pinyin": "WLY"},
            {"code": "601127", "name": "赛力斯", "pinyin": "SLS"},
            {"code": "301227", "name": "森鹰窗业", "pinyin": "SYCY"},
            {"code": "000001", "name": "平安银行", "pinyin": "PAYH"},
            {"code": "002594", "name": "比亚迪", "pinyin": "BYD"},
            {"code": "601919", "name": "中远海控", "pinyin": "ZYHK"},
            {"code": "600900", "name": "长江电力", "pinyin": "CJDL"},
            {"code": "601857", "name": "中国石油", "pinyin": "ZGSY"},
            {"code": "600276", "name": "恒瑞医药", "pinyin": "HRYY"},
            {"code": "603259", "name": "药明康德", "pinyin": "YMKD"},
            {"code": "300059", "name": "东方财富", "pinyin": "DFCF"},
            {"code": "600030", "name": "中信证券", "pinyin": "ZXZQ"},
            {"code": "000002", "name": "万科A", "pinyin": "WKA"},
            {"code": "601398", "name": "工商银行", "pinyin": "GSYH"},
            {"code": "601288", "name": "农业银行", "pinyin": "NYYH"},
            {"code": "601988", "name": "中国银行", "pinyin": "ZGYH"},
        ]

    def search(self, query):
        if not query:
            return []
        
        query = query.upper()
        results = []
        count = 0
        
        for stock in self.stocks:
            # Match Code
            code = str(stock.get('code', ''))
            name = str(stock.get('name', ''))
            pinyin = str(stock.get('pinyin', '')) # Might be empty if from Akshare without processing
            
            # Simple Pinyin Match (if pinyin missing, we can't match it easily without lib)
            # If we really want pinyin for all, we need pypinyin.
            # For now, we only match what we have.
            
            if query in code or query in name or (pinyin and query in pinyin):
                results.append(stock)
                count += 1
                if count >= 10: # Limit results
                    break
        
        return results

stock_manager = StockManager()
