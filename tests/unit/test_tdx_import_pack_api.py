import asyncio

import server


def test_api_tdx_import_pack_partial_success(monkeypatch):
    calls = []

    def _fake_import(req_like, skip_existing=False):
        calls.append(str(getattr(req_like, "strategy_id", "") or ""))
        sid = str(getattr(req_like, "strategy_id", "") or "").strip()
        if sid == "BAD":
            raise ValueError("mock failure")
        return {
            "status": "success",
            "strategy_id": sid or "AUTO",
            "strategy_name": "ok",
            "class_name": "C1",
            "kline_type": "1min",
            "warmup_bars": 60,
            "used_functions": ["MA"],
            "compile_meta": {"unsupported_functions": []},
        }

    monkeypatch.setattr(server, "_import_single_tdx_formula", _fake_import)
    req = server.TdxImportPackRequest(
        items=[
            server.TdxImportPackItem(formula_text="MA(C,5)", strategy_id="A1"),
            server.TdxImportPackItem(formula_text="MA(C,5)", strategy_id="BAD"),
            server.TdxImportPackItem(formula_text="MA(C,5)", strategy_id="A2"),
        ],
        stop_on_error=False,
        skip_existing=True,
    )
    resp = asyncio.run(server.api_tdx_import_pack(req))
    assert resp["status"] == "partial_success"
    assert resp["imported_count"] == 2
    assert resp["failed_count"] == 1
    assert len(resp["failures"]) == 1
    assert calls == ["A1", "BAD", "A2"]


def test_api_tdx_import_pack_stop_on_error(monkeypatch):
    calls = []

    def _fake_import(req_like, skip_existing=False):
        calls.append(str(getattr(req_like, "strategy_id", "") or ""))
        sid = str(getattr(req_like, "strategy_id", "") or "").strip()
        if sid == "BAD":
            raise ValueError("mock failure")
        return {"status": "success", "strategy_id": sid}

    monkeypatch.setattr(server, "_import_single_tdx_formula", _fake_import)
    req = server.TdxImportPackRequest(
        items=[
            server.TdxImportPackItem(formula_text="MA(C,5)", strategy_id="A1"),
            server.TdxImportPackItem(formula_text="MA(C,5)", strategy_id="BAD"),
            server.TdxImportPackItem(formula_text="MA(C,5)", strategy_id="A2"),
        ],
        stop_on_error=True,
        skip_existing=True,
    )
    resp = asyncio.run(server.api_tdx_import_pack(req))
    assert resp["status"] == "partial_success"
    assert resp["imported_count"] == 1
    assert resp["failed_count"] == 1
    assert calls == ["A1", "BAD"]


def test_api_tdx_compile_error_contract_for_missing_formula():
    req = server.TdxCompileRequest(formula_text="", strategy_id="X1")
    resp = asyncio.run(server.api_tdx_compile(req))
    assert resp["status"] == "error"
    assert resp["msg"] == "formula_text is required"
    assert resp["error_code"] == "TDX_FORMULA_REQUIRED"
    assert isinstance(resp.get("details"), dict)


def test_api_tdx_import_pack_error_contract_for_empty_items():
    req = server.TdxImportPackRequest(items=[], stop_on_error=False, skip_existing=True)
    resp = asyncio.run(server.api_tdx_import_pack(req))
    assert resp["status"] == "error"
    assert resp["msg"] == "items is required"
    assert resp["error_code"] == "TDX_ITEMS_REQUIRED"
    assert isinstance(resp.get("details"), dict)


def test_api_tdx_validate_formula_success_with_compile_meta():
    req = server.TdxValidateRequest(
        formula_text="MA5:=MA(C,5); MA10:=MA(C,10); CROSS(MA5,MA10)",
        strategy_id="TV1",
        strategy_name="validate",
        strict=True,
        include_code=False,
    )
    resp = asyncio.run(server.api_tdx_validate_formula(req))
    assert resp["status"] == "success"
    assert resp["valid"] is True
    assert "compile_meta" in resp
    assert resp["compile_meta"]["unsupported_functions"] == []
    assert "code" not in resp


def test_api_tdx_validate_formula_error_contract():
    req = server.TdxValidateRequest(formula_text="", strategy_id="TV2")
    resp = asyncio.run(server.api_tdx_validate_formula(req))
    assert resp["status"] == "error"
    assert resp["error_code"] == "TDX_FORMULA_REQUIRED"
    assert isinstance(resp.get("details"), dict)
