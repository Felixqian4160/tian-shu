from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from src.evolution.core.event_bus import EventBus
from src.evolution.memory.analysis_store import AnalysisStore


class AnalysisAgent:
    """Post-score analysis agent that turns consistency diagnostics into structured guidance."""

    def __init__(self, bus: EventBus, store: Optional[AnalysisStore] = None):
        self.bus = bus
        self.store = store or AnalysisStore()
        self.bus.subscribe("StrategyScored", self._on_strategy_scored)

    def _on_strategy_scored(self, data: Dict[str, Any]) -> None:
        payload = data if isinstance(data, dict) else {}
        run_id = str(payload.get("run_id", "") or "").strip()
        if not run_id:
            return
        analysis = self._build_analysis(payload)
        saved = self.store.save_analysis(analysis)
        if not saved:
            return
        self.bus.publish("StrategyAnalyzed", saved)

    def _build_analysis(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        consistency_report = payload.get("consistency_report") if isinstance(payload.get("consistency_report"), dict) else {}
        first_divergence = consistency_report.get("first_divergence") if isinstance(consistency_report.get("first_divergence"), dict) else {}
        root_cause_candidates = consistency_report.get("root_cause_candidates") if isinstance(consistency_report.get("root_cause_candidates"), list) else []
        top_candidate = next((item for item in root_cause_candidates if isinstance(item, dict)), {})
        summary = self._build_summary(payload, consistency_report, first_divergence, top_candidate)
        failure_modes = self._build_failure_modes(consistency_report, first_divergence, root_cause_candidates)
        improvement_actions = self._build_improvement_actions(consistency_report, first_divergence, top_candidate)
        avoid_patterns = self._build_avoid_patterns(consistency_report, first_divergence)
        target_metrics = self._build_target_metrics(payload)
        feedback_tags = self._build_feedback_tags(consistency_report, first_divergence)
        prompt_context_patch = self._build_prompt_context_patch(summary, failure_modes, improvement_actions, avoid_patterns, target_metrics)
        confidence = self._estimate_confidence(consistency_report, top_candidate)
        return {
            "analysis_id": "",
            "run_id": str(payload.get("run_id", "") or "").strip(),
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "analysis_version": "v1",
            "analysis_status": "success",
            "analysis_source": "rule_based",
            "analysis_summary": summary,
            "difference_reasoning": {
                "first_divergence": first_divergence,
                "root_cause_candidates": root_cause_candidates,
            },
            "improvement_suggestions": improvement_actions,
            "feedback_tags": feedback_tags,
            "prompt_context_patch": prompt_context_patch,
            "summary": summary,
            "suspected_failure_modes": failure_modes,
            "improvement_actions": improvement_actions,
            "avoid_patterns": avoid_patterns,
            "target_metrics": target_metrics,
            "risk_adjustment_hints": self._build_risk_adjustment_hints(consistency_report, target_metrics),
            "confidence": confidence,
            "consistency_report_id": str(consistency_report.get("report_id", "") or payload.get("consistency_report_id", "") or ""),
            "consistency_summary": consistency_report.get("summary") if isinstance(consistency_report.get("summary"), dict) else {},
            "llm_provider": "",
            "llm_model": "",
        }

    def _build_summary(self, payload: Dict[str, Any], consistency_report: Dict[str, Any], first_divergence: Dict[str, Any], top_candidate: Dict[str, Any]) -> str:
        if str(payload.get("status", "") or "") == "rejected":
            return "本轮策略在评分前已被拒绝，当前分析仅保留拒绝原因与后续排查方向。"
        if not consistency_report:
            return "本轮暂未关联一致性报告，当前仅基于评分结果保留通用改进建议。"
        stage = str(first_divergence.get("stage", "none") or "none")
        candidate = str(top_candidate.get("candidate", "") or "difference_unknown")
        mismatch_count = int(((consistency_report.get("summary") or {}).get("mismatch_count", 0)) or 0)
        if stage == "none":
            return "本轮回测与实盘未发现显著差异，可优先围绕收益质量和风险收益比继续优化。"
        return f"本轮回测与实盘的首个分叉出现在{stage}阶段，当前最可能的原因是 {candidate}，已识别 {mismatch_count} 处差异。"

    def _build_failure_modes(self, consistency_report: Dict[str, Any], first_divergence: Dict[str, Any], root_cause_candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        stage = str(first_divergence.get("stage", "none") or "none")
        reason_code = str(first_divergence.get("reason_code", "") or "")
        if stage != "none":
            out.append({
                "mode": f"{stage}_divergence",
                "reason_code": reason_code,
                "confidence": 0.9,
            })
        for candidate in root_cause_candidates[:3]:
            if not isinstance(candidate, dict):
                continue
            out.append({
                "mode": str(candidate.get("candidate", "") or "unknown"),
                "reason_code": reason_code,
                "confidence": float(candidate.get("confidence", 0.0) or 0.0),
            })
        return out

    def _build_improvement_actions(self, consistency_report: Dict[str, Any], first_divergence: Dict[str, Any], top_candidate: Dict[str, Any]) -> List[Dict[str, Any]]:
        actions: List[Dict[str, Any]] = []
        stage = str(first_divergence.get("stage", "none") or "none")
        checks = top_candidate.get("recommended_next_checks") if isinstance(top_candidate.get("recommended_next_checks"), list) else []
        if stage == "signal":
            actions.append({"action": "tighten_signal_reproducibility", "detail": "统一信号触发口径、样本过滤与K线边界处理。"})
        elif stage == "risk":
            actions.append({"action": "align_risk_gates", "detail": "把实盘风控阈值、仓位限制和拒单条件同步到回测侧。"})
        elif stage == "order":
            actions.append({"action": "align_order_generation", "detail": "检查委托价格、数量裁剪和状态流转是否与实盘一致。"})
        elif stage == "trade":
            actions.append({"action": "improve_execution_model", "detail": "增强滑点、撮合时间和成交拆分模型。"})
        else:
            actions.append({"action": "improve_score_quality", "detail": "在无显著一致性差异时，优先优化收益风险比与稳定性。"})
        for item in checks[:3]:
            text = str(item or "").strip()
            if text:
                actions.append({"action": "follow_up_check", "detail": text})
        if not actions:
            actions.append({"action": "collect_more_samples", "detail": "增加更多实盘样本后再做归因。"})
        return actions

    def _build_avoid_patterns(self, consistency_report: Dict[str, Any], first_divergence: Dict[str, Any]) -> List[str]:
        tags = consistency_report.get("root_cause_tags") if isinstance(consistency_report.get("root_cause_tags"), list) else []
        out = []
        if "signal_count_drift" in tags:
            out.append("避免依赖未显式固定的信号触发窗口。")
        if "risk_rule_drift" in tags or str(first_divergence.get("stage", "")) == "risk":
            out.append("避免只在实盘侧启用的隐式风控开关。")
        if "slippage_drift" in tags or "timing_drift" in tags:
            out.append("避免假设理想成交价和零延迟撮合。")
        if not out:
            out.append("避免在缺少一致性证据时过度放大单次收益表现。")
        return out

    def _build_target_metrics(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        metrics = payload.get("metrics") if isinstance(payload.get("metrics"), dict) else {}
        return {
            "target_sharpe_floor": round(float(metrics.get("sharpe", 0.0) or 0.0) + 0.2, 4),
            "target_drawdown_ceiling": max(0.0, round(float(metrics.get("drawdown", 0.0) or 0.0), 4)),
            "target_win_rate_floor": max(0.0, round(float(metrics.get("win_rate", 0.0) or 0.0), 4)),
        }

    def _build_feedback_tags(self, consistency_report: Dict[str, Any], first_divergence: Dict[str, Any]) -> List[str]:
        tags = consistency_report.get("root_cause_tags") if isinstance(consistency_report.get("root_cause_tags"), list) else []
        out = [str(tag or "").strip() for tag in tags if str(tag or "").strip()]
        stage = str(first_divergence.get("stage", "none") or "none")
        if stage and stage != "none":
            out.append(f"first_divergence_{stage}")
        deduped = []
        seen = set()
        for tag in out:
            if tag in seen:
                continue
            seen.add(tag)
            deduped.append(tag)
        return deduped

    def _build_prompt_context_patch(self, summary: str, failure_modes: List[Dict[str, Any]], improvement_actions: List[Dict[str, Any]], avoid_patterns: List[str], target_metrics: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "analysis_summary": summary,
            "suspected_failure_modes": failure_modes,
            "improvement_actions": improvement_actions,
            "avoid_patterns": avoid_patterns,
            "target_metrics": target_metrics,
        }

    def _build_risk_adjustment_hints(self, consistency_report: Dict[str, Any], target_metrics: Dict[str, Any]) -> List[str]:
        tags = consistency_report.get("root_cause_tags") if isinstance(consistency_report.get("root_cause_tags"), list) else []
        hints = []
        if "risk_rule_drift" in tags or "live_risk_intercept" in tags:
            hints.append("优先降低边界仓位和高波动时段敞口。")
        if "position_size_mismatch" in tags:
            hints.append("重新校准下单数量映射，保证回测和实盘的仓位缩放一致。")
        if not hints:
            hints.append(f"将最大回撤控制在 {target_metrics.get('target_drawdown_ceiling', 0.0)} 附近。")
        return hints

    def _estimate_confidence(self, consistency_report: Dict[str, Any], top_candidate: Dict[str, Any]) -> float:
        if not consistency_report:
            return 0.45
        mismatch_count = int(((consistency_report.get("summary") or {}).get("mismatch_count", 0)) or 0)
        candidate_conf = float(top_candidate.get("confidence", 0.0) or 0.0)
        if mismatch_count <= 0:
            return max(0.55, candidate_conf or 0.75)
        return round(min(0.95, max(0.6, candidate_conf + min(mismatch_count, 5) * 0.03)), 2)
