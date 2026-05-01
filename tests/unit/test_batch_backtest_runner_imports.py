import json

from scripts.batch_backtest_runner import (
    结果列定义,
    结果英文别名,
    写入CSV,
    追加CSV,
    build_parser,
    导入BLK到标的池,
    导入公式包到策略池,
    按策略汇总,
    渲染提示词模板,
    生成批量分析载荷,
    读取CSV,
    写入任务明细文件,
    标的池列定义,
    标的池英文别名,
    策略池列定义,
    策略池英文别名,
)


def test_blk_import_to_stock_pool(tmp_path):
    blk = tmp_path / "a.blk"
    blk.write_text("600000 测试\n000001|平安\n", encoding="gbk")
    stock_pool = tmp_path / "stocks.csv"
    total, added, updated = 导入BLK到标的池(
        标的池路径=stock_pool,
        blk_path=blk,
        blk_encoding="auto",
        导入模式="append",
        market_tag="主板",
        industry_tag="导入",
        size_tag="未知",
        enabled="1",
    )
    rows = 读取CSV(stock_pool, 标的池列定义, 标的池英文别名)
    assert total == 2
    assert added == 2
    assert updated == 0
    assert {x["stock_code"] for x in rows} == {"600000.SH", "000001.SZ"}


def test_formula_pack_import_to_strategy_pool(tmp_path):
    pack = tmp_path / "pack.json"
    pack.write_text(json.dumps(["S1", {"strategy_id": "S2"}, "S1"], ensure_ascii=False), encoding="utf-8")
    strategy_pool = tmp_path / "strategies.csv"
    total, added, updated = 导入公式包到策略池(
        策略池路径=strategy_pool,
        公式包路径=pack,
        导入模式="append",
        enabled="1",
    )
    rows = 读取CSV(strategy_pool, 策略池列定义, 策略池英文别名)
    assert total == 2
    assert added == 2
    assert updated == 0
    assert {x["strategy_id"] for x in rows} == {"S1", "S2"}


def test_batch_ai_payload_and_prompt_render():
    results_rows = [
        {
            "task_id": "T1",
            "batch_no": "B1",
            "strategy_id": "S1",
            "run_status": "success",
            "annualized_return": 0.12,
            "max_drawdown": 0.08,
            "win_rate": 0.55,
            "score_final": 78.0,
            "grade": "B",
        },
        {
            "task_id": "T2",
            "batch_no": "B1",
            "strategy_id": "S2",
            "run_status": "failed",
            "annualized_return": 0.0,
            "max_drawdown": 0.0,
            "win_rate": 0.0,
            "score_final": 0.0,
            "grade": "D",
        },
    ]
    summary_rows = 按策略汇总(results_rows)
    payload = 生成批量分析载荷(results_rows, summary_rows, max_results=10, max_strategies=10)
    assert payload["task_total"] == 2
    assert payload["success_total"] == 1
    assert payload["failed_total"] == 1
    assert payload["strategy_total"] == 2
    prompt = 渲染提示词模板("总任务={task_total},成功率={success_rate}", payload)
    assert "总任务=2" in prompt
    assert "成功率=0.5" in prompt


def test_batch_parser_contains_ai_analyze_options():
    parser = build_parser()
    args = parser.parse_args(["--ai-analyze", "--ai-analysis-prompt", "abc", "--ai-analysis-output-md", "data/x.md"])
    assert bool(args.ai_analyze) is True
    assert args.ai_analysis_prompt == "abc"
    assert args.ai_analysis_output_md == "data/x.md"


def test_task_artifacts_files_match_task_id(tmp_path):
    task = {"task_id": "T000123", "stock_code": "600000.SH"}
    result = {"task_id": "T000123", "status": "success", "report_id": "RPT-001", "ok": True, "error_msg": ""}
    report = {"report_id": "RPT-001", "summary": {"x": 1}}
    out_dir = 写入任务明细文件(tmp_path, task, result, report)
    p = tmp_path / "T000123"
    assert out_dir == p.resolve().as_posix()
    assert (p / "T000123.task.json").exists()
    assert (p / "T000123.result.json").exists()
    assert (p / "T000123.RPT-001.report.json").exists()


def test_append_results_csv_auto_migrates_header_for_task_artifacts_dir(tmp_path):
    path = tmp_path / "results.csv"
    old_cols = [x for x in 结果列定义 if x[1] != "task_artifacts_dir"]
    写入CSV(path, old_cols, [{"task_id": "T000001", "batch_no": "B1", "report_id": "R1"}])
    追加CSV(path, 结果列定义, {"task_id": "T000002", "batch_no": "B1", "report_id": "R2", "task_artifacts_dir": "data/批量回测任务结果/T000002"})
    rows = 读取CSV(path, 结果列定义, 结果英文别名)
    assert len(rows) == 2
    assert rows[0]["task_artifacts_dir"] == ""
    assert rows[1]["task_artifacts_dir"] == "data/批量回测任务结果/T000002"
