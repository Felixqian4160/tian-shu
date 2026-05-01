import re
from typing import Any, Dict, List


_FUNC_MAP = {
    "MA": "Indicators.ma",
    "EMA": "Indicators.ema",
    "SMA": "Indicators.sma",
    "WMA": "self._WMA",
    "HHV": "Indicators.hhv",
    "LLV": "Indicators.llv",
    "SUM": "self._SUM",
    "REF": "self._REF",
    "COUNT": "self._COUNT",
    "STD": "self._STD",
    "CROSS": "self._CROSS",
    "IF": "self._IF",
    "BARSLAST": "self._BARSLAST",
    "EXIST": "self._EXIST",
    "EVERY": "self._EVERY",
    "BETWEEN": "self._BETWEEN",
    "VALUEWHEN": "self._VALUEWHEN",
    "FILTER": "self._FILTER",
    "BARSSINCE": "self._BARSSINCE",
    "BARSCOUNT": "self._BARSCOUNT",
    "HHVBARS": "self._HHVBARS",
    "LLVBARS": "self._LLVBARS",
    "UP": "self._UP",
    "DOWN": "self._DOWN",
    "ABS": "np.abs",
    "MAX": "np.maximum",
    "MIN": "np.minimum",
}

_SERIES_ALIAS = {
    "C": "close",
    "O": "open_",
    "H": "high",
    "L": "low",
    "V": "vol",
    "VOL": "vol",
    "AMOUNT": "amount",
}


def get_tdx_compile_capabilities() -> Dict[str, Any]:
    return {
        "supported_functions": sorted(list(_FUNC_MAP.keys())),
        "series_alias": dict(_SERIES_ALIAS),
        "operators": ["=", "<>", "AND", "OR", "NOT"],
        "statement_separators": [";", "\\n"],
    }


def _sanitize_identifier(name: str, fallback: str = "x") -> str:
    raw = str(name or "").strip()
    if not raw:
        raw = fallback
    out = re.sub(r"[^A-Za-z0-9_]", "_", raw)
    if not out:
        out = fallback
    if out[0].isdigit():
        out = f"v_{out}"
    return out.lower()


def _replace_functions(expr: str) -> str:
    out = str(expr or "")
    for fn, target in _FUNC_MAP.items():
        out = re.sub(rf"\b{fn}\s*\(", f"{target}(", out, flags=re.IGNORECASE)
    return out


def _replace_operators(expr: str) -> str:
    out = str(expr or "")
    out = out.replace("<>", "!=")
    out = re.sub(r"\bAND\b", "&", out, flags=re.IGNORECASE)
    out = re.sub(r"\bOR\b", "|", out, flags=re.IGNORECASE)
    out = re.sub(r"\bNOT\b", "~", out, flags=re.IGNORECASE)
    out = re.sub(r"(?<![<>=!])=(?!=)", "==", out)
    return out


def _replace_tokens(expr: str, var_map: Dict[str, str]) -> str:
    token_pattern = re.compile(r"\b[A-Za-z_][A-Za-z0-9_]*\b")
    keep_words = {
        "self",
        "Indicators",
        "np",
        "pd",
        "True",
        "False",
    }

    def _swap(match: re.Match) -> str:
        tok = match.group(0)
        if tok in keep_words:
            return tok
        up = tok.upper()
        if up in _SERIES_ALIAS:
            return _SERIES_ALIAS[up]
        if up in var_map:
            return var_map[up]
        return tok

    return token_pattern.sub(_swap, expr)


def _translate_expr(expr: str, var_map: Dict[str, str]) -> str:
    out = _replace_functions(expr)
    out = _replace_operators(out)
    out = _replace_tokens(out, var_map)
    return out


def _split_statements(formula_text: str) -> List[str]:
    text = str(formula_text or "").replace("\r", "\n")
    text = re.sub(r"\{[^}]*\}", "", text)
    chunks = []
    for piece in re.split(r"[;\n]+", text):
        item = str(piece or "").strip()
        if item:
            chunks.append(item)
    return chunks


def _estimate_warmup_bars(formula_text: str) -> int:
    nums = re.findall(
        r"\b(?:MA|EMA|SMA|WMA|HHV|LLV|SUM|COUNT|STD|REF|EXIST|EVERY|FILTER|HHVBARS|LLVBARS)\s*\([^,\)]*,\s*(\d+)\s*\)",
        str(formula_text or ""),
        flags=re.IGNORECASE,
    )
    windows = [int(x) for x in nums if str(x).isdigit()]
    base = max(windows) if windows else 30
    return max(60, min(base * 3, 2000))


def _detect_called_functions(formula_text: str) -> List[str]:
    chunks = _split_statements(formula_text)
    found = []
    seen = set()
    ignore_tokens = {"AND", "OR", "NOT"}
    for st in chunks:
        for m in re.finditer(r"\b([A-Za-z_][A-Za-z0-9_]*)\s*\(", st):
            fn = str(m.group(1) or "").strip().upper()
            if (not fn) or (fn in ignore_tokens) or (fn in seen):
                continue
            seen.add(fn)
            found.append(fn)
    return found


def _used_functions(formula_text: str) -> List[str]:
    called = _detect_called_functions(formula_text)
    return [fn for fn in called if fn in _FUNC_MAP]


def _compile_meta(formula_text: str) -> Dict[str, Any]:
    called = _detect_called_functions(formula_text)
    supported = sorted(list(_FUNC_MAP.keys()))
    unsupported = [fn for fn in called if fn not in _FUNC_MAP]
    return {
        "called_functions": called,
        "supported_functions": supported,
        "unsupported_functions": unsupported,
    }


def _build_strategy_code(
    strategy_id: str,
    strategy_name: str,
    class_name: str,
    py_lines: List[str],
    final_signal_var: str,
    warmup_bars: int,
    kline_type: str,
) -> str:
    body = "\n        ".join(py_lines) if py_lines else "pass"
    return f"""from src.strategies.implemented_strategies import BaseImplementedStrategy
from src.utils.indicators import Indicators
import pandas as pd
import numpy as np


class {class_name}(BaseImplementedStrategy):
    def __init__(self):
        super().__init__(\"{strategy_id}\", \"{strategy_name}\", trigger_timeframe=\"{kline_type}\")
        self.history = {{}}
        self.last_buy_day = {{}}

    def _REF(self, series, n):
        return pd.Series(series).shift(int(n))

    def _SUM(self, series, n):
        return pd.Series(series).rolling(int(n)).sum()

    def _STD(self, series, n):
        return pd.Series(series).rolling(int(n)).std()

    def _COUNT(self, cond, n):
        return pd.Series(cond).fillna(False).astype(int).rolling(int(n)).sum()

    def _IF(self, cond, a, b):
        return pd.Series(np.where(pd.Series(cond).fillna(False), a, b))

    def _CROSS(self, a, b):
        sa = pd.Series(a)
        sb = pd.Series(b)
        return (sa > sb) & (sa.shift(1) <= sb.shift(1))

    def _UP(self, a, n=1):
        sa = pd.Series(a)
        return sa > sa.shift(int(n))

    def _DOWN(self, a, n=1):
        sa = pd.Series(a)
        return sa < sa.shift(int(n))

    def _WMA(self, series, n):
        s = pd.Series(series)
        w = int(n)
        if w <= 1:
            return s
        weights = np.arange(1, w + 1)
        return s.rolling(w).apply(lambda x: np.dot(x, weights) / weights.sum(), raw=True)

    def _BARSLAST(self, cond):
        c = pd.Series(cond).fillna(False).astype(bool)
        out = np.zeros(len(c), dtype=float)
        last_true = -1
        for i, v in enumerate(c.tolist()):
            if v:
                last_true = i
                out[i] = 0.0
            else:
                out[i] = np.nan if last_true < 0 else float(i - last_true)
        return pd.Series(out, index=c.index)

    def _EXIST(self, cond, n):
        c = pd.Series(cond).fillna(False).astype(int)
        return c.rolling(int(n)).max().fillna(0).astype(int) > 0

    def _EVERY(self, cond, n):
        c = pd.Series(cond).fillna(False).astype(int)
        return c.rolling(int(n)).min().fillna(0).astype(int) > 0

    def _BETWEEN(self, x, a, b):
        sx = pd.Series(x)
        sa = pd.Series(a)
        sb = pd.Series(b)
        return (sx >= sa) & (sx <= sb)

    def _VALUEWHEN(self, cond, x):
        c = pd.Series(cond).fillna(False).astype(bool)
        sx = pd.Series(x)
        out = sx.where(c)
        return out.ffill()

    def _FILTER(self, cond, n):
        c = pd.Series(cond).fillna(False).astype(bool)
        span = max(0, int(n))
        out = np.zeros(len(c), dtype=bool)
        cooldown = 0
        for i, v in enumerate(c.tolist()):
            if cooldown > 0:
                cooldown -= 1
                continue
            if bool(v):
                out[i] = True
                cooldown = span
        return pd.Series(out, index=c.index)

    def _BARSSINCE(self, cond):
        c = pd.Series(cond).fillna(False).astype(bool)
        out = np.full(len(c), np.nan, dtype=float)
        first_true = -1
        for i, v in enumerate(c.tolist()):
            if first_true < 0 and bool(v):
                first_true = i
            if first_true >= 0:
                out[i] = float(i - first_true)
        return pd.Series(out, index=c.index)

    def _BARSCOUNT(self, series):
        s = pd.Series(series)
        return pd.Series(np.arange(1, len(s) + 1), index=s.index, dtype=float)

    def _HHVBARS(self, series, n):
        s = pd.Series(series)
        w = max(1, int(n))
        out = np.full(len(s), np.nan, dtype=float)
        vals = s.to_numpy()
        for i in range(len(vals)):
            start = max(0, i - w + 1)
            win = vals[start:i + 1]
            if len(win) <= 0:
                continue
            if np.all(np.isnan(win)):
                continue
            local_idx = int(np.nanargmax(win))
            out[i] = float(i - (start + local_idx))
        return pd.Series(out, index=s.index)

    def _LLVBARS(self, series, n):
        s = pd.Series(series)
        w = max(1, int(n))
        out = np.full(len(s), np.nan, dtype=float)
        vals = s.to_numpy()
        for i in range(len(vals)):
            start = max(0, i - w + 1)
            win = vals[start:i + 1]
            if len(win) <= 0:
                continue
            if np.all(np.isnan(win)):
                continue
            local_idx = int(np.nanargmin(win))
            out[i] = float(i - (start + local_idx))
        return pd.Series(out, index=s.index)

    def on_bar(self, kline):
        code = str(kline.get("code", "") or "")
        if not code:
            return None
        if code not in self.history:
            self.history[code] = pd.DataFrame()
        self.history[code] = pd.concat([self.history[code], pd.DataFrame([kline])], ignore_index=True).tail(4000)
        df = self.history[code]
        if len(df) < {int(warmup_bars)}:
            return None

        close = pd.to_numeric(df.get("close", pd.Series(dtype=float)), errors="coerce")
        open_ = pd.to_numeric(df.get("open", pd.Series(dtype=float)), errors="coerce")
        high = pd.to_numeric(df.get("high", pd.Series(dtype=float)), errors="coerce")
        low = pd.to_numeric(df.get("low", pd.Series(dtype=float)), errors="coerce")
        vol = pd.to_numeric(df.get("vol", pd.Series(dtype=float)), errors="coerce")
        amount = pd.to_numeric(df.get("amount", pd.Series(dtype=float)), errors="coerce")

        {body}
        signal_series = pd.Series({final_signal_var}).fillna(False).astype(bool)
        if signal_series.empty:
            return None
        signal_now = bool(signal_series.iloc[-1])
        qty = int(self.positions.get(code, 0))

        if qty <= 0 and signal_now:
            buy_qty = int(self._qty())
            if buy_qty <= 0:
                return None
            self.last_buy_day[code] = str(kline.get("dt", ""))[:10]
            return {{
                "strategy_id": self.id,
                "code": code,
                "dt": kline.get("dt"),
                "direction": "BUY",
                "price": float(kline.get("close", 0.0) or 0.0),
                "qty": buy_qty
            }}

        if qty > 0 and (not signal_now):
            buy_day = str(self.last_buy_day.get(code, ""))
            cur_day = str(kline.get("dt", ""))[:10]
            if buy_day and cur_day == buy_day:
                return None
            return {{
                "strategy_id": self.id,
                "code": code,
                "dt": kline.get("dt"),
                "direction": "SELL",
                "price": float(kline.get("close", 0.0) or 0.0),
                "qty": qty
            }}
        return None
"""


def compile_tdx_formula(
    formula_text: str,
    strategy_id: str,
    strategy_name: str,
    kline_type: str = "1min",
    strict: bool = True,
) -> Dict[str, Any]:
    statements = _split_statements(formula_text)
    if not statements:
        raise ValueError("formula_text is empty")
    meta = _compile_meta(formula_text)
    unsupported = list(meta.get("unsupported_functions", []))
    if strict and unsupported:
        raise ValueError(f"unsupported tdx functions: {', '.join(unsupported)}")

    sid = str(strategy_id or "").strip() or "TDX001"
    sname = str(strategy_name or "").strip() or f"通达信策略{sid}"
    var_map: Dict[str, str] = {}
    py_lines: List[str] = []
    final_signal_var = ""
    expr_index = 0

    for st in statements:
        m = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:?=\s*(.+)$", st)
        if m:
            raw_name = m.group(1)
            raw_expr = m.group(2)
            py_name = _sanitize_identifier(raw_name, fallback=f"v{len(var_map) + 1}")
            var_map[raw_name.upper()] = py_name
            py_expr = _translate_expr(raw_expr, var_map)
            py_lines.append(f"{py_name} = {py_expr}")
            final_signal_var = py_name
            continue
        expr_index += 1
        expr_name = f"expr_{expr_index}"
        py_expr = _translate_expr(st, var_map)
        py_lines.append(f"{expr_name} = {py_expr}")
        final_signal_var = expr_name

    if not final_signal_var:
        raise ValueError("no valid statement found in formula_text")

    class_name = f"GeneratedTdx{_sanitize_identifier(sid, fallback='strategy').title().replace('_', '')}"
    warmup_bars = _estimate_warmup_bars(formula_text)
    code_text = _build_strategy_code(
        strategy_id=sid,
        strategy_name=sname,
        class_name=class_name,
        py_lines=py_lines,
        final_signal_var=final_signal_var,
        warmup_bars=warmup_bars,
        kline_type=str(kline_type or "1min").strip() or "1min",
    )
    return {
        "strategy_id": sid,
        "strategy_name": sname,
        "class_name": class_name,
        "code": code_text,
        "warmup_bars": warmup_bars,
        "used_functions": _used_functions(formula_text),
        "compile_meta": {
            **meta,
            "strict": bool(strict),
        },
        "last_signal_var": final_signal_var,
    }
