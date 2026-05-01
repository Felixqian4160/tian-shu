# src/strategies/user_strategy_template.py
from src.strategies.base_strategy import BaseStrategy

class UserStrategyTemplate(BaseStrategy):
    """
    Template for User Defined Strategy.
    Copy this file and implement the logic.
    """
    def __init__(self, strategy_id, params=None):
        super().__init__(strategy_id)
        self.params = params or {}
        # Initialize any indicators or state variables here

    def on_bar(self, kline):
        """
        Called on every 1-minute K-line.
        
        Args:
            kline (dict): {
                'code': str,
                'dt': datetime,
                'open': float,
                'high': float,
                'low': float,
                'close': float,
                'vol': float,
                ...
            }
            
        Returns:
            dict or None: Signal dictionary if entry/exit triggered.
        """
        code = kline['code']
        # 1. Update Indicators
        
        # 2. Check Entry Conditions
        # if condition and self.positions.get(code, 0) == 0:
        #     return {
        #         'strategy_id': self.id,
        #         'code': code,
        #         'dt': kline['dt'],
        #         'direction': 'BUY',
        #         'price': kline['close'],
        #         'qty': 100,
        #         'stop_loss': kline['close'] * 0.99,
        #         'take_profit': kline['close'] * 1.05
        #     }
            
        # 3. Check Exit Conditions
        # if condition and self.positions.get(code, 0) > 0:
        #     return {
        #         'strategy_id': self.id,
        #         'code': code,
        #         'dt': kline['dt'],
        #         'direction': 'SELL',
        #         'price': kline['close'],
        #         'qty': self.positions[code],
        #         'stop_loss': None,
        #         'take_profit': None
        #     }
            
        return None
