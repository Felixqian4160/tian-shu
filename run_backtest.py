import asyncio
import argparse
from datetime import datetime
import json
import os
import time
from src.core.backtest_cabinet import BacktestCabinet
from src.utils.backtest_baseline import apply_backtest_baseline

REPORTS_DIR = os.path.join("data", "reports")
REPORT_FILE_PREFIX = "backtest_report_"
REPORT_FILE_SUFFIX = ".json"

def persist_single_report(report):
    os.makedirs(REPORTS_DIR, exist_ok=True)
    report_id = str(report.get("report_id", "")).strip()
    if not report_id:
        report_id = f"{int(time.time() * 1000)}-{os.urandom(2).hex()}"
        report["report_id"] = report_id
    file_name = f"{REPORT_FILE_PREFIX}{report_id}{REPORT_FILE_SUFFIX}"
    file_path = os.path.join(REPORTS_DIR, file_name)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump({"report": report}, f, ensure_ascii=False, indent=2, default=str)
    return file_path

def save_backtest_report(args, result_data, strategy_reports):
    if not result_data:
        return
    report_id = f"{int(time.time() * 1000)}-{os.urandom(2).hex()}"
    report = {
        "report_id": report_id,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "stock_code": args.stock,
        "strategy_id": args.strategy,
        "summary": result_data,
        "ranking": result_data.get("ranking", []),
        "strategy_reports": strategy_reports
    }
    saved_path = persist_single_report(report)
    print(f"[REPORT] saved to {saved_path} (report_id={report_id})")

async def main():
    parser = argparse.ArgumentParser(description="Run backtest via BacktestCabinet")
    parser.add_argument("--stock", required=True, help="Stock code, e.g., 600036.SH")
    parser.add_argument("--start", required=True, help="Start date YYYY-MM-DD")
    parser.add_argument("--end", required=True, help="End date YYYY-MM-DD")
    parser.add_argument("--capital", type=float, default=1_000_000, help="Initial capital")
    parser.add_argument("--top5", action="store_true", help="Use top 5 strategies")
    parser.add_argument("--strategy", default="all", help="Specific strategy id if not using --top5")
    args = parser.parse_args()
    baseline_result = apply_backtest_baseline(
        stock_code=args.stock,
        strategy_id=args.strategy,
        strategy_mode="top5" if args.top5 else None
    )
    if baseline_result.get("applied"):
        print(
            "[BASELINE] "
            f"profile={baseline_result.get('profile_name','')} "
            f"market={baseline_result.get('market','')} "
            f"adj={baseline_result.get('adjustment_mode','')} "
            f"settlement={baseline_result.get('settlement_rule','')} "
            f"source={baseline_result.get('data_source','')}"
        )

    events = {
        "progress": 0,
        "done": False,
        "result": None,
        "strategy_reports": {}
    }

    async def printer(event_type, data):
        if event_type == "system":
            print(f"[SYSTEM] {data.get('msg','')}")
        elif event_type == "backtest_progress":
            print(f"[PROGRESS] {data.get('progress',0)}% @ {data.get('current_date','--')}")
        elif event_type == "backtest_trade":
            # Keep concise
            print(f"[TRADE] {data.get('dt')} {data.get('strategy')} {data.get('dir')} {data.get('code')} @ {data.get('price')} x{data.get('qty')}")
        elif event_type == "backtest_result":
            events["result"] = data
            print("\n[RESULT] Backtest Summary")
            print(f"Stock: {data.get('stock')}  Period: {data.get('period')}  Total Trades: {data.get('total_trades')}")
            ranking = data.get("ranking", [])
            if ranking:
                print("Rank | Strategy | Rating | Annual ROI | Max DD | Win Rate | Calmar")
                for row in ranking:
                    print(f"{row.get('rank')} | {row.get('strategy_id')} | {row.get('rating')} | "
                          f"{row.get('annualized_roi'):.4f} | {row.get('max_dd'):.4f} | "
                          f"{row.get('win_rate'):.4f} | {row.get('calmar'):.4f}")
            events["done"] = True
        elif event_type == "backtest_strategy_report":
            sid = str(data.get("strategy_id", ""))
            if sid:
                events["strategy_reports"][sid] = data

    cab = BacktestCabinet(
        stock_code=args.stock,
        strategy_id=args.strategy,
        initial_capital=args.capital,
        event_callback=printer,
        strategy_mode="top5" if args.top5 else None
    )

    start_dt = datetime.strptime(args.start, "%Y-%m-%d")
    end_dt = datetime.strptime(args.end, "%Y-%m-%d")

    await cab.run(start_date=start_dt, end_date=end_dt)
    save_backtest_report(args, events["result"], events["strategy_reports"])

if __name__ == "__main__":
    asyncio.run(main())
