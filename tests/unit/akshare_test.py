import pandas as pd
import pytest
import requests

ak = pytest.importorskip("akshare")


def test_stock_zh_a_hist_min_em_returns_dataframe():
    try:
        df = ak.stock_zh_a_hist_min_em(
            symbol="688585",
            start_date="2026-04-01 09:30:00",
            end_date="2026-04-01 15:00:00",
            period="5",
            adjust="hfq",
        )
    except requests.exceptions.ProxyError as exc:
        pytest.skip(f"network proxy unavailable for akshare endpoint: {exc}")
    except requests.exceptions.RequestException as exc:
        pytest.skip(f"network unavailable for akshare endpoint: {exc}")

    assert isinstance(df, pd.DataFrame)
    assert not df.empty


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q", "-rA"]))
