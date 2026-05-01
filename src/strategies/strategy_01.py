# src/strategies/strategy_01.py
from src.strategies.base_strategy import BaseStrategy
import pandas as pd

class DualMAStrategy(BaseStrategy):
    """
    Strategy 01: Simple Dual Moving Average Crossover
    """
    def __init__(self, strategy_id, short_window=5, long_window=20):
        super().__init__(strategy_id)
        self.short_window = short_window
        self.long_window = long_window
        self.prices = {} # Code -> List of prices

    def on_bar(self, kline):
        code = kline['code']
        close_price = kline['close']
        
        if code not in self.prices:
            self.prices[code] = []
            
        self.prices[code].append(close_price)
        
        if len(self.prices[code]) > self.long_window:
            self.prices[code].pop(0) # keep window size
            
        if len(self.prices[code]) < self.long_window:
            return None

        # Calculate MAs
        prices = self.prices[code]
        short_ma = sum(prices[-self.short_window:]) / self.short_window
        long_ma = sum(prices) / self.long_window
        
        # Get current position for this stock
        current_pos = self.positions.get(code, 0)
        
        # Simple Crossover Logic
        if short_ma > long_ma and current_pos == 0:
            # Entry Signal
            return {
                'strategy_id': self.id,
                'code': code,
                'dt': kline['dt'],
                'direction': 'BUY',
                'price': kline['close'],
                'qty': 100, # Fixed quantity 100 shares
                'stop_loss': kline['close'] * 0.99, # 1% SL
                'take_profit': kline['close'] * 1.05 # 5% TP
            }
        elif short_ma < long_ma and current_pos > 0:
            # Exit Signal
            return {
                'strategy_id': self.id,
                'code': code,
                'dt': kline['dt'],
                'direction': 'SELL',
                'price': kline['close'],
                'qty': current_pos,
                'stop_loss': None,
                'take_profit': None
            }
            
        return None
