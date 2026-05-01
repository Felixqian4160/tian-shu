from __future__ import annotations

import threading
import time
from collections import deque
from datetime import datetime
from typing import Any, Callable, Deque, Dict, List, Optional

from src.evolution.core.orchestrator import EvolutionOrchestrator
from src.evolution.core.concurrency_manager import (
    ConcurrencyManager, 
    OperationType, 
    OperationContext,
    get_concurrency_manager
)


class EvolutionRuntimeManager:
    def __init__(self, max_history: int = 500):
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._orchestrator = EvolutionOrchestrator()
        self._concurrency_manager = get_concurrency_manager()
        self._history: Deque[Dict[str, Any]] = deque(maxlen=max(50, int(max_history)))
        self._profile_updates: Deque[Dict[str, Any]] = deque(maxlen=max(50, int(max_history)))
        self._state: Dict[str, Any] = {
            "running": False,
            "iteration": 0,
            "last_status": "idle",
            "last_score": None,
            "last_error": "",
            "interval_seconds": 1.0,
            "max_iterations": None,
            "started_at": None,
            "finished_at": None,
            "profile": {},
            "active_event_type": "",
            "active_phase": "",
            "active_phase_label": "",
            "active_message": "",
            "active_progress_pct": 0,
            "active_data_status": "idle",
            "active_stock_code": "",
            "active_timeframe": "",
            "active_scenario_index": 0,
            "active_scenario_total": 0,
            "active_updated_at": None,
        }
        self._event_sink: Optional[Callable[[Dict[str, Any]], None]] = None
        self._orchestrator.set_runtime_event_sink(self._on_orchestrator_event)

    def set_event_sink(self, sink: Optional[Callable[[Dict[str, Any]], None]]) -> None:
        self._event_sink = sink

    def start(
        self,
        interval_seconds: float = 1.0,
        max_iterations: Optional[int] = None,
        profile: Optional[Dict[str, Any]] = None,
        operator_id: str = "unknown",
    ) -> Dict[str, Any]:
        """启动进化任务，支持并发控制"""
        # 使用操作上下文管理器确保并发安全
        with OperationContext(self._concurrency_manager, OperationType.START, operator_id, timeout=10.0) as acquired:
            if not acquired:
                # 无法获取操作权限，返回当前状态和错误信息
                with self._lock:
                    snapshot = self._snapshot_unlocked()
                snapshot["error"] = "Operation not allowed: another start/stop operation is in progress"
                snapshot["concurrency_conflict"] = True
                return snapshot
            
            snapshot = None
            with self._lock:
                if self._state["running"]:
                    return self._snapshot_unlocked()
            self._stop_event.clear()
            self._state["running"] = True
            self._state["iteration"] = 0
            self._state["last_status"] = "starting"
            self._state["last_score"] = None
            self._state["last_error"] = ""
            self._state["interval_seconds"] = max(0.0, float(interval_seconds))
            self._state["max_iterations"] = None if max_iterations is None else max(1, int(max_iterations))
            self._state["started_at"] = datetime.now().isoformat(timespec="seconds")
            self._state["finished_at"] = None
            self._state["profile"] = profile if isinstance(profile, dict) else {}
            self._state["active_event_type"] = "start"
            self._state["active_phase"] = "initializing"
            self._state["active_phase_label"] = "首轮准备中"
            self._state["active_message"] = "等待首轮执行"
            self._state["active_progress_pct"] = 5
            self._state["active_data_status"] = "idle"
            self._state["active_stock_code"] = ""
            self._state["active_timeframe"] = ""
            self._state["active_scenario_index"] = 0
            self._state["active_scenario_total"] = 0
            self._state["active_updated_at"] = datetime.now().isoformat(timespec="seconds")
            self._thread = threading.Thread(target=self._run_loop, name="EvolutionRuntimeThread", daemon=True)
            self._thread.start()
            snapshot = self._snapshot_unlocked()
        self._emit_event({"kind": "state", "state": snapshot})
        return snapshot

    def stop(self, operator_id: str = "unknown") -> Dict[str, Any]:
        """停止进化任务，支持并发控制"""
        # 使用操作上下文管理器确保并发安全
        with OperationContext(self._concurrency_manager, OperationType.STOP, operator_id, timeout=10.0) as acquired:
            if not acquired:
                # 无法获取操作权限，返回当前状态和错误信息
                with self._lock:
                    snapshot = self._snapshot_unlocked()
                snapshot["error"] = "Operation not allowed: another start/stop operation is in progress"
                snapshot["concurrency_conflict"] = True
                return snapshot
            
            thread = None
            snapshot = None
            with self._lock:
                self._stop_event.set()
                thread = self._thread
        if thread and thread.is_alive():
            thread.join(timeout=2.0)
        with self._lock:
            self._state["running"] = False
            self._state["last_status"] = "stopped"
            self._state["finished_at"] = datetime.now().isoformat(timespec="seconds")
            self._set_terminal_activity_unlocked(mode="stopped")
            snapshot = self._snapshot_unlocked()
        self._emit_event({"kind": "progress", "progress": snapshot.get("activity", {})})
        self._emit_event({"kind": "state", "state": snapshot})
        return snapshot

    def status(self) -> Dict[str, Any]:
        with self._lock:
            return self._snapshot_unlocked()

    def update_profile(
        self,
        profile_patch: Optional[Dict[str, Any]] = None,
        updated_by: str = "system",
        source: str = "runtime",
    ) -> Dict[str, Any]:
        """Patch runtime profile in-place for hot-configuration updates."""
        # 配置更新操作允许并发，但仍需要记录操作
        operator_id = f"{updated_by}@{source}"
        
        # 使用操作上下文管理器（配置更新允许并发，但需要记录）
        with OperationContext(self._concurrency_manager, OperationType.PROFILE_UPDATE, operator_id, timeout=5.0) as acquired:
            patch = profile_patch if isinstance(profile_patch, dict) else {}
            with self._lock:
                current = dict(self._state.get("profile", {})) if isinstance(self._state.get("profile"), dict) else {}
                before = dict(current)
                for key, value in patch.items():
                    current[key] = value
                self._state["profile"] = current
                ts = datetime.now().isoformat(timespec="seconds")
                self._state["active_updated_at"] = ts
            if self._state.get("running"):
                self._state["active_phase"] = "profile_update"
                self._state["active_phase_label"] = "参数热更新"
                self._state["active_message"] = "运行参数已热更新，将在后续轮次生效"
                self._state["active_data_status"] = "ok"
            self._profile_updates.append(
                {
                    "time": ts,
                    "updated_by": str(updated_by or "system"),
                    "source": str(source or "runtime"),
                    "running": bool(self._state.get("running")),
                    "patch": dict(patch),
                    "before": before,
                    "after": dict(current),
                }
            )
            snapshot = self._snapshot_unlocked()
        self._emit_event({"kind": "progress", "progress": snapshot.get("activity", {})})
        self._emit_event({"kind": "state", "state": snapshot})
        return snapshot

    def history(self, limit: int = 100) -> List[Dict[str, Any]]:
        n = max(1, min(int(limit), 1000))
        with self._lock:
            rows = list(self._history)
        return rows[-n:]

    def profile_updates(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Return profile hot-update audit rows."""
        n = max(1, min(int(limit), 1000))
        with self._lock:
            rows = list(self._profile_updates)
        return rows[-n:]

    def top_strategies(self, k: int = 20) -> List[Dict[str, Any]]:
        return self._orchestrator.memory.get_top(k=max(1, min(int(k), 200)))

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            with self._lock:
                if not self._state["running"]:
                    break
                current_iter = int(self._state["iteration"]) + 1
                max_iter = self._state["max_iterations"]
            if max_iter is not None and current_iter > int(max_iter):
                break

            started = time.time()
            score: Optional[float] = None
            status = "rejected"
            error_text = ""
            detail: Dict[str, Any] = {}
            try:
                with self._lock:
                    profile = dict(self._state.get("profile", {}))
                result = self._orchestrator.run_once(iteration=current_iter, profile_override=profile)
                detail = self._orchestrator.get_last_result()
                if isinstance(result, (int, float)):
                    score = float(result)
                    status = "ok"
                else:
                    status = "rejected"
            except Exception as exc:
                status = "error"
                error_text = str(exc)
                detail = {"reason": f"runtime_exception:{error_text}"}
            reason = str(detail.get("reason", "") or "")
            if status != "error" and reason:
                error_text = reason
            metrics = detail.get("metrics", {}) if isinstance(detail.get("metrics"), dict) else {}

            record = {
                "iteration": current_iter,
                "run_id": str(detail.get("run_id", "") or ""),
                "status": status,
                "score": score,
                "reason": reason,
                "error": error_text,
                "cost_ms": int((time.time() - started) * 1000),
                "persist_enabled": bool(profile.get("persist_enabled", True)),
                "persist_score_threshold": profile.get("persist_score_threshold"),
                "parent_strategy_id": str(detail.get("parent_strategy_id", "") or ""),
                "parent_strategy_name": str(detail.get("parent_strategy_name", "") or ""),
                "best_timeframe": str(detail.get("best_timeframe", "") or ""),
                "best_stock_code": str(detail.get("best_stock_code", "") or ""),
                "metrics": dict(metrics),
                "committed": bool(detail.get("committed", False)),
                "committed_strategy_id": str(detail.get("committed_strategy_id", "") or ""),
                "committed_strategy_name": str(detail.get("committed_strategy_name", "") or ""),
                "committed_version": detail.get("committed_version"),
                "analysis_status": str(detail.get("analysis_status", "") or ""),
                "analysis_version": str(detail.get("analysis_version", "") or ""),
                "analysis_summary": str(detail.get("analysis_summary", "") or ""),
                "analysis_source": str(detail.get("analysis_source", "") or ""),
                "analysis_confidence": detail.get("analysis_confidence"),
                "feedback_tags": detail.get("feedback_tags", []) if isinstance(detail.get("feedback_tags"), list) else [],
                "improvement_suggestions": detail.get("improvement_suggestions", []) if isinstance(detail.get("improvement_suggestions"), list) else [],
                "prompt_context_patch": detail.get("prompt_context_patch", {}) if isinstance(detail.get("prompt_context_patch"), dict) else {},
                "consistency_report_id": str(detail.get("consistency_report_id", "") or ""),
                "llm_analysis_provider": str(detail.get("llm_analysis_provider", "") or ""),
                "llm_analysis_model": str(detail.get("llm_analysis_model", "") or ""),
                "llm_provider": str(detail.get("llm_provider", "") or ""),
                "llm_path": str(detail.get("llm_path", "") or ""),
                "llm_stage": str(detail.get("llm_stage", "") or ""),
                "llm_fallback_used": bool(detail.get("llm_fallback_used", False)),
                "llm_primary_provider": str(detail.get("llm_primary_provider", "") or ""),
                "llm_primary_error": str(detail.get("llm_primary_error", "") or ""),
                "time": datetime.now().isoformat(timespec="seconds"),
            }
            with self._lock:
                self._state["iteration"] = current_iter
                self._state["last_status"] = status
                self._state["last_score"] = score
                self._state["last_error"] = error_text
                self._history.append(record)
                interval = float(self._state["interval_seconds"])
            self._emit_event({"kind": "tick", "record": dict(record)})

            if interval > 0:
                self._stop_event.wait(timeout=interval)

        with self._lock:
            self._state["running"] = False
            if str(self._state.get("last_status", "")) == "starting":
                self._state["last_status"] = "stopped"
            self._state["finished_at"] = datetime.now().isoformat(timespec="seconds")
            self._thread = None
            mode = "stopped" if self._stop_event.is_set() else "completed"
            self._set_terminal_activity_unlocked(mode=mode)
            snapshot = self._snapshot_unlocked()
        self._emit_event({"kind": "progress", "progress": snapshot.get("activity", {})})
        self._emit_event({"kind": "state", "state": snapshot})

    def _on_orchestrator_event(self, event: Dict[str, Any]) -> None:
        payload = event if isinstance(event, dict) else {}
        event_type = str(payload.get("event_type", "") or "")
        body = payload.get("payload", {}) if isinstance(payload.get("payload"), dict) else {}
        event_type_lower = event_type.lower()
        now = datetime.now().isoformat(timespec="seconds")
        with self._lock:
            self._state["active_event_type"] = event_type_lower
            self._state["active_updated_at"] = now
            if event_type_lower == "start":
                iter_no = int(body.get("iteration", 0) or 0)
                if iter_no > 0:
                    self._state["iteration"] = iter_no
                self._state["last_status"] = "running"
                self._state["active_phase"] = "research"
                self._state["active_phase_label"] = "开始第1轮"
                self._state["active_message"] = f"迭代 {iter_no} 已开始，正在准备候选策略"
                self._state["active_progress_pct"] = 8
                self._state["active_data_status"] = "idle"
            elif event_type_lower == "llmexecution":
                iter_no = int(body.get("iteration", 0) or 0)
                if iter_no > 0:
                    self._state["iteration"] = max(int(self._state.get("iteration", 0) or 0), iter_no)
                stage = str(body.get("stage", "") or "").strip().lower()
                provider = str(body.get("provider", "") or "").strip() or "unknown"
                fallback_used = bool(body.get("fallback_used", False))
                primary_provider = str(body.get("primary_provider", "") or "").strip()
                primary_error = str(body.get("primary_error", "") or "").strip()
                self._state["last_status"] = "running"
                self._state["active_phase"] = "llm"
                self._state["active_phase_label"] = "大模型生成"
                if stage == "start":
                    self._state["active_message"] = f"正在生成候选策略，provider={provider}"
                    self._state["active_progress_pct"] = max(int(self._state.get("active_progress_pct", 0) or 0), 12)
                    self._state["active_data_status"] = "idle"
                elif stage == "done":
                    if fallback_used:
                        fallback_hint = f"，主模型={primary_provider}" if primary_provider else ""
                        error_hint = f"，原因={primary_error}" if primary_error else ""
                        self._state["active_message"] = (
                            f"LLM生成完成（已回落Mock），provider={provider}{fallback_hint}{error_hint}"
                        )
                        self._state["active_data_status"] = "warning"
                    else:
                        self._state["active_message"] = f"LLM生成完成，provider={provider}"
                        self._state["active_data_status"] = "ok"
                    self._state["active_progress_pct"] = max(int(self._state.get("active_progress_pct", 0) or 0), 6)
                elif stage == "error":
                    err = str(body.get("error", "") or "").strip()
                    self._state["active_message"] = f"LLM调用失败，provider={provider}{f'，error={err}' if err else ''}"
                    self._state["active_data_status"] = "error"
                    self._state["active_progress_pct"] = max(int(self._state.get("active_progress_pct", 0) or 0), 2)
                else:
                    self._state["active_message"] = f"LLM执行中，provider={provider}"
                    self._state["active_progress_pct"] = max(int(self._state.get("active_progress_pct", 0) or 0), 2)
            elif event_type_lower == "strategygenerated":
                self._state["last_status"] = "running"
                self._state["active_phase"] = "research"
                self._state["active_phase_label"] = "候选策略已生成"
                self._state["active_message"] = "研究员已生成候选策略，等待审核"
                self._state["active_progress_pct"] = max(int(self._state.get("active_progress_pct", 0) or 0), 5)
            elif event_type_lower == "strategyapproved":
                self._state["last_status"] = "running"
                self._state["active_phase"] = "critic"
                self._state["active_phase_label"] = "审核通过"
                self._state["active_message"] = "风控审核通过，准备回测"
                self._state["active_progress_pct"] = max(int(self._state.get("active_progress_pct", 0) or 0), 10)
            elif event_type_lower == "backtestprogress":
                event_data = body.get("event", {}) if isinstance(body.get("event"), dict) else {}
                iter_no = int(body.get("iteration", 0) or 0)
                if iter_no > 0:
                    self._state["iteration"] = max(int(self._state.get("iteration", 0) or 0), iter_no)
                self._state["last_status"] = "running"
                self._state["active_phase"] = str(event_data.get("phase", "") or "backtest")
                self._state["active_phase_label"] = str(event_data.get("phase_label", "") or "回测中")
                msg = str(event_data.get("message", "") or "").strip()
                self._state["active_message"] = msg or "回测执行中"
                progress = event_data.get("progress_pct")
                try:
                    pct = int(progress)
                except Exception:
                    pct = int(self._state.get("active_progress_pct", 0) or 0)
                bounded_pct = max(0, min(100, pct))
                self._state["active_progress_pct"] = max(int(self._state.get("active_progress_pct", 0) or 0), bounded_pct)
                data_status = str(event_data.get("data_status", "") or "").strip().lower()
                if data_status:
                    self._state["active_data_status"] = data_status
                self._state["active_stock_code"] = str(event_data.get("stock_code", "") or "")
                self._state["active_timeframe"] = str(event_data.get("timeframe", "") or "")
                self._state["active_scenario_index"] = int(event_data.get("scenario_index", 0) or 0)
                self._state["active_scenario_total"] = int(event_data.get("scenario_total", 0) or 0)
            elif event_type_lower == "backtestfinished":
                self._state["last_status"] = "running"
                metrics = body.get("metrics", {}) if isinstance(body.get("metrics"), dict) else {}
                data_status = "ok"
                details = metrics.get("details", []) if isinstance(metrics.get("details"), list) else []
                if details:
                    any_bad = False
                    for row in details:
                        metric = row.get("metrics", {}) if isinstance(row, dict) else {}
                        if not bool(metric.get("_data_ok", False)):
                            any_bad = True
                            break
                    if any_bad:
                        data_status = "warning"
                self._state["active_phase"] = "backtest_done"
                self._state["active_phase_label"] = "回测完成"
                self._state["active_message"] = "回测完成，等待评分"
                self._state["active_progress_pct"] = max(int(self._state.get("active_progress_pct", 0) or 0), 95)
                self._state["active_data_status"] = data_status
            elif event_type_lower == "strategyscored":
                status = str(body.get("status", "") or "").strip().lower()
                if status:
                    self._state["last_status"] = status
                self._state["active_phase"] = "scoring"
                self._state["active_phase_label"] = "评分完成"
                self._state["active_message"] = f"评分结果: {status or '--'}"
                self._state["active_progress_pct"] = 100
                if status == "error":
                    self._state["active_data_status"] = "error"
                elif status == "ok":
                    self._state["active_data_status"] = "ok"
            elif event_type_lower == "strategyrejected":
                reason = str(body.get("reason", "") or "").strip()
                self._state["active_phase"] = "rejected"
                self._state["active_phase_label"] = "审核拒绝"
                self._state["active_message"] = reason or "候选策略被拒绝"
                self._state["active_progress_pct"] = 100
                self._state["active_data_status"] = "warning"
            elif event_type_lower == "strategycommitted":
                sid = str(body.get("strategy_id", "") or "").strip()
                self._state["active_phase"] = "committed"
                self._state["active_phase_label"] = "策略已入库"
                self._state["active_message"] = f"新增策略 {sid or '--'} 已入库"
                self._state["active_progress_pct"] = 100
                self._state["active_data_status"] = "ok"
            progress_snapshot = self._progress_snapshot_unlocked()
        self._emit_event({
            "kind": "runtime_event",
            "event_type": event_type,
            "payload": dict(body),
        })
        self._emit_event({"kind": "progress", "progress": progress_snapshot})

    def _emit_event(self, payload: Dict[str, Any]) -> None:
        sink = self._event_sink
        if sink is None:
            return
        try:
            sink(payload if isinstance(payload, dict) else {})
        except Exception:
            pass

    def _set_terminal_activity_unlocked(self, mode: str) -> None:
        now = datetime.now().isoformat(timespec="seconds")
        last_status = str(self._state.get("last_status", "") or "").strip().lower()
        current_data_status = str(self._state.get("active_data_status", "") or "").strip().lower()

        if mode == "stopped":
            phase = "stopped"
            phase_label = "已停止"
            message = "进化任务已停止"
            event_type = "stopped"
            data_status = "idle"
            progress_pct = int(self._state.get("active_progress_pct", 0) or 0)
        else:
            phase = "completed"
            phase_label = "已完成"
            event_type = "completed"
            if last_status == "error":
                message = "进化任务已完成（存在异常）"
                data_status = "error"
            elif last_status == "rejected":
                message = "进化任务已完成（候选被拒绝）"
                data_status = "warning"
            else:
                message = "进化任务已完成"
                if current_data_status in {"", "idle", "checking"}:
                    data_status = "ok" if int(self._state.get("iteration", 0) or 0) > 0 else "idle"
                else:
                    data_status = current_data_status
            progress_pct = 100

        self._state["active_event_type"] = event_type
        self._state["active_phase"] = phase
        self._state["active_phase_label"] = phase_label
        self._state["active_message"] = message
        self._state["active_data_status"] = data_status
        self._state["active_progress_pct"] = max(0, min(100, int(progress_pct)))
        self._state["active_updated_at"] = now

    def _snapshot_unlocked(self) -> Dict[str, Any]:
        return {
            "running": bool(self._state["running"]),
            "iteration": int(self._state["iteration"]),
            "last_status": str(self._state["last_status"]),
            "last_score": self._state["last_score"],
            "last_error": str(self._state["last_error"] or ""),
            "interval_seconds": float(self._state["interval_seconds"]),
            "max_iterations": self._state["max_iterations"],
            "started_at": self._state["started_at"],
            "finished_at": self._state["finished_at"],
            "history_count": len(self._history),
            "profile": dict(self._state.get("profile", {})),
            "activity": self._progress_snapshot_unlocked(),
        }

    def _progress_snapshot_unlocked(self) -> Dict[str, Any]:
        return {
            "iteration": int(self._state.get("iteration", 0) or 0),
            "event_type": str(self._state.get("active_event_type", "") or ""),
            "phase": str(self._state.get("active_phase", "") or ""),
            "phase_label": str(self._state.get("active_phase_label", "") or ""),
            "message": str(self._state.get("active_message", "") or ""),
            "progress_pct": int(self._state.get("active_progress_pct", 0) or 0),
            "data_status": str(self._state.get("active_data_status", "") or "idle"),
            "stock_code": str(self._state.get("active_stock_code", "") or ""),
            "timeframe": str(self._state.get("active_timeframe", "") or ""),
            "scenario_index": int(self._state.get("active_scenario_index", 0) or 0),
            "scenario_total": int(self._state.get("active_scenario_total", 0) or 0),
            "updated_at": self._state.get("active_updated_at"),
        }

    def get_concurrency_status(self) -> Dict[str, Any]:
        """获取并发管理器状态信息"""
        # 清理超时操作
        self._concurrency_manager.cleanup_timeout_operations()
        
        # 获取当前操作
        current_operations = self._concurrency_manager.get_current_operations()
        
        # 获取统计信息
        stats = self._concurrency_manager.get_statistics()
        
        # 获取操作历史
        recent_history = self._concurrency_manager.get_operation_history(limit=10)
        
        return {
            "current_operations": current_operations,
            "statistics": stats,
            "recent_history": recent_history,
            "is_start_allowed": self._concurrency_manager.is_operation_allowed(OperationType.START),
            "is_stop_allowed": self._concurrency_manager.is_operation_allowed(OperationType.STOP),
            "is_profile_update_allowed": self._concurrency_manager.is_operation_allowed(OperationType.PROFILE_UPDATE),
        }
