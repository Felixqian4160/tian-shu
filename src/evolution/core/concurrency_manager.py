"""
进化系统并发互斥管理器
防止关键操作的并发冲突，确保系统状态一致性
"""
import threading
import time
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Set
from enum import Enum


class OperationType(Enum):
    """操作类型枚举"""
    START = "start"
    STOP = "stop"
    PROFILE_UPDATE = "profile_update"
    STATUS_QUERY = "status_query"


class ConcurrencyManager:
    """进化系统并发互斥管理器"""
    
    def __init__(self, operation_timeout: float = 30.0):
        """
        初始化并发管理器
        
        Args:
            operation_timeout: 操作超时时间（秒）
        """
        self._lock = threading.RLock()  # 可重入锁
        self._operation_timeout = operation_timeout
        
        # 当前正在执行的操作
        self._current_operations: Dict[str, Dict[str, Any]] = {}
        
        # 操作互斥关系配置
        # key: 操作类型, value: 与该操作互斥的操作类型集合
        self._mutex_rules = {
            OperationType.START: {OperationType.START, OperationType.STOP},
            OperationType.STOP: {OperationType.START, OperationType.STOP},
            OperationType.PROFILE_UPDATE: set(),  # 配置更新可以与任何操作并发
            OperationType.STATUS_QUERY: set(),    # 状态查询可以与任何操作并发
        }
        
        # 操作历史记录
        self._operation_history: list = []
        self._max_history = 100
        
        # 统计信息
        self._stats = {
            "total_operations": 0,
            "conflicts_prevented": 0,
            "timeouts": 0,
            "concurrent_operations": 0
        }
    
    def acquire_operation(
        self, 
        operation: OperationType, 
        operator_id: str = "unknown",
        timeout: Optional[float] = None
    ) -> bool:
        """
        获取操作执行权限
        
        Args:
            operation: 操作类型
            operator_id: 操作者标识
            timeout: 自定义超时时间
            
        Returns:
            bool: 是否成功获取权限
        """
        timeout = timeout if timeout is not None else self._operation_timeout
        operation_key = f"{operation.value}_{operator_id}"
        
        with self._lock:
            # 检查是否已有相同操作在执行
            if operation_key in self._current_operations:
                return False
            
            # 检查互斥操作
            conflicting_ops = self._mutex_rules.get(operation, set())
            for current_op_key, current_op_info in self._current_operations.items():
                current_op_type = OperationType(current_op_info["type"])
                if current_op_type in conflicting_ops:
                    self._stats["conflicts_prevented"] += 1
                    return False
            
            # 记录操作开始
            self._current_operations[operation_key] = {
                "type": operation.value,
                "operator_id": operator_id,
                "started_at": datetime.now(),
                "timeout": timeout,
                "thread_id": threading.current_thread().ident
            }
            
            self._stats["total_operations"] += 1
            if len(self._current_operations) > 1:
                self._stats["concurrent_operations"] += 1
            
            return True
    
    def release_operation(
        self, 
        operation: OperationType, 
        operator_id: str = "unknown"
    ) -> bool:
        """
        释放操作执行权限
        
        Args:
            operation: 操作类型
            operator_id: 操作者标识
            
        Returns:
            bool: 是否成功释放权限
        """
        operation_key = f"{operation.value}_{operator_id}"
        
        with self._lock:
            if operation_key not in self._current_operations:
                return False
            
            # 记录操作完成
            op_info = self._current_operations.pop(operation_key)
            op_info["completed_at"] = datetime.now()
            op_info["duration"] = (op_info["completed_at"] - op_info["started_at"]).total_seconds()
            
            # 添加到历史记录
            self._add_to_history(op_info)
            
            return True
    
    def cleanup_timeout_operations(self) -> int:
        """
        清理超时的操作
        
        Returns:
            int: 清理的操作数量
        """
        cleaned_count = 0
        now = datetime.now()
        
        with self._lock:
            timeout_keys = []
            for op_key, op_info in self._current_operations.items():
                if now - op_info["started_at"] > timedelta(seconds=op_info["timeout"]):
                    timeout_keys.append(op_key)
            
            for op_key in timeout_keys:
                op_info = self._current_operations.pop(op_key)
                op_info["completed_at"] = now
                op_info["duration"] = (now - op_info["started_at"]).total_seconds()
                op_info["status"] = "timeout"
                
                self._add_to_history(op_info)
                cleaned_count += 1
                self._stats["timeouts"] += 1
        
        return cleaned_count
    
    def get_current_operations(self) -> Dict[str, Any]:
        """
        获取当前正在执行的操作
        
        Returns:
            Dict: 当前操作信息
        """
        with self._lock:
            operations = {}
            now = datetime.now()
            
            for op_key, op_info in self._current_operations.items():
                duration = (now - op_info["started_at"]).total_seconds()
                operations[op_key] = {
                    **op_info,
                    "duration": duration,
                    "remaining_timeout": max(0, op_info["timeout"] - duration)
                }
            
            return operations
    
    def get_operation_history(self, limit: int = 20) -> list:
        """
        获取操作历史记录
        
        Args:
            limit: 返回记录数量限制
            
        Returns:
            list: 操作历史记录
        """
        with self._lock:
            return self._operation_history[-limit:] if limit > 0 else self._operation_history.copy()
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        获取统计信息
        
        Returns:
            Dict: 统计信息
        """
        with self._lock:
            return {
                **self._stats,
                "current_operations": len(self._current_operations),
                "history_size": len(self._operation_history),
                "last_cleanup": datetime.now().isoformat(timespec="seconds")
            }
    
    def is_operation_allowed(
        self, 
        operation: OperationType, 
        operator_id: str = "unknown"
    ) -> bool:
        """
        检查操作是否被允许执行
        
        Args:
            operation: 操作类型
            operator_id: 操作者标识
            
        Returns:
            bool: 操作是否被允许
        """
        operation_key = f"{operation.value}_{operator_id}"
        
        with self._lock:
            # 检查是否已有相同操作在执行
            if operation_key in self._current_operations:
                return False
            
            # 检查互斥操作
            conflicting_ops = self._mutex_rules.get(operation, set())
            for current_op_info in self._current_operations.values():
                current_op_type = OperationType(current_op_info["type"])
                if current_op_type in conflicting_ops:
                    return False
            
            return True
    
    def _add_to_history(self, operation_info: Dict[str, Any]) -> None:
        """添加操作记录到历史"""
        # 转换datetime对象为字符串
        history_record = {}
        for key, value in operation_info.items():
            if isinstance(value, datetime):
                history_record[key] = value.isoformat(timespec="seconds")
            else:
                history_record[key] = value
        
        self._operation_history.append(history_record)
        
        # 限制历史记录数量
        if len(self._operation_history) > self._max_history:
            self._operation_history = self._operation_history[-self._max_history:]


class OperationContext:
    """操作上下文管理器，自动管理操作权限的获取和释放"""
    
    def __init__(
        self, 
        concurrency_manager: ConcurrencyManager,
        operation: OperationType,
        operator_id: str = "unknown",
        timeout: Optional[float] = None
    ):
        self._manager = concurrency_manager
        self._operation = operation
        self._operator_id = operator_id
        self._timeout = timeout
        self._acquired = False
    
    def __enter__(self) -> bool:
        """进入上下文，尝试获取操作权限"""
        self._acquired = self._manager.acquire_operation(
            self._operation, 
            self._operator_id, 
            self._timeout
        )
        return self._acquired
    
    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """退出上下文，释放操作权限"""
        if self._acquired:
            self._manager.release_operation(self._operation, self._operator_id)


# 全局并发管理器实例
_global_concurrency_manager: Optional[ConcurrencyManager] = None


def get_concurrency_manager() -> ConcurrencyManager:
    """获取全局并发管理器实例"""
    global _global_concurrency_manager
    if _global_concurrency_manager is None:
        _global_concurrency_manager = ConcurrencyManager()
    return _global_concurrency_manager


def with_operation_context(
    operation: OperationType,
    operator_id: str = "unknown",
    timeout: Optional[float] = None
):
    """装饰器：为函数添加操作上下文管理"""
    def decorator(func):
        def wrapper(*args, **kwargs):
            manager = get_concurrency_manager()
            with OperationContext(manager, operation, operator_id, timeout) as acquired:
                if not acquired:
                    raise RuntimeError(f"Operation {operation.value} is not allowed due to concurrency conflict")
                return func(*args, **kwargs)
        return wrapper
    return decorator