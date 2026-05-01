# src/utils/data_generator.py
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

class DataGenerator:
    """
    Mock Data Generator for testing when no real data source is available.
    """
    def __init__(self):
        pass
        
    def fetch_minute_data(self, code, start_time, end_time):
        """
        Generate mock minute data (Sine wave + Random noise)
        """
        print(f"⚠️ Using MOCK Data Generator for {code}...")
        
        # Create time range
        # Trading hours: 9:30-11:30, 13:00-15:00 (4 hours = 240 mins)
        # Simplify: just generate continuous minutes for the range
        
        freq = '1min'
        dt_range = pd.date_range(start=start_time, end=end_time, freq=freq)
        
        # Filter trading hours? (Optional, skip for simple mock)
        
        n = len(dt_range)
        if n == 0: return pd.DataFrame()
        
        # Generate Price
        base_price = 10.0
        # Sine wave pattern
        x = np.linspace(0, 4*np.pi, n)
        trend = np.sin(x) * 0.5 # +/- 0.5 fluctuation
        noise = np.random.normal(0, 0.05, n) # Random noise
        
        close_prices = base_price + trend + noise
        
        # Generate OHLC
        opens = close_prices + np.random.normal(0, 0.02, n)
        highs = np.maximum(opens, close_prices) + np.abs(np.random.normal(0, 0.03, n))
        lows = np.minimum(opens, close_prices) - np.abs(np.random.normal(0, 0.03, n))
        vols = np.random.randint(100, 1000, n) * 100
        amounts = vols * close_prices
        
        df = pd.DataFrame({
            'code': code,
            'dt': dt_range,
            'open': np.round(opens, 2),
            'high': np.round(highs, 2),
            'low': np.round(lows, 2),
            'close': np.round(close_prices, 2),
            'vol': vols,
            'amount': np.round(amounts, 2)
        })
        
        return df

    def get_latest_bar(self, code):
        """
        Generate a single mock real-time bar
        """
        now = datetime.now()
        base_price = 10.0 + np.random.normal(0, 0.5)
        
        return {
            'code': code,
            'dt': now,
            'open': round(base_price, 2),
            'high': round(base_price * 1.01, 2),
            'low': round(base_price * 0.99, 2),
            'close': round(base_price * (1 + np.random.normal(0, 0.005)), 2),
            'vol': 5000,
            'amount': 50000.0
        }
