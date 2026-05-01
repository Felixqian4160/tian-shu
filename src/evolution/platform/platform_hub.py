from __future__ import annotations

from typing import Any, Dict, Optional


class EvolutionPlatformHub:
    """
    简化版进化平台中心
    只保留运行时状态查询功能，移除 backup、deployment、risk、alerts、compliance 等未使用模块
    """
    def __init__(self, evolution_runtime=None):
        self.evolution_runtime = evolution_runtime
        self._services_started = False
        self._event_sink = None

    def set_event_sink(self, sink) -> None:
        self._event_sink = sink

    def start_services(self, auto_backup: bool = False) -> None:
        """启动服务（简化版，无实际操作）"""
        self._services_started = True

    async def stop_services(self) -> None:
        """停止服务（简化版，无实际操作）"""
        self._services_started = False

    def get_overview(self) -> Dict[str, Any]:
        """获取进化运行时概览"""
        state = self.evolution_runtime.status() if self.evolution_runtime is not None else {}
        return {
            "evolution_running": bool(state.get("running", False)),
            "evolution_iteration": int(state.get("iteration", 0) or 0),
            "modules": [],
        }
