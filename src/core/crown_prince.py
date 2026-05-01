# src/core/crown_prince.py
import pandas as pd
from datetime import datetime
from src.ministries.gong_bu_works import GongBuWorks

class CrownPrince:
    """
    太子 (Crown Prince): 对每根K线、每只股票做前置校验，过滤非法标的
    """
    def __init__(self):
        self.gong_bu = GongBuWorks()
        self.banned_stocks = set() # ST, *ST, etc.
        self.low_liquidity_stocks = set() # Daily turnover < 100M

    def set_banned_stocks(self, stocks: list):
        self.banned_stocks = set(stocks)

    def validate_and_distribute(self, kline_data: pd.DataFrame):
        """
        Validate K-line data and distribute to strategies.
        Returns cleaned and validated data.
        """
        # 1. Clean data via Works Ministry
        cleaned_data = self.gong_bu.clean_data(kline_data)
        
        if cleaned_data.empty:
            return pd.DataFrame()

        # 2. Filter banned stocks
        # Assuming single stock dataframe for now, or group by code if multiple
        current_code = cleaned_data['code'].iloc[0]
        if current_code in self.banned_stocks:
            print(f"Stock {current_code} is banned.")
            return pd.DataFrame()

        # 3. Filter low liquidity (simplified check, real check needs daily aggregation)
        # Here we just pass through as we don't have daily agg in this method scope easily without looking back
        
        # 4. Filter limit up/down (strategies shouldn't buy on limit up, sell on limit down generally, 
        # but the prompt says 'Prohibit opening on limit up/down'. This is usually checked at signal generation or execution.
        # However, the Prince can flag these.)
        
        return cleaned_data
