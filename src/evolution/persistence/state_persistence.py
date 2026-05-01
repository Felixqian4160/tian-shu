"""
进化状态持久化和断点续传模块
确保进化过程可以中断后恢复，避免进度丢失
"""
import json
import pickle
import os
import threading
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
import hashlib
import shutil
from copy import deepcopy


@dataclass
class EvolutionSnapshot:
    """进化快照数据结构"""
    session_id: str
    timestamp: datetime
    generation: int
    population: List[Dict[str, Any]]
    best_individual: Dict[str, Any]
    fitness_history: List[float]
    diversity_history: List[float]
    config: Dict[str, Any]
    algorithm_state: Dict[str, Any]
    checkpoint_metadata: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        data = asdict(self)
        data['timestamp'] = self.timestamp.isoformat()
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'EvolutionSnapshot':
        """从字典创建实例"""
        data['timestamp'] = datetime.fromisoformat(data['timestamp'])
        return cls(**data)


@dataclass
class CheckpointConfig:
    """检查点配置"""
    enabled: bool = True
    save_interval: int = 5  # 每隔多少代保存一次
    max_checkpoints: int = 10  # 最大保留检查点数量
    compression_enabled: bool = True
    backup_enabled: bool = True
    auto_cleanup: bool = True
    checkpoint_dir: str = "evolution_checkpoints"


class EvolutionStatePersistence:
    """进化状态持久化管理器"""
    
    def __init__(self, config: CheckpointConfig):
        self.config = config
        self.checkpoint_dir = Path(config.checkpoint_dir)
        self.checkpoint_dir.mkdir(exist_ok=True)
        
        # 创建备份目录
        if config.backup_enabled:
            self.backup_dir = self.checkpoint_dir / "backups"
            self.backup_dir.mkdir(exist_ok=True)
        
        # 线程锁
        self._lock = threading.Lock()
        
        # 当前会话ID
        self.session_id = self._generate_session_id()
        
        # 检查点索引
        self.checkpoint_index = self._load_checkpoint_index()
    
    def _generate_session_id(self) -> str:
        """生成会话ID"""
        timestamp = datetime.now().isoformat()
        hash_input = f"{timestamp}_{os.getpid()}_{threading.get_ident()}"
        return hashlib.md5(hash_input.encode()).hexdigest()[:12]
    
    def _load_checkpoint_index(self) -> Dict[str, Any]:
        """加载检查点索引"""
        index_file = self.checkpoint_dir / "index.json"
        if index_file.exists():
            try:
                with open(index_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"加载检查点索引失败: {e}")
        
        return {
            "sessions": {},
            "last_cleanup": datetime.now().isoformat(),
            "version": "1.0"
        }
    
    def _save_checkpoint_index(self) -> None:
        """保存检查点索引"""
        index_file = self.checkpoint_dir / "index.json"
        try:
            with self._lock:
                with open(index_file, 'w', encoding='utf-8') as f:
                    json.dump(self.checkpoint_index, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"保存检查点索引失败: {e}")
    
    def save_checkpoint(self, snapshot: EvolutionSnapshot) -> str:
        """保存检查点"""
        if not self.config.enabled:
            return ""
        
        with self._lock:
            try:
                # 生成检查点文件名
                checkpoint_id = f"{snapshot.session_id}_gen{snapshot.generation}_{int(snapshot.timestamp.timestamp())}"
                checkpoint_file = self.checkpoint_dir / f"{checkpoint_id}.json"
                
                # 保存快照数据
                if self.config.compression_enabled:
                    # 使用压缩格式保存
                    import gzip
                    with gzip.open(f"{checkpoint_file}.gz", 'wt', encoding='utf-8') as f:
                        json.dump(snapshot.to_dict(), f, indent=2, ensure_ascii=False)
                    checkpoint_file = f"{checkpoint_file}.gz"
                else:
                    with open(checkpoint_file, 'w', encoding='utf-8') as f:
                        json.dump(snapshot.to_dict(), f, indent=2, ensure_ascii=False)
                
                # 更新索引
                if snapshot.session_id not in self.checkpoint_index["sessions"]:
                    self.checkpoint_index["sessions"][snapshot.session_id] = {
                        "created_at": snapshot.timestamp.isoformat(),
                        "checkpoints": []
                    }
                
                checkpoint_info = {
                    "id": checkpoint_id,
                    "generation": snapshot.generation,
                    "timestamp": snapshot.timestamp.isoformat(),
                    "file": str(checkpoint_file.name),
                    "best_fitness": snapshot.best_individual.get("fitness", 0.0),
                    "population_size": len(snapshot.population)
                }
                
                # 添加到会话检查点列表
                session_checkpoints = self.checkpoint_index["sessions"][snapshot.session_id]["checkpoints"]
                session_checkpoints.append(checkpoint_info)
                
                # 按代数排序
                session_checkpoints.sort(key=lambda x: x["generation"])
                
                # 限制检查点数量
                if len(session_checkpoints) > self.config.max_checkpoints:
                    # 删除最旧的检查点
                    old_checkpoint = session_checkpoints.pop(0)
                    old_file = self.checkpoint_dir / old_checkpoint["file"]
                    if old_file.exists():
                        old_file.unlink()
                
                # 保存索引
                self._save_checkpoint_index()
                
                # 创建备份
                if self.config.backup_enabled:
                    self._create_backup(checkpoint_file, checkpoint_id)
                
                # 自动清理
                if self.config.auto_cleanup:
                    self._cleanup_old_checkpoints()
                
                print(f"检查点已保存: {checkpoint_id}")
                return checkpoint_id
                
            except Exception as e:
                print(f"保存检查点失败: {e}")
                return ""
    
    def load_checkpoint(self, checkpoint_id: str) -> Optional[EvolutionSnapshot]:
        """加载检查点"""
        with self._lock:
            try:
                # 查找检查点文件
                checkpoint_file = None
                for session_data in self.checkpoint_index["sessions"].values():
                    for checkpoint_info in session_data["checkpoints"]:
                        if checkpoint_info["id"] == checkpoint_id:
                            checkpoint_file = self.checkpoint_dir / checkpoint_info["file"]
                            break
                    if checkpoint_file:
                        break
                
                if not checkpoint_file or not checkpoint_file.exists():
                    print(f"检查点文件不存在: {checkpoint_id}")
                    return None
                
                # 加载快照数据
                if checkpoint_file.suffix == '.gz':
                    import gzip
                    with gzip.open(checkpoint_file, 'rt', encoding='utf-8') as f:
                        data = json.load(f)
                else:
                    with open(checkpoint_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                
                snapshot = EvolutionSnapshot.from_dict(data)
                print(f"检查点已加载: {checkpoint_id}")
                return snapshot
                
            except Exception as e:
                print(f"加载检查点失败: {e}")
                return None
    
    def get_latest_checkpoint(self, session_id: Optional[str] = None) -> Optional[str]:
        """获取最新检查点ID"""
        with self._lock:
            if session_id:
                # 获取指定会话的最新检查点
                if session_id in self.checkpoint_index["sessions"]:
                    checkpoints = self.checkpoint_index["sessions"][session_id]["checkpoints"]
                    if checkpoints:
                        return checkpoints[-1]["id"]
            else:
                # 获取所有会话中的最新检查点
                latest_checkpoint = None
                latest_timestamp = None
                
                for session_data in self.checkpoint_index["sessions"].values():
                    if session_data["checkpoints"]:
                        checkpoint = session_data["checkpoints"][-1]
                        timestamp = datetime.fromisoformat(checkpoint["timestamp"])
                        if latest_timestamp is None or timestamp > latest_timestamp:
                            latest_timestamp = timestamp
                            latest_checkpoint = checkpoint["id"]
                
                return latest_checkpoint
            
            return None
    
    def list_checkpoints(self, session_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """列出检查点"""
        with self._lock:
            checkpoints = []
            
            if session_id:
                # 列出指定会话的检查点
                if session_id in self.checkpoint_index["sessions"]:
                    checkpoints = self.checkpoint_index["sessions"][session_id]["checkpoints"]
            else:
                # 列出所有检查点
                for session_id, session_data in self.checkpoint_index["sessions"].items():
                    for checkpoint in session_data["checkpoints"]:
                        checkpoint_copy = checkpoint.copy()
                        checkpoint_copy["session_id"] = session_id
                        checkpoints.append(checkpoint_copy)
            
            # 按时间戳排序
            checkpoints.sort(key=lambda x: x["timestamp"], reverse=True)
            return checkpoints
    
    def delete_checkpoint(self, checkpoint_id: str) -> bool:
        """删除检查点"""
        with self._lock:
            try:
                # 查找并删除检查点文件
                for session_id, session_data in self.checkpoint_index["sessions"].items():
                    checkpoints = session_data["checkpoints"]
                    for i, checkpoint in enumerate(checkpoints):
                        if checkpoint["id"] == checkpoint_id:
                            # 删除文件
                            checkpoint_file = self.checkpoint_dir / checkpoint["file"]
                            if checkpoint_file.exists():
                                checkpoint_file.unlink()
                            
                            # 从索引中移除
                            checkpoints.pop(i)
                            
                            # 如果会话没有检查点了，删除会话
                            if not checkpoints:
                                del self.checkpoint_index["sessions"][session_id]
                            
                            # 保存索引
                            self._save_checkpoint_index()
                            
                            print(f"检查点已删除: {checkpoint_id}")
                            return True
                
                print(f"检查点不存在: {checkpoint_id}")
                return False
                
            except Exception as e:
                print(f"删除检查点失败: {e}")
                return False
    
    def _create_backup(self, checkpoint_file: Path, checkpoint_id: str) -> None:
        """创建检查点备份"""
        try:
            backup_file = self.backup_dir / f"{checkpoint_id}_backup{checkpoint_file.suffix}"
            shutil.copy2(checkpoint_file, backup_file)
        except Exception as e:
            print(f"创建备份失败: {e}")
    
    def _cleanup_old_checkpoints(self) -> None:
        """清理旧检查点"""
        try:
            # 检查是否需要清理
            last_cleanup = datetime.fromisoformat(self.checkpoint_index["last_cleanup"])
            if datetime.now() - last_cleanup < timedelta(days=1):
                return
            
            # 清理超过7天的检查点
            cutoff_time = datetime.now() - timedelta(days=7)
            sessions_to_remove = []
            
            for session_id, session_data in self.checkpoint_index["sessions"].items():
                checkpoints_to_remove = []
                
                for checkpoint in session_data["checkpoints"]:
                    checkpoint_time = datetime.fromisoformat(checkpoint["timestamp"])
                    if checkpoint_time < cutoff_time:
                        # 删除文件
                        checkpoint_file = self.checkpoint_dir / checkpoint["file"]
                        if checkpoint_file.exists():
                            checkpoint_file.unlink()
                        checkpoints_to_remove.append(checkpoint)
                
                # 从索引中移除
                for checkpoint in checkpoints_to_remove:
                    session_data["checkpoints"].remove(checkpoint)
                
                # 如果会话没有检查点了，标记删除
                if not session_data["checkpoints"]:
                    sessions_to_remove.append(session_id)
            
            # 删除空会话
            for session_id in sessions_to_remove:
                del self.checkpoint_index["sessions"][session_id]
            
            # 更新清理时间
            self.checkpoint_index["last_cleanup"] = datetime.now().isoformat()
            self._save_checkpoint_index()
            
            print(f"已完成检查点清理，删除了{len(sessions_to_remove)}个过期会话")
            
        except Exception as e:
            print(f"清理检查点失败: {e}")
    
    def get_session_info(self, session_id: str) -> Optional[Dict[str, Any]]:
        """获取会话信息"""
        with self._lock:
            if session_id in self.checkpoint_index["sessions"]:
                session_data = self.checkpoint_index["sessions"][session_id]
                return {
                    "session_id": session_id,
                    "created_at": session_data["created_at"],
                    "checkpoint_count": len(session_data["checkpoints"]),
                    "latest_generation": session_data["checkpoints"][-1]["generation"] if session_data["checkpoints"] else 0,
                    "latest_fitness": session_data["checkpoints"][-1]["best_fitness"] if session_data["checkpoints"] else 0.0
                }
            return None
    
    def list_sessions(self) -> List[Dict[str, Any]]:
        """列出所有会话"""
        with self._lock:
            sessions = []
            for session_id, session_data in self.checkpoint_index["sessions"].items():
                session_info = self.get_session_info(session_id)
                if session_info:
                    sessions.append(session_info)
            
            # 按创建时间排序
            sessions.sort(key=lambda x: x["created_at"], reverse=True)
            return sessions
    
    def export_session(self, session_id: str, export_path: str) -> bool:
        """导出会话数据"""
        try:
            export_dir = Path(export_path)
            export_dir.mkdir(exist_ok=True)
            
            # 导出检查点文件
            if session_id in self.checkpoint_index["sessions"]:
                session_data = self.checkpoint_index["sessions"][session_id]
                
                for checkpoint in session_data["checkpoints"]:
                    checkpoint_file = self.checkpoint_dir / checkpoint["file"]
                    if checkpoint_file.exists():
                        export_file = export_dir / checkpoint["file"]
                        shutil.copy2(checkpoint_file, export_file)
                
                # 导出会话信息
                session_info_file = export_dir / f"{session_id}_info.json"
                with open(session_info_file, 'w', encoding='utf-8') as f:
                    json.dump(session_data, f, indent=2, ensure_ascii=False)
                
                print(f"会话已导出到: {export_path}")
                return True
            
            return False
            
        except Exception as e:
            print(f"导出会话失败: {e}")
            return False
    
    def import_session(self, import_path: str) -> Optional[str]:
        """导入会话数据"""
        try:
            import_dir = Path(import_path)
            if not import_dir.exists():
                print(f"导入路径不存在: {import_path}")
                return None
            
            # 查找会话信息文件
            info_files = list(import_dir.glob("*_info.json"))
            if not info_files:
                print("未找到会话信息文件")
                return None
            
            info_file = info_files[0]
            with open(info_file, 'r', encoding='utf-8') as f:
                session_data = json.load(f)
            
            # 生成新的会话ID
            new_session_id = self._generate_session_id()
            
            # 复制检查点文件
            for checkpoint in session_data["checkpoints"]:
                checkpoint_file = import_dir / checkpoint["file"]
                if checkpoint_file.exists():
                    new_checkpoint_id = checkpoint["id"].replace(checkpoint["id"].split("_")[0], new_session_id)
                    checkpoint["id"] = new_checkpoint_id
                    
                    new_file = self.checkpoint_dir / checkpoint["file"]
                    shutil.copy2(checkpoint_file, new_file)
            
            # 添加到索引
            self.checkpoint_index["sessions"][new_session_id] = {
                "created_at": datetime.now().isoformat(),
                "checkpoints": session_data["checkpoints"]
            }
            
            # 保存索引
            self._save_checkpoint_index()
            
            print(f"会话已导入，新会话ID: {new_session_id}")
            return new_session_id
            
        except Exception as e:
            print(f"导入会话失败: {e}")
            return None


class EvolutionResumable:
    """可恢复的进化执行器"""
    
    def __init__(self, persistence: EvolutionStatePersistence):
        self.persistence = persistence
        self.current_session_id = persistence.session_id
        self.last_checkpoint_generation = 0
    
    def should_save_checkpoint(self, generation: int) -> bool:
        """判断是否应该保存检查点"""
        return (generation - self.last_checkpoint_generation) >= self.persistence.config.save_interval
    
    def create_snapshot(self, generation: int, population: List, best_individual: Any, 
                       fitness_history: List[float], diversity_history: List[float],
                       config: Dict[str, Any], algorithm_state: Dict[str, Any]) -> EvolutionSnapshot:
        """创建进化快照"""
        # 序列化种群
        serialized_population = []
        for individual in population:
            serialized_individual = {
                "gene": individual.gene,
                "fitness": individual.fitness,
                "age": individual.age,
                "generation": individual.generation,
                "parent_ids": individual.parent_ids,
                "mutation_history": individual.mutation_history,
                "diversity_score": individual.diversity_score
            }
            serialized_population.append(serialized_individual)
        
        # 序列化最佳个体
        serialized_best = {
            "gene": best_individual.gene,
            "fitness": best_individual.fitness,
            "age": best_individual.age,
            "generation": best_individual.generation,
            "parent_ids": best_individual.parent_ids,
            "mutation_history": best_individual.mutation_history,
            "diversity_score": best_individual.diversity_score
        }
        
        snapshot = EvolutionSnapshot(
            session_id=self.current_session_id,
            timestamp=datetime.now(),
            generation=generation,
            population=serialized_population,
            best_individual=serialized_best,
            fitness_history=fitness_history.copy(),
            diversity_history=diversity_history.copy(),
            config=deepcopy(config),
            algorithm_state=deepcopy(algorithm_state),
            checkpoint_metadata={
                "platform": os.name,
                "python_version": f"{os.sys.version_info.major}.{os.sys.version_info.minor}",
                "created_by": "EvolutionResumable"
            }
        )
        
        return snapshot
    
    def save_checkpoint_if_needed(self, generation: int, population: List, best_individual: Any,
                                 fitness_history: List[float], diversity_history: List[float],
                                 config: Dict[str, Any], algorithm_state: Dict[str, Any]) -> Optional[str]:
        """如果需要则保存检查点"""
        if self.should_save_checkpoint(generation):
            snapshot = self.create_snapshot(
                generation, population, best_individual, 
                fitness_history, diversity_history, config, algorithm_state
            )
            
            checkpoint_id = self.persistence.save_checkpoint(snapshot)
            if checkpoint_id:
                self.last_checkpoint_generation = generation
                return checkpoint_id
        
        return None
    
    def resume_from_latest(self) -> Optional[Tuple[EvolutionSnapshot, str]]:
        """从最新检查点恢复"""
        checkpoint_id = self.persistence.get_latest_checkpoint()
        if checkpoint_id:
            snapshot = self.persistence.load_checkpoint(checkpoint_id)
            if snapshot:
                self.current_session_id = snapshot.session_id
                self.last_checkpoint_generation = snapshot.generation
                return snapshot, checkpoint_id
        
        return None
    
    def resume_from_checkpoint(self, checkpoint_id: str) -> Optional[EvolutionSnapshot]:
        """从指定检查点恢复"""
        snapshot = self.persistence.load_checkpoint(checkpoint_id)
        if snapshot:
            self.current_session_id = snapshot.session_id
            self.last_checkpoint_generation = snapshot.generation
        
        return snapshot


# 全局持久化管理器实例
_evolution_persistence = None


def get_evolution_persistence(config: Optional[CheckpointConfig] = None) -> EvolutionStatePersistence:
    """获取全局进化持久化管理器"""
    global _evolution_persistence
    if _evolution_persistence is None:
        if config is None:
            config = CheckpointConfig()
        _evolution_persistence = EvolutionStatePersistence(config)
    return _evolution_persistence