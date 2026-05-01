# src/strategies/base_strategy.py

class BaseStrategy:
    """
    Base Strategy Class
    """
    def __init__(self, strategy_id):
        self.id = strategy_id
        self.name = f"Placeholder_Strategy_{strategy_id}" # Marked as placeholder
        self.positions = {} # Code -> Qty
        self.cash = 0.0 # Virtual cash if tracked per strategy
        self.history = {}

    def on_bar(self, kline):
        """
        Called on every bar.
        Returns a signal dict or None.
        """
        raise NotImplementedError

    def update_position(self, code, qty):
        self.positions[code] = qty
