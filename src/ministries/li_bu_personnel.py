# src/ministries/li_bu_personnel.py

class LiBuPersonnel:
    """
    吏部 (Personnel): 管理10套策略身份、权限、运行状态
    """
    def __init__(self):
        self.strategies = {} # Strategy ID -> Strategy Instance
        self.active_strategies = set()
        self.strategy_performance_status = {} # Track basic status like "Active", "Eliminated", etc.

    def register_strategy(self, strategy):
        """
        Register a strategy instance.
        """
        self.strategies[strategy.id] = strategy
        self.active_strategies.add(strategy.id)
        self.strategy_performance_status[strategy.id] = "Active"

    def get_strategy(self, strategy_id):
        return self.strategies.get(strategy_id)

    def deactivate_strategy(self, strategy_id, reason="Manual"):
        """
        Deactivate a strategy (e.g. if consistently losing).
        """
        if strategy_id in self.active_strategies:
            self.active_strategies.remove(strategy_id)
            self.strategy_performance_status[strategy_id] = f"Inactive: {reason}"
            print(f"Strategy {strategy_id} deactivated due to {reason}.")
            
    def check_strategy_status(self, strategy_id):
        return self.strategy_performance_status.get(strategy_id, "Unknown")
