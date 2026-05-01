from datetime import datetime, timedelta

import pandas as pd

import src.evolution.adapters.fundamental_adapter as fundamental_adapter


class _FakeConfig:
    """Simple config stub that supports dotted path lookup used by ConfigLoader."""

    def __init__(self, payload):
        self._payload = payload

    def get(self, key, default=None):
        cur = self._payload
        for part in str(key).split("."):
            if not isinstance(cur, dict) or part not in cur:
                return default
            cur = cur.get(part)
        return cur


class _FakeTdxProvider:
    """TDX provider stub to keep tests offline and deterministic."""

    def __init__(self):
        self.last_error = ""

    def get_latest_bar(self, code):
        return {
            "code": str(code),
            "dt": datetime(2026, 4, 15, 10, 30, 0),
            "open": 10.0,
            "high": 10.3,
            "low": 9.9,
            "close": 10.2,
            "vol": 12345.0,
            "amount": 4567890.0,
        }

    def fetch_kline_data(self, code, start_time, end_time, interval="D"):
        rows = []
        for i in range(3):
            dt = datetime(2026, 4, 10) + timedelta(days=i)
            rows.append(
                {
                    "code": str(code),
                    "dt": dt,
                    "open": 10.0 + i * 0.1,
                    "high": 10.2 + i * 0.1,
                    "low": 9.8 + i * 0.1,
                    "close": 10.1 + i * 0.1,
                    "vol": 1000.0 + i,
                    "amount": 200000.0 + i * 1000.0,
                }
            )
        return pd.DataFrame(rows)


def test_fundamental_adapter_supports_tdx_provider(monkeypatch):
    # Arrange config so the adapter selects TDX provider and can run in backtest context.
    fake_cfg = _FakeConfig(
        {
            "fundamental_adapter": {
                "enabled": True,
                "apply_in_backtest": True,
                "apply_in_live": False,
                "provider": "tdx",
                "cache_ttl_sec": 120,
                "min_refresh_interval_sec": 30,
                "disk_persist_enabled": False,
                "disk_cache_dir": "data/fundamental_cache",
                "disk_cache_max_files": 200,
            }
        }
    )
    monkeypatch.setattr(fundamental_adapter.ConfigLoader, "reload", staticmethod(lambda: fake_cfg))
    monkeypatch.setattr(fundamental_adapter, "TdxProvider", _FakeTdxProvider)
    manager = fundamental_adapter.FundamentalAdapterManager()

    # Act
    profile = manager.get_profile("600000.SH", context="backtest", force=True, allow_network=True)

    # Assert: keep same high-level payload shape as existing provider branch.
    assert profile.get("status") == "success"
    assert profile.get("provider") == "tdx"
    assert profile.get("ts_code") == "600000.SH"
    modules = profile.get("modules")
    assert isinstance(modules, dict)
    assert "tdx_latest_bar" in modules
    assert "tdx_daily_bars" in modules
    assert modules["tdx_latest_bar"].get("status") == "success"
    assert int(modules["tdx_daily_bars"].get("rows", 0)) >= 1
