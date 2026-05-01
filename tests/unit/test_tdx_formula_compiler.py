import pytest

from src.tdx.formula_compiler import compile_tdx_formula, get_tdx_compile_capabilities


def test_compile_tdx_formula_generates_strategy_code():
    formula = """
    MA5:=MA(C,5);
    MA10:=MA(C,10);
    CROSS(MA5,MA10)
    """
    payload = compile_tdx_formula(
        formula_text=formula,
        strategy_id="T001",
        strategy_name="TDX_MA_CROSS",
        kline_type="1min",
    )
    code_text = str(payload.get("code", ""))
    assert payload["strategy_id"] == "T001"
    assert payload["class_name"].startswith("GeneratedTdx")
    assert payload["warmup_bars"] >= 60
    assert "Indicators.ma" in code_text
    assert "self._CROSS" in code_text
    assert "class " in code_text


def test_compile_tdx_formula_supports_if_and_ref():
    formula = """
    X:=REF(C,1);
    Y:=IF(C>X,1,0);
    Y=1
    """
    payload = compile_tdx_formula(
        formula_text=formula,
        strategy_id="T002",
        strategy_name="TDX_IF_REF",
        kline_type="D",
    )
    code_text = str(payload.get("code", ""))
    assert "self._REF" in code_text
    assert "self._IF" in code_text
    assert payload["used_functions"]


def test_compile_tdx_formula_rejects_unsupported_functions_in_strict_mode():
    formula = """
    MA5:=MA(C,5);
    Z:=FOO(C,10);
    Z>0
    """
    with pytest.raises(ValueError, match="unsupported tdx functions: FOO"):
        compile_tdx_formula(
            formula_text=formula,
            strategy_id="T003",
            strategy_name="TDX_UNSUPPORTED",
            kline_type="1min",
            strict=True,
        )


def test_tdx_compile_capabilities_contains_core_contract():
    caps = get_tdx_compile_capabilities()
    assert "supported_functions" in caps
    assert "series_alias" in caps
    assert "operators" in caps
    assert "CROSS" in caps["supported_functions"]
    assert "EXIST" in caps["supported_functions"]
    assert "FILTER" in caps["supported_functions"]
    assert "BARSSINCE" in caps["supported_functions"]
    assert caps["series_alias"].get("C") == "close"


def test_compile_tdx_formula_supports_extended_tdx_functions():
    formula = """
    A:=EXIST(C>O,5);
    B:=EVERY(C>=L,3);
    C1:=BETWEEN(C,L,H);
    C2:=VALUEWHEN(C>O,C);
    FILTER(A AND B AND C1 AND (C2>0),2)
    """
    payload = compile_tdx_formula(
        formula_text=formula,
        strategy_id="T004",
        strategy_name="TDX_EXTENDED",
        kline_type="1min",
    )
    code_text = str(payload.get("code", ""))
    assert "self._EXIST" in code_text
    assert "self._EVERY" in code_text
    assert "self._BETWEEN" in code_text
    assert "self._VALUEWHEN" in code_text
    assert "self._FILTER" in code_text
    unsupported = payload.get("compile_meta", {}).get("unsupported_functions", [])
    assert unsupported == []


def test_compile_tdx_formula_supports_barscount_family():
    formula = """
    A:=BARSSINCE(C>O);
    B:=BARSCOUNT(C);
    C1:=HHVBARS(H,10);
    C2:=LLVBARS(L,10);
    (A>=0) AND (B>0) AND (C1>=0) AND (C2>=0)
    """
    payload = compile_tdx_formula(
        formula_text=formula,
        strategy_id="T005",
        strategy_name="TDX_BARS_FAMILY",
        kline_type="1min",
    )
    code_text = str(payload.get("code", ""))
    assert "self._BARSSINCE" in code_text
    assert "self._BARSCOUNT" in code_text
    assert "self._HHVBARS" in code_text
    assert "self._LLVBARS" in code_text
    unsupported = payload.get("compile_meta", {}).get("unsupported_functions", [])
    assert unsupported == []
