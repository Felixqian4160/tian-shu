import asyncio
import logging

import server
from src.tdx.terminal_bridge import TdxTerminalBridge


def test_api_tdx_terminal_connect_and_status_flow():
    server._TDX_TERMINAL_BRIDGE = TdxTerminalBridge(adapter_type="mock")
    connect_req = server.TdxTerminalConnectRequest(adapter="mock", host="127.0.0.1", port=7708, account_id="demo")
    connect_resp = asyncio.run(server.api_tdx_terminal_connect(connect_req))
    assert connect_resp["status"] == "success"
    assert connect_resp["terminal"]["connected"] is True
    status_resp = asyncio.run(server.api_tdx_terminal_status())
    assert status_resp["status"] == "success"
    assert status_resp["terminal"]["connected"] is True


def test_api_tdx_terminal_subscribe_order_and_query_flow():
    server._TDX_TERMINAL_BRIDGE = TdxTerminalBridge(adapter_type="mock")
    asyncio.run(server.api_tdx_terminal_connect(server.TdxTerminalConnectRequest(adapter="mock")))

    sub_resp = asyncio.run(
        server.api_tdx_terminal_subscribe(server.TdxTerminalSubscribeRequest(symbols=["600000.SH", "000001.SZ"]))
    )
    assert sub_resp["status"] == "success"
    assert sub_resp["count"] == 2

    order_resp = asyncio.run(
        server.api_tdx_terminal_place_order(
            server.TdxTerminalOrderRequest(symbol="600000.SH", direction="BUY", qty=100, price=10.2)
        )
    )
    assert order_resp["status"] == "success"
    assert order_resp["order"]["status"] == "accepted"

    orders_resp = asyncio.run(server.api_tdx_terminal_orders(limit=10))
    assert orders_resp["status"] == "success"
    assert orders_resp["count"] >= 1

    quotes_resp = asyncio.run(server.api_tdx_terminal_quotes())
    assert quotes_resp["status"] == "success"
    assert quotes_resp["count"] == 2


def test_api_tdx_terminal_subscribe_error_contract():
    server._TDX_TERMINAL_BRIDGE = TdxTerminalBridge(adapter_type="mock")
    resp = asyncio.run(server.api_tdx_terminal_subscribe(server.TdxTerminalSubscribeRequest(symbols=[])))
    assert resp["status"] == "error"
    assert resp["error_code"] == "TDX_TERMINAL_SYMBOLS_REQUIRED"
    assert isinstance(resp.get("details"), dict)


def test_api_tdx_terminal_connect_error_for_unknown_adapter():
    req = server.TdxTerminalConnectRequest(adapter="unknown_adapter")
    resp = asyncio.run(server.api_tdx_terminal_connect(req))
    assert resp["status"] == "error"
    assert resp["error_code"] == "TDX_TERMINAL_CONNECT_FAILED"
    assert isinstance(resp.get("details"), dict)


def test_api_tdx_broker_gateway_place_order_flow():
    server._TDX_TERMINAL_BRIDGE = TdxTerminalBridge(adapter_type="broker_gateway")
    connect_req = server.TdxTerminalConnectRequest(
        adapter="broker_gateway",
        host="127.0.0.1",
        port=9001,
        account_id="broker-demo",
        api_key="k1",
        api_secret="s1",
        sign_method="hmac_sha256",
    )
    connect_resp = asyncio.run(server.api_tdx_terminal_connect(connect_req))
    assert connect_resp["status"] == "success"
    assert connect_resp["terminal"]["adapter"] == "broker_gateway"
    assert connect_resp["terminal"]["trading_enabled"] is True

    login_resp = asyncio.run(
        server.api_tdx_terminal_broker_login(
            server.TdxTerminalBrokerLoginRequest(username="u1", password="p1", initial_cash=200000.0)
        )
    )
    assert login_resp["status"] == "success"
    assert login_resp["login"]["session_token"]

    order_resp = asyncio.run(
        server.api_tdx_terminal_place_order(
            server.TdxTerminalOrderRequest(symbol="600000.SH", direction="BUY", qty=100, price=10.1)
        )
    )
    assert order_resp["status"] == "success"
    assert order_resp["order"]["adapter"] == "broker_gateway"
    assert order_resp["order"]["status"] == "submitted"
    assert order_resp["order"]["auth_meta"]["sign_method"] == "hmac_sha256"
    assert order_resp["order"]["auth_meta"]["signature"]

    orders_resp = asyncio.run(server.api_tdx_terminal_orders(limit=10))
    assert orders_resp["status"] == "success"
    assert orders_resp["count"] >= 1

    balance_resp = asyncio.run(server.api_tdx_terminal_broker_balance())
    assert balance_resp["status"] == "success"
    assert float(balance_resp["balance"]["cash_total"]) == 200000.0

    positions_resp = asyncio.run(server.api_tdx_terminal_broker_positions())
    assert positions_resp["status"] == "success"
    assert positions_resp["count"] == 0

    order_id = str(order_resp["order"]["order_id"])
    cancel_resp = asyncio.run(
        server.api_tdx_terminal_broker_cancel_order(server.TdxTerminalBrokerCancelRequest(order_id=order_id))
    )
    assert cancel_resp["status"] == "success"
    assert cancel_resp["cancel_result"]["status"] == "cancelled"


def test_api_tdx_broker_login_error_contract():
    server._TDX_TERMINAL_BRIDGE = TdxTerminalBridge(adapter_type="broker_gateway")
    asyncio.run(server.api_tdx_terminal_connect(server.TdxTerminalConnectRequest(adapter="broker_gateway")))
    resp = asyncio.run(
        server.api_tdx_terminal_broker_login(
            server.TdxTerminalBrokerLoginRequest(username="", password="")
        )
    )
    assert resp["status"] == "error"
    assert resp["error_code"] == "TDX_TERMINAL_BROKER_AUTH_REQUIRED"
    assert isinstance(resp.get("details"), dict)


def test_api_tdx_broker_gateway_real_http_template(monkeypatch):
    class _Resp:
        def __init__(self, status_code, payload):
            self.status_code = status_code
            self._payload = payload

        def json(self):
            return self._payload

    def _fake_request(method, url, json=None, headers=None, timeout=None):
        if url.endswith("/auth/login"):
            return _Resp(200, {"session_token": "T1", "expires_in": 1800})
        if "/accounts/balance" in url:
            return _Resp(200, {"balance": {"currency": "CNY", "cash_total": 123456.0}})
        if "/accounts/positions" in url:
            return _Resp(200, {"positions": [{"symbol": "600000.SH", "qty": 100}]})
        if url.endswith("/orders") and str(method).upper() == "POST":
            return _Resp(200, {"order": {"order_id": "R1", "status": "submitted"}})
        if "/orders/" in url and url.endswith("/cancel"):
            return _Resp(200, {"cancel_result": {"order_id": "R1", "status": "cancelled"}})
        if "/orders?limit=" in url:
            return _Resp(200, {"orders": [{"order_id": "R1", "status": "submitted"}]})
        return _Resp(200, {})

    monkeypatch.setattr("requests.request", _fake_request)
    server._TDX_TERMINAL_BRIDGE = TdxTerminalBridge(adapter_type="broker_gateway")
    asyncio.run(
        server.api_tdx_terminal_connect(
            server.TdxTerminalConnectRequest(
                adapter="broker_gateway",
                base_url="http://broker.local",
                api_key="k1",
                api_secret="s1",
                sign_method="hmac_sha256",
                timeout_sec=3,
                retry_count=1,
            )
        )
    )
    login = asyncio.run(server.api_tdx_terminal_broker_login(server.TdxTerminalBrokerLoginRequest(username="u", password="p")))
    assert login["status"] == "success"
    bal = asyncio.run(server.api_tdx_terminal_broker_balance())
    assert bal["status"] == "success"
    assert float(bal["balance"]["cash_total"]) == 123456.0
    pos = asyncio.run(server.api_tdx_terminal_broker_positions())
    assert pos["status"] == "success"
    assert pos["count"] == 1
    order = asyncio.run(
        server.api_tdx_terminal_place_order(server.TdxTerminalOrderRequest(symbol="600000.SH", direction="BUY", qty=100, price=10.0))
    )
    assert order["status"] == "success"
    assert order["order"]["order_id"] == "R1"
    cancel = asyncio.run(server.api_tdx_terminal_broker_cancel_order(server.TdxTerminalBrokerCancelRequest(order_id="R1")))
    assert cancel["status"] == "success"
    assert cancel["cancel_result"]["status"] == "cancelled"


def test_broker_hook_logger_masks_sensitive_fields(caplog):
    server._TDX_TERMINAL_BRIDGE = TdxTerminalBridge(adapter_type="broker_gateway")
    connect_resp = asyncio.run(
        server.api_tdx_terminal_connect(
            server.TdxTerminalConnectRequest(
                adapter="broker_gateway",
                api_key="ak-demo",
                api_secret="super-secret",
                sign_method="hmac_sha256",
                hook_enabled=True,
                hook_level="INFO",
                hook_logger_name="TdxBrokerGatewayHook",
                hook_log_payload=True,
            )
        )
    )
    assert connect_resp["status"] == "success"
    asyncio.run(
        server.api_tdx_terminal_broker_login(
            server.TdxTerminalBrokerLoginRequest(username="user-a", password="pass-a")
        )
    )
    with caplog.at_level(logging.INFO, logger="TdxBrokerGatewayHook"):
        asyncio.run(
            server.api_tdx_terminal_place_order(
                server.TdxTerminalOrderRequest(symbol="600000.SH", direction="BUY", qty=100, price=11.0)
            )
        )
    log_text = "\n".join([str(r.message) for r in caplog.records])
    assert "super-secret" not in log_text
    assert "pass-a" not in log_text


def test_api_set_source_supports_tdx(monkeypatch):
    class _DummyCfg:
        def __init__(self):
            self._data = {"data_provider": {"source": "default"}}

        def get(self, key, default=None):
            cur = self._data
            try:
                for part in str(key).split("."):
                    cur = cur[part]
                return cur
            except Exception:
                return default

        def set(self, key, value):
            keys = str(key).split(".")
            cur = self._data
            for part in keys[:-1]:
                if part not in cur or not isinstance(cur[part], dict):
                    cur[part] = {}
                cur = cur[part]
            cur[keys[-1]] = value

        def save(self):
            return None

    class _FakeLoader:
        _cfg = _DummyCfg()

        @classmethod
        def reload(cls, config_path="config.json"):
            return cls._cfg

    async def _fake_broadcast(_msg):
        return None

    monkeypatch.setattr(server, "ConfigLoader", _FakeLoader)
    monkeypatch.setattr(server, "_live_running_codes", lambda: [])
    monkeypatch.setattr(server.manager, "broadcast", _fake_broadcast)

    req = server.SourceSwitchRequest(source="tdx")
    resp = asyncio.run(server.api_set_source(req))
    assert resp["status"] == "success"
    assert resp["source"] == "tdx"
    assert resp["live_restarted"] is False


def test_api_set_source_supports_duckdb(monkeypatch):
    class _DummyCfg:
        def __init__(self):
            self._data = {"data_provider": {"source": "default"}}

        def get(self, key, default=None):
            cur = self._data
            try:
                for part in str(key).split("."):
                    cur = cur[part]
                return cur
            except Exception:
                return default

        def set(self, key, value):
            keys = str(key).split(".")
            cur = self._data
            for part in keys[:-1]:
                if part not in cur or not isinstance(cur[part], dict):
                    cur[part] = {}
                cur = cur[part]
            cur[keys[-1]] = value

        def save(self):
            return None

    class _FakeLoader:
        _cfg = _DummyCfg()

        @classmethod
        def reload(cls, config_path="config.json"):
            return cls._cfg

    async def _fake_broadcast(_msg):
        return None

    monkeypatch.setattr(server, "ConfigLoader", _FakeLoader)
    monkeypatch.setattr(server, "_live_running_codes", lambda: [])
    monkeypatch.setattr(server.manager, "broadcast", _fake_broadcast)

    req = server.SourceSwitchRequest(source="duckdb")
    resp = asyncio.run(server.api_set_source(req))
    assert resp["status"] == "success"
    assert resp["source"] == "duckdb"
    assert resp["live_restarted"] is False


    class _DummyCfg:
        def get(self, key, default=None):
            if key == "data_provider.tdxdir":
                return ""
            if key == "data_provider.tdx_dir":
                return ""
            return default

    class _FakeLoader:
        @classmethod
        def reload(cls, config_path="config.json"):
            return _DummyCfg()

    class _FakeProvider:
        def __init__(self, tdxdir=None, **kwargs):
            self.last_error = ""
            self._tdxdir = str(tdxdir or "")

        def check_connectivity(self, code):
            return True, "ok_local"

    monkeypatch.setattr(server, "ConfigLoader", _FakeLoader)
    monkeypatch.setattr(server, "_detect_tdxdir_candidates", lambda limit=8: [r"D:\new_tdx"])
    monkeypatch.setattr(server, "_is_valid_tdxdir", lambda p: str(p).strip().lower() == r"d:\new_tdx")
    monkeypatch.setattr(server, "TdxProvider", _FakeProvider)

    req = server.TdxConnectivityTestRequest(tdxdir="", stock_code="600000.SH", auto_detect=True)
    resp = asyncio.run(server.api_test_tdx_connectivity(req))
    assert resp["status"] == "success"
    assert resp["ok"] is True
    assert str(resp["tdxdir_used"]).lower() == r"d:\new_tdx"
    assert resp["autodetected"] is True


def test_api_test_tdx_connectivity_no_dir_error(monkeypatch):
    class _DummyCfg:
        def get(self, key, default=None):
            return default

    class _FakeLoader:
        @classmethod
        def reload(cls, config_path="config.json"):
            return _DummyCfg()

    monkeypatch.setattr(server, "ConfigLoader", _FakeLoader)
    monkeypatch.setattr(server, "_detect_tdxdir_candidates", lambda limit=8: [])
    monkeypatch.setattr(server, "_is_valid_tdxdir", lambda p: False)

    req = server.TdxConnectivityTestRequest(tdxdir="", stock_code="600000.SH", auto_detect=True)
    resp = asyncio.run(server.api_test_tdx_connectivity(req))
    assert resp["status"] == "error"
    assert resp["ok"] is False
    assert "未找到可用通达信数据目录" in str(resp.get("msg", ""))
