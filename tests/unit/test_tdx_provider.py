from datetime import datetime, timedelta

import pandas as pd

from src.utils.tdx_provider import TdxProvider


class _FakeQuotes:
    def __init__(self, rows):
        self._rows = rows

    def bars(self, symbol):
        return pd.DataFrame(self._rows)


class _FakeReader:
    def __init__(self, minute_rows=None, daily_rows=None):
        self._minute_rows = minute_rows or []
        self._daily_rows = daily_rows or []

    def minute(self, symbol):
        return pd.DataFrame(self._minute_rows)

    def daily(self, symbol):
        return pd.DataFrame(self._daily_rows)


def _build_rows(start, count, step_min=1):
    rows = []
    for i in range(count):
        dt = start + timedelta(minutes=i * step_min)
        rows.append(
            {
                "datetime": dt.strftime("%Y-%m-%d %H:%M:%S"),
                "open": 10.0 + i * 0.01,
                "high": 10.2 + i * 0.01,
                "low": 9.9 + i * 0.01,
                "close": 10.1 + i * 0.01,
                "vol": 1000 + i,
                "amount": 200000 + i * 10,
            }
        )
    return rows


def test_tdx_provider_check_connectivity_by_quotes(monkeypatch):
    p = TdxProvider()
    now = datetime.now().replace(second=0, microsecond=0)
    quote_rows = _build_rows(now - timedelta(minutes=2), 3, step_min=1)
    monkeypatch.setattr(p, "_ensure_quotes", lambda: _FakeQuotes(quote_rows))
    monkeypatch.setattr(p, "_ensure_reader", lambda: _FakeReader())
    ok, msg = p.check_connectivity("600000.SH")
    assert ok is True
    assert msg == "ok"


def test_tdx_provider_describe_mode_without_vipdoc(monkeypatch):
    p = TdxProvider()
    monkeypatch.setattr(p, "_has_valid_tdxdir", lambda: False)
    p.provider_mode = "network_mirror"
    mode = p.describe_mode()
    assert mode["provider_mode"] == "network_mirror"
    assert mode["has_vipdoc"] is False
    assert mode["cache_dir"]



def test_tdx_provider_check_connectivity_pass_with_network_mirror(monkeypatch):
    p = TdxProvider()
    monkeypatch.setattr(p, "_quotes_bars", lambda raw_code: pd.DataFrame())
    monkeypatch.setattr(p, "_reader_daily", lambda raw_code: pd.DataFrame())
    monkeypatch.setattr(p, "_quotes_snapshot", lambda raw_code: pd.DataFrame())
    monkeypatch.setattr(p, "_load_cached_daily_data", lambda code, s, e: (pd.DataFrame(), False))
    monkeypatch.setattr(p, "_ensure_reader", lambda: None)
    monkeypatch.setattr(p, "_ensure_quotes", lambda: object())
    monkeypatch.setattr(p, "_has_valid_tdxdir", lambda: False)
    ok, msg = p.check_connectivity("600000.SH")
    assert ok is True
    assert msg == "ok_network_mirror"



def test_tdx_provider_fetch_daily_from_cache_without_vipdoc(monkeypatch):
    p = TdxProvider()
    start = datetime.now().replace(second=0, microsecond=0) - timedelta(days=3)
    cached_daily = pd.DataFrame(_build_rows(start, 3, step_min=24 * 60))
    monkeypatch.setattr(p, "_load_cached_daily_data", lambda code, s, e: (p._normalize_ohlcv_df(cached_daily, code=code), True))
    monkeypatch.setattr(p, "_reader_daily", lambda raw_code: pd.DataFrame())
    out = p.fetch_kline_data("600000.SH", start, datetime.now(), interval="D")
    assert isinstance(out, pd.DataFrame)
    assert not out.empty
    assert "dt" in out.columns


def test_tdx_provider_get_latest_bar_from_quotes(monkeypatch):
    p = TdxProvider()
    now = datetime.now().replace(second=0, microsecond=0)
    quote_rows = _build_rows(now - timedelta(minutes=3), 4, step_min=1)
    monkeypatch.setattr(p, "_ensure_quotes", lambda: _FakeQuotes(quote_rows))
    monkeypatch.setattr(p, "_ensure_reader", lambda: _FakeReader())
    bar = p.get_latest_bar("600000.SH")
    assert isinstance(bar, dict)
    assert bar["code"] == "600000.SH"
    assert isinstance(bar["dt"], pd.Timestamp)
    assert float(bar["close"]) > 0


def test_tdx_provider_fetch_kline_data_daily_from_reader(monkeypatch):
    p = TdxProvider()
    start = datetime.now().replace(second=0, microsecond=0) - timedelta(days=6)
    daily_rows = _build_rows(start, 5, step_min=24 * 60)
    monkeypatch.setattr(p, "_ensure_reader", lambda: _FakeReader(daily_rows=daily_rows))
    monkeypatch.setattr(p, "_ensure_quotes", lambda: _FakeQuotes([]))
    out = p.fetch_kline_data("600000.SH", start, datetime.now(), interval="D")
    assert isinstance(out, pd.DataFrame)
    assert not out.empty
    assert "dt" in out.columns


def test_tdx_provider_fetch_kline_data_resample_10min(monkeypatch):
    p = TdxProvider()
    start = datetime.now().replace(second=0, microsecond=0) - timedelta(minutes=30)
    minute_rows = _build_rows(start, 20, step_min=1)
    monkeypatch.setattr(p, "_ensure_reader", lambda: _FakeReader(minute_rows=minute_rows))
    monkeypatch.setattr(p, "_ensure_quotes", lambda: _FakeQuotes([]))
    out = p.fetch_kline_data("600000.SH", start, start + timedelta(minutes=19), interval="10min")
    assert isinstance(out, pd.DataFrame)
    assert not out.empty
    assert "dt" in out.columns


def test_tdx_provider_reader_requires_valid_tdxdir(monkeypatch):
    p = TdxProvider()
    p.tdxdir = ""
    monkeypatch.setattr(p, "_import_mootdx", lambda: (object(), object()))
    reader = p._create_reader()
    assert reader is None
    assert "tdxdir 未配置或无效" in str(p.last_error)


def test_tdx_provider_connectivity_pass_with_valid_reader(monkeypatch):
    p = TdxProvider()
    monkeypatch.setattr(p, "_quotes_bars", lambda raw_code: pd.DataFrame())
    monkeypatch.setattr(p, "_reader_daily", lambda raw_code: pd.DataFrame())
    monkeypatch.setattr(p, "_quotes_snapshot", lambda raw_code: pd.DataFrame())
    monkeypatch.setattr(p, "_load_cached_daily_data", lambda code, s, e: (pd.DataFrame(), False))
    monkeypatch.setattr(p, "_ensure_reader", lambda: object())
    monkeypatch.setattr(p, "_ensure_quotes", lambda: None)
    monkeypatch.setattr(p, "_has_valid_tdxdir", lambda: True)
    ok, msg = p.check_connectivity("600000.SH")
    assert ok is True
    assert msg == "ok_reader"


def test_tdx_provider_normalize_daily_index_datetime():
    p = TdxProvider()
    idx = pd.to_datetime(["2026-04-10", "2026-04-11"])
    raw = pd.DataFrame(
        {
            "open": [10.0, 10.2],
            "high": [10.5, 10.6],
            "low": [9.9, 10.0],
            "close": [10.3, 10.4],
            "amount": [100000, 120000],
            "volume": [2000, 2200],
        },
        index=idx,
    )
    out = p._normalize_ohlcv_df(raw, code="601888.SH")
    assert not out.empty
    assert "dt" in out.columns
    assert len(out) == 2


def test_fetch_minute_data_uses_pseudo_1m_when_lc1_missing(monkeypatch):
    p = TdxProvider()
    now = datetime.now().replace(second=0, microsecond=0)
    st = now - timedelta(minutes=2)
    et = now
    snap = pd.DataFrame(
        [
            {
                "code": "000001",
                "price": 11.18,
                "open": 11.16,
                "high": 11.22,
                "low": 11.15,
                "vol": 305855,
                "amount": 342327968.0,
                "servertime": "09:31:00",
            }
        ]
    )
    monkeypatch.setattr(p, "_load_cached_minute_data", lambda code, s, e: (pd.DataFrame(), False))
    monkeypatch.setattr(p, "_reader_minute", lambda raw_code: pd.DataFrame())
    monkeypatch.setattr(p, "_quotes_bars", lambda raw_code: pd.DataFrame())
    monkeypatch.setattr(p, "_quotes_snapshot", lambda raw_code: snap.copy())
    out = p.fetch_minute_data("000001.SZ", st, et)
    assert isinstance(out, pd.DataFrame)
    assert not out.empty
    assert len(out) == 1
    assert float(out.iloc[-1]["close"]) == 11.18
