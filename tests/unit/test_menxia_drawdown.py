from src.core.menxia_sheng import MenxiaSheng
from src.ministries.xing_bu_justice import XingBuJustice


def test_allow_buy_when_drawdown_exceeds_limit(monkeypatch):
    def fake_get_value(key, default=None):
        table = {
            "risk_control.max_stop_loss_pct": 1.0,
            "risk_control.max_pos_per_stock": 1.0,
            "risk_control.max_total_pos": 1.0,
            "risk_control.max_daily_loss_pct": 1.0,
            "risk_control.max_drawdown_pct": 0.03
        }
        return table.get(key, default)

    monkeypatch.setattr("src.core.menxia_sheng.get_value", fake_get_value)
    justice = XingBuJustice()
    menxia = MenxiaSheng(justice)
    signal = {
        "strategy_id": "T1",
        "direction": "BUY",
        "price": 100.0,
        "qty": 100,
        "dt": "2026-03-22 10:00:00"
    }
    approved, reason = menxia.check_signal(signal, 1_000_000.0, {}, 0.0, current_drawdown=0.05)
    assert approved is True
    assert reason == "批准执行"
    assert justice.rejections == []


def test_allow_sell_even_if_drawdown_exceeds_limit(monkeypatch):
    def fake_get_value(key, default=None):
        table = {
            "risk_control.max_stop_loss_pct": 1.0,
            "risk_control.max_pos_per_stock": 1.0,
            "risk_control.max_total_pos": 1.0,
            "risk_control.max_daily_loss_pct": 1.0,
            "risk_control.max_drawdown_pct": 0.03
        }
        return table.get(key, default)

    monkeypatch.setattr("src.core.menxia_sheng.get_value", fake_get_value)
    justice = XingBuJustice()
    menxia = MenxiaSheng(justice)
    signal = {
        "strategy_id": "T1",
        "direction": "SELL",
        "price": 100.0,
        "qty": 100,
        "dt": "2026-03-22 10:00:00"
    }
    approved, _ = menxia.check_signal(signal, 1_000_000.0, {"000001.SZ": {"market_value": 10000}}, 0.0, current_drawdown=0.05)
    assert approved is True
