import uuid
import hmac
import hashlib
import time
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


class TdxTerminalAdapterBase:
    adapter_name = "base"

    def connect(self, connection: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        raise NotImplementedError()

    def disconnect(self) -> Dict[str, Any]:
        raise NotImplementedError()

    def status(self) -> Dict[str, Any]:
        raise NotImplementedError()

    def subscribe_quotes(self, symbols: List[str]) -> Dict[str, Any]:
        raise NotImplementedError()

    def place_order(self, order: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError()

    def list_orders(self, limit: int = 50) -> List[Dict[str, Any]]:
        raise NotImplementedError()

    def list_quotes(self) -> Dict[str, Dict[str, Any]]:
        raise NotImplementedError()

    def broker_login(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError()

    def broker_get_balance(self) -> Dict[str, Any]:
        raise NotImplementedError()

    def broker_get_positions(self) -> List[Dict[str, Any]]:
        raise NotImplementedError()

    def broker_cancel_order(self, order_id: str) -> Dict[str, Any]:
        raise NotImplementedError()


class MockTdxTerminalAdapter(TdxTerminalAdapterBase):
    adapter_name = "mock"

    def __init__(self) -> None:
        self._connected = False
        self._connected_at = ""
        self._conn_payload: Dict[str, Any] = {}
        self._subscribed: List[str] = []
        self._orders: List[Dict[str, Any]] = []
        self._quotes: Dict[str, Dict[str, Any]] = {}

    def connect(self, connection: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self._connected = True
        self._connected_at = _now_iso()
        self._conn_payload = dict(connection or {})
        return self.status()

    def disconnect(self) -> Dict[str, Any]:
        self._connected = False
        return self.status()

    def status(self) -> Dict[str, Any]:
        return {
            "adapter": self.adapter_name,
            "connected": bool(self._connected),
            "connected_at": self._connected_at,
            "subscribed_count": len(self._subscribed),
            "order_count": len(self._orders),
            "connection": dict(self._conn_payload),
        }

    def subscribe_quotes(self, symbols: List[str]) -> Dict[str, Any]:
        uniq: List[str] = []
        seen = set()
        for raw in symbols or []:
            s = str(raw or "").strip().upper()
            if not s or s in seen:
                continue
            seen.add(s)
            uniq.append(s)
        self._subscribed = uniq
        for s in uniq:
            self._quotes[s] = {
                "symbol": s,
                "price": 0.0,
                "dt": _now_iso(),
                "source": "mock",
            }
        return {"symbols": list(self._subscribed), "count": len(self._subscribed)}

    def place_order(self, order: Dict[str, Any]) -> Dict[str, Any]:
        symbol = str(order.get("symbol", "") or "").strip().upper()
        direction = str(order.get("direction", "") or "").strip().upper()
        qty = int(order.get("qty", 0) or 0)
        price = float(order.get("price", 0.0) or 0.0)
        if not symbol:
            raise ValueError("symbol is required")
        if direction not in {"BUY", "SELL"}:
            raise ValueError("direction must be BUY or SELL")
        if qty <= 0:
            raise ValueError("qty must be positive")
        oid = f"MOCK-{uuid.uuid4().hex[:12].upper()}"
        item = {
            "order_id": oid,
            "symbol": symbol,
            "direction": direction,
            "qty": qty,
            "price": price,
            "status": "accepted",
            "adapter": self.adapter_name,
            "created_at": _now_iso(),
        }
        self._orders.append(item)
        return dict(item)

    def list_orders(self, limit: int = 50) -> List[Dict[str, Any]]:
        n = max(1, int(limit or 50))
        rows = self._orders[-n:]
        return [dict(x) for x in rows]

    def list_quotes(self) -> Dict[str, Dict[str, Any]]:
        return {k: dict(v) for k, v in self._quotes.items()}


class PytdxHqAdapter(TdxTerminalAdapterBase):
    adapter_name = "pytdx"

    def __init__(self) -> None:
        self._connected = False
        self._connected_at = ""
        self._conn_payload: Dict[str, Any] = {}
        self._subscribed: List[str] = []
        self._quotes: Dict[str, Dict[str, Any]] = {}
        self._api = None
        self._host = ""
        self._port = 7709
        self._last_error = ""

    def _ensure_api(self):
        if self._api is not None:
            return self._api
        try:
            from pytdx.hq import TdxHq_API  # type: ignore
        except Exception as e:
            raise RuntimeError("pytdx not installed, run: pip install pytdx") from e
        self._api = TdxHq_API(raise_exception=True)
        return self._api

    def _to_tdx_tuple(self, symbol: str):
        s = str(symbol or "").strip().upper()
        if not s:
            raise ValueError("symbol is required")
        if "." in s:
            code, exch = s.split(".", 1)
            exch = exch.strip().upper()
        else:
            code = s
            exch = "SH" if str(code).startswith(("5", "6", "9")) else "SZ"
        market = 1 if exch in {"SH", "XSHG"} else 0
        return market, str(code).strip()

    def _normalize_symbol(self, market: int, code: str) -> str:
        return f"{str(code).strip().upper()}.{'SH' if int(market) == 1 else 'SZ'}"

    def connect(self, connection: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        payload = dict(connection or {})
        host = str(payload.get("host", "") or "").strip() or "127.0.0.1"
        port = int(payload.get("port", 0) or 7709)
        api = self._ensure_api()
        ok = bool(api.connect(host, port))
        if not ok:
            raise RuntimeError(f"pytdx connect failed: host={host} port={port}")
        self._connected = True
        self._connected_at = _now_iso()
        self._conn_payload = payload
        self._host = host
        self._port = port
        self._last_error = ""
        return self.status()

    def disconnect(self) -> Dict[str, Any]:
        try:
            if self._api is not None:
                self._api.disconnect()
        except Exception:
            pass
        self._connected = False
        return self.status()

    def status(self) -> Dict[str, Any]:
        return {
            "adapter": self.adapter_name,
            "connected": bool(self._connected),
            "connected_at": self._connected_at,
            "subscribed_count": len(self._subscribed),
            "order_count": 0,
            "connection": dict(self._conn_payload),
            "host": self._host,
            "port": self._port,
            "last_error": self._last_error,
        }

    def subscribe_quotes(self, symbols: List[str]) -> Dict[str, Any]:
        uniq: List[str] = []
        seen = set()
        for raw in symbols or []:
            s = str(raw or "").strip().upper()
            if not s or s in seen:
                continue
            seen.add(s)
            uniq.append(s)
        self._subscribed = uniq
        self._refresh_quotes()
        return {"symbols": list(self._subscribed), "count": len(self._subscribed)}

    def _refresh_quotes(self) -> None:
        if not self._connected:
            return
        if not self._subscribed:
            self._quotes = {}
            return
        api = self._ensure_api()
        tuples = [self._to_tdx_tuple(s) for s in self._subscribed]
        out: Dict[str, Dict[str, Any]] = {}
        for i in range(0, len(tuples), 80):
            chunk = tuples[i:i + 80]
            rows = api.get_security_quotes(chunk) or []
            for r in rows:
                market = int(r.get("market", 0) or 0)
                code = str(r.get("code", "") or "").strip()
                symbol = self._normalize_symbol(market, code)
                out[symbol] = {
                    "symbol": symbol,
                    "price": float(r.get("price", 0.0) or 0.0),
                    "last_close": float(r.get("last_close", 0.0) or 0.0),
                    "open": float(r.get("open", 0.0) or 0.0),
                    "high": float(r.get("high", 0.0) or 0.0),
                    "low": float(r.get("low", 0.0) or 0.0),
                    "vol": float(r.get("vol", 0.0) or 0.0),
                    "amount": float(r.get("amount", 0.0) or 0.0),
                    "dt": _now_iso(),
                    "source": "pytdx",
                }
        self._quotes = out

    def place_order(self, order: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError("pytdx 行情接口不支持交易下单，请接入券商交易网关")

    def list_orders(self, limit: int = 50) -> List[Dict[str, Any]]:
        return []

    def list_quotes(self) -> Dict[str, Dict[str, Any]]:
        try:
            self._refresh_quotes()
            self._last_error = ""
        except Exception as e:
            self._last_error = str(e)
            if not self._connected:
                raise
        return {k: dict(v) for k, v in self._quotes.items()}


class BrokerGatewayAdapter(TdxTerminalAdapterBase):
    adapter_name = "broker_gateway"

    def __init__(self) -> None:
        self._connected = False
        self._connected_at = ""
        self._conn_payload: Dict[str, Any] = {}
        self._orders: List[Dict[str, Any]] = []
        self._subscribed: List[str] = []
        self._quotes: Dict[str, Dict[str, Any]] = {}
        self._session_token = ""
        self._login_at = ""
        self._balance: Dict[str, Any] = {
            "currency": "CNY",
            "cash_total": 0.0,
            "cash_available": 0.0,
            "frozen_cash": 0.0,
            "net_asset": 0.0,
        }
        self._positions: List[Dict[str, Any]] = []
        self._real_mode = False
        self._base_url = ""
        self._timeout_sec = 10
        self._retry_count = 0
        self._hook_enabled = True
        self._hook_level = "INFO"
        self._hook_logger_name = "TdxBrokerGatewayHook"
        self._hook_log_payload = True

    def connect(self, connection: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self._connected = True
        self._connected_at = _now_iso()
        self._conn_payload = dict(connection or {})
        self._base_url = str(self._conn_payload.get("base_url", "") or "").strip().rstrip("/")
        self._timeout_sec = max(1, int(self._conn_payload.get("timeout_sec", 10) or 10))
        self._retry_count = max(0, int(self._conn_payload.get("retry_count", 0) or 0))
        self._real_mode = bool(self._base_url)
        self._hook_enabled = bool(self._conn_payload.get("hook_enabled", True))
        self._hook_level = str(self._conn_payload.get("hook_level", "INFO") or "INFO").strip().upper() or "INFO"
        self._hook_logger_name = str(
            self._conn_payload.get("hook_logger_name", "TdxBrokerGatewayHook") or "TdxBrokerGatewayHook"
        ).strip() or "TdxBrokerGatewayHook"
        self._hook_log_payload = bool(self._conn_payload.get("hook_log_payload", True))
        return self.status()

    def disconnect(self) -> Dict[str, Any]:
        self._connected = False
        return self.status()

    def status(self) -> Dict[str, Any]:
        return {
            "adapter": self.adapter_name,
            "connected": bool(self._connected),
            "connected_at": self._connected_at,
            "subscribed_count": len(self._subscribed),
            "order_count": len(self._orders),
            "trading_enabled": True,
            "mode": "gateway_http_template" if self._real_mode else "gateway_skeleton",
            "logged_in": bool(self._session_token),
            "login_at": self._login_at,
            "real_mode": bool(self._real_mode),
            "connection": self._masked_connection(),
        }

    def _masked_connection(self) -> Dict[str, Any]:
        return self._sanitize_for_log(self._conn_payload)

    def _sanitize_for_log(self, value: Any) -> Any:
        sensitive_keys = {
            "api_secret",
            "password",
            "signature",
            "authorization",
            "token",
            "session_token",
            "secret",
            "access_token",
            "refresh_token",
        }
        if isinstance(value, dict):
            out: Dict[str, Any] = {}
            for k, v in value.items():
                key = str(k or "")
                if str(key).strip().lower() in sensitive_keys:
                    out[key] = "***"
                else:
                    out[key] = self._sanitize_for_log(v)
            return out
        if isinstance(value, list):
            return [self._sanitize_for_log(x) for x in value]
        if isinstance(value, tuple):
            return tuple(self._sanitize_for_log(x) for x in value)
        return value

    def _require_login(self) -> None:
        if not self._connected:
            raise RuntimeError("broker gateway not connected")
        if not self._session_token:
            raise RuntimeError("broker gateway not logged in")

    def _sign_payload(self, payload: Dict[str, Any], secret: str, sign_method: str) -> str:
        body = "&".join([f"{k}={payload[k]}" for k in sorted(payload.keys())])
        method = str(sign_method or "").strip().lower()
        if method == "hmac_sha256":
            return hmac.new(
                str(secret or "").encode("utf-8"),
                body.encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()
        if method in {"none", ""}:
            return ""
        raise ValueError(f"unsupported sign method: {sign_method}")

    def _build_auth_meta(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        api_key = str(self._conn_payload.get("api_key", "") or "").strip()
        api_secret = str(self._conn_payload.get("api_secret", "") or "").strip()
        sign_method = str(self._conn_payload.get("sign_method", "none") or "none").strip().lower()
        signature = ""
        if api_secret:
            signature = self._sign_payload(payload, api_secret, sign_method)
        return {
            "api_key": api_key,
            "sign_method": sign_method,
            "signature": signature,
        }

    def _emit_hook(self, event_name: str, payload: Dict[str, Any]) -> None:
        if not bool(self._hook_enabled):
            return
        logger = logging.getLogger(self._hook_logger_name)
        level = getattr(logging, str(self._hook_level or "INFO").upper(), logging.INFO)
        log_payload = {
            "event": str(event_name or ""),
            "adapter": self.adapter_name,
            "connected": bool(self._connected),
            "at": _now_iso(),
        }
        if bool(self._hook_log_payload):
            log_payload["payload"] = self._sanitize_for_log(payload if isinstance(payload, dict) else {})
        logger.log(level, json.dumps(log_payload, ensure_ascii=False))

    def _http_request(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if not self._real_mode:
            raise RuntimeError("broker gateway real mode disabled: base_url is empty")
        try:
            import requests  # type: ignore
        except Exception as e:
            raise RuntimeError("requests not installed") from e

        body = dict(payload or {})
        url = f"{self._base_url}{path}"
        auth_meta = self._build_auth_meta(body)
        headers = {"Content-Type": "application/json"}
        if auth_meta.get("api_key"):
            headers["X-Api-Key"] = str(auth_meta.get("api_key"))
        if auth_meta.get("signature"):
            headers["X-Signature"] = str(auth_meta.get("signature"))
        if auth_meta.get("sign_method"):
            headers["X-Sign-Method"] = str(auth_meta.get("sign_method"))
        if self._session_token:
            headers["Authorization"] = f"Bearer {self._session_token}"

        self._emit_hook("broker_http_request", {"method": method, "url": url, "payload": body, "auth_meta": auth_meta})

        attempts = int(self._retry_count) + 1
        last_err = ""
        for i in range(attempts):
            try:
                resp = requests.request(
                    method=method.upper(),
                    url=url,
                    json=body if body else None,
                    headers=headers,
                    timeout=float(self._timeout_sec),
                )
                data = resp.json() if hasattr(resp, "json") else {}
                if int(resp.status_code) >= 400:
                    msg = str(data.get("msg", "") or data.get("message", "") or f"http status {resp.status_code}")
                    raise RuntimeError(self._map_gateway_error(int(resp.status_code), msg))
                if isinstance(data, dict) and str(data.get("status", "")).strip().lower() in {"error", "failed"}:
                    msg = str(data.get("msg", "") or data.get("message", "") or "broker gateway error")
                    raise RuntimeError(self._map_gateway_error(int(data.get("code", 400) or 400), msg))
                return data if isinstance(data, dict) else {}
            except Exception as e:
                last_err = str(e)
                if i >= attempts - 1:
                    break
                time.sleep(0.2)
        raise RuntimeError(last_err or "broker gateway request failed")

    def _map_gateway_error(self, code: int, msg: str) -> str:
        c = int(code or 0)
        text = str(msg or "").strip()
        if c in {401, 403}:
            return f"BROKER_AUTH_FAILED: {text}"
        if c in {408, 504}:
            return f"BROKER_TIMEOUT: {text}"
        if c in {429}:
            return f"BROKER_RATE_LIMIT: {text}"
        if c >= 500:
            return f"BROKER_REMOTE_5XX: {text}"
        return f"BROKER_REQUEST_FAILED: {text}"

    def subscribe_quotes(self, symbols: List[str]) -> Dict[str, Any]:
        uniq: List[str] = []
        seen = set()
        for raw in symbols or []:
            s = str(raw or "").strip().upper()
            if not s or s in seen:
                continue
            seen.add(s)
            uniq.append(s)
        self._subscribed = uniq
        if self._real_mode and uniq:
            data = self._http_request("POST", "/quotes/subscribe", {"symbols": uniq})
            if isinstance(data.get("quotes"), dict):
                self._quotes = {str(k): dict(v) for k, v in data.get("quotes", {}).items()}
                return {"symbols": list(self._subscribed), "count": len(self._subscribed)}
        for s in uniq:
            self._quotes[s] = {
                "symbol": s,
                "price": 0.0,
                "dt": _now_iso(),
                "source": "broker_gateway_skeleton",
            }
        return {"symbols": list(self._subscribed), "count": len(self._subscribed)}

    def place_order(self, order: Dict[str, Any]) -> Dict[str, Any]:
        self._require_login()
        symbol = str(order.get("symbol", "") or "").strip().upper()
        direction = str(order.get("direction", "") or "").strip().upper()
        qty = int(order.get("qty", 0) or 0)
        price = float(order.get("price", 0.0) or 0.0)
        if not symbol:
            raise ValueError("symbol is required")
        if direction not in {"BUY", "SELL"}:
            raise ValueError("direction must be BUY or SELL")
        if qty <= 0:
            raise ValueError("qty must be positive")
        if self._real_mode:
            data = self._http_request(
                "POST",
                "/orders",
                {
                    "symbol": symbol,
                    "direction": direction,
                    "qty": qty,
                    "price": price,
                },
            )
            item = dict(data.get("order", {})) if isinstance(data.get("order"), dict) else {}
            if not item:
                item = {
                    "order_id": str(data.get("order_id", "") or ""),
                    "symbol": symbol,
                    "direction": direction,
                    "qty": qty,
                    "price": price,
                    "status": str(data.get("status", "submitted") or "submitted"),
                }
            item["adapter"] = self.adapter_name
            item["created_at"] = str(item.get("created_at", "") or _now_iso())
            item["auth_meta"] = self._build_auth_meta(
                {"symbol": symbol, "direction": direction, "qty": qty, "price": price}
            )
            self._orders.append(dict(item))
            return dict(item)
        oid = f"BGW-{uuid.uuid4().hex[:12].upper()}"
        item = {
            "order_id": oid,
            "symbol": symbol,
            "direction": direction,
            "qty": qty,
            "price": price,
            "status": "submitted",
            "adapter": self.adapter_name,
            "created_at": _now_iso(),
            "auth_meta": self._build_auth_meta(
                {
                    "symbol": symbol,
                    "direction": direction,
                    "qty": qty,
                    "price": price,
                }
            ),
        }
        self._orders.append(item)
        return dict(item)

    def list_orders(self, limit: int = 50) -> List[Dict[str, Any]]:
        if self._real_mode:
            data = self._http_request("GET", f"/orders?limit={max(1, int(limit or 50))}", {})
            rows = data.get("orders", []) if isinstance(data, dict) else []
            if isinstance(rows, list):
                return [dict(x) for x in rows if isinstance(x, dict)]
        n = max(1, int(limit or 50))
        rows = self._orders[-n:]
        return [dict(x) for x in rows]

    def list_quotes(self) -> Dict[str, Dict[str, Any]]:
        if self._real_mode and self._subscribed:
            data = self._http_request("POST", "/quotes/snapshot", {"symbols": list(self._subscribed)})
            rows = data.get("quotes", {}) if isinstance(data, dict) else {}
            if isinstance(rows, dict):
                self._quotes = {str(k): dict(v) for k, v in rows.items() if isinstance(v, dict)}
        return {k: dict(v) for k, v in self._quotes.items()}

    def broker_login(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        if not self._connected:
            raise RuntimeError("broker gateway not connected")
        username = str(credentials.get("username", "") or "").strip()
        password = str(credentials.get("password", "") or "").strip()
        if not username or not password:
            raise ValueError("username and password are required")
        if self._real_mode:
            data = self._http_request(
                "POST",
                "/auth/login",
                {
                    "username": username,
                    "password": password,
                },
            )
            token = str(data.get("session_token", "") or data.get("token", "") or "").strip()
            if not token:
                raise RuntimeError("BROKER_AUTH_FAILED: missing session token")
            self._session_token = token
            self._login_at = _now_iso()
            return {
                "session_token": self._session_token,
                "login_at": self._login_at,
                "expires_in": int(data.get("expires_in", 3600) or 3600),
                "auth_meta": self._build_auth_meta({"username": username, "login_at": self._login_at}),
            }
        self._session_token = f"BGW-TOKEN-{uuid.uuid4().hex[:16].upper()}"
        self._login_at = _now_iso()
        init_cash = float(credentials.get("initial_cash", 1000000.0) or 1000000.0)
        self._balance = {
            "currency": "CNY",
            "cash_total": init_cash,
            "cash_available": init_cash,
            "frozen_cash": 0.0,
            "net_asset": init_cash,
        }
        self._positions = []
        meta = self._build_auth_meta({"username": username, "login_at": self._login_at})
        return {
            "session_token": self._session_token,
            "login_at": self._login_at,
            "expires_in": 3600,
            "auth_meta": meta,
        }

    def broker_get_balance(self) -> Dict[str, Any]:
        self._require_login()
        if self._real_mode:
            data = self._http_request("GET", "/accounts/balance", {})
            if isinstance(data.get("balance"), dict):
                return dict(data.get("balance", {}))
            return dict(data)
        return dict(self._balance)

    def broker_get_positions(self) -> List[Dict[str, Any]]:
        self._require_login()
        if self._real_mode:
            data = self._http_request("GET", "/accounts/positions", {})
            rows = data.get("positions", []) if isinstance(data, dict) else []
            if isinstance(rows, list):
                return [dict(x) for x in rows if isinstance(x, dict)]
        return [dict(x) for x in self._positions]

    def broker_cancel_order(self, order_id: str) -> Dict[str, Any]:
        self._require_login()
        oid = str(order_id or "").strip()
        if not oid:
            raise ValueError("order_id is required")
        if self._real_mode:
            data = self._http_request("POST", f"/orders/{oid}/cancel", {"order_id": oid})
            if isinstance(data.get("cancel_result"), dict):
                return dict(data.get("cancel_result", {}))
            return {"order_id": oid, "status": str(data.get("status", "cancelled") or "cancelled")}
        for row in self._orders:
            if str(row.get("order_id", "")).strip() != oid:
                continue
            status = str(row.get("status", "")).strip().lower()
            if status in {"filled", "cancelled", "rejected"}:
                return {"order_id": oid, "status": str(row.get("status", ""))}
            row["status"] = "cancelled"
            row["cancelled_at"] = _now_iso()
            return {"order_id": oid, "status": "cancelled"}
        return {"order_id": oid, "status": "not_found"}


class TdxTerminalBridge:
    def __init__(self, adapter_type: str = "mock") -> None:
        self.adapter_type = str(adapter_type or "mock").strip().lower() or "mock"
        self.adapter = self._build_adapter(self.adapter_type)

    def _build_adapter(self, adapter_type: str) -> TdxTerminalAdapterBase:
        if adapter_type == "mock":
            return MockTdxTerminalAdapter()
        if adapter_type == "pytdx":
            return PytdxHqAdapter()
        if adapter_type in {"broker_gateway", "broker_mock"}:
            return BrokerGatewayAdapter()
        raise ValueError(f"unsupported tdx terminal adapter: {adapter_type}")

    def status(self) -> Dict[str, Any]:
        return self.adapter.status()

    def connect(self, connection: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self.adapter.connect(connection=connection)

    def disconnect(self) -> Dict[str, Any]:
        return self.adapter.disconnect()

    def subscribe_quotes(self, symbols: List[str]) -> Dict[str, Any]:
        return self.adapter.subscribe_quotes(symbols=symbols)

    def place_order(self, order: Dict[str, Any]) -> Dict[str, Any]:
        return self.adapter.place_order(order=order)

    def list_orders(self, limit: int = 50) -> List[Dict[str, Any]]:
        return self.adapter.list_orders(limit=limit)

    def list_quotes(self) -> Dict[str, Dict[str, Any]]:
        return self.adapter.list_quotes()

    def broker_login(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        return self.adapter.broker_login(credentials=credentials)

    def broker_get_balance(self) -> Dict[str, Any]:
        return self.adapter.broker_get_balance()

    def broker_get_positions(self) -> List[Dict[str, Any]]:
        return self.adapter.broker_get_positions()

    def broker_cancel_order(self, order_id: str) -> Dict[str, Any]:
        return self.adapter.broker_cancel_order(order_id=order_id)
