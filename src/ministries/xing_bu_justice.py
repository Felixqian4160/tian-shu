# src/ministries/xing_bu_justice.py

class XingBuJustice:
    """
    刑部 (Justice): 记录违规、熔断、驳回、异常交易
    """
    def __init__(self):
        self.violations = [] # List of dicts
        self.rejections = [] # List of dicts
        self.circuit_breaks = [] # List of dicts

    def record_violation(self, strategy_id, rule_id, details, dt):
        """
        Record a compliance violation.
        """
        record = {
            'strategy_id': strategy_id,
            'rule_id': rule_id,
            'details': details,
            'dt': dt
        }
        self.violations.append(record)
        print(f"VIOLATION RECORDED: Strategy {strategy_id} violated Rule {rule_id}: {details}")

    def record_rejection(self, strategy_id, rule_id, details, dt):
        """
        Record a risk control rejection.
        """
        record = {
            'strategy_id': strategy_id,
            'rule_id': rule_id,
            'details': details,
            'dt': dt
        }
        self.rejections.append(record)
        # print(f"REJECTION: Strategy {strategy_id} rejected by Rule {rule_id}: {details}")

    def record_circuit_break(self, strategy_id, details, dt):
        """
        Record a circuit break event.
        """
        record = {
            'strategy_id': strategy_id,
            'details': details,
            'dt': dt
        }
        self.circuit_breaks.append(record)
        # print(f"CIRCUIT BREAK: Strategy {strategy_id} triggered circuit break: {details}")

    def get_violation_count(self, strategy_id):
        return len([v for v in self.violations if v['strategy_id'] == strategy_id])

    def get_rejection_count(self, strategy_id):
        return len([r for r in self.rejections if r['strategy_id'] == strategy_id])

    def get_circuit_break_count(self, strategy_id):
        return len([c for c in self.circuit_breaks if c['strategy_id'] == strategy_id])
