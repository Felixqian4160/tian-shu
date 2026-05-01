"""
专业策略模板库
提供多种成熟的量化策略模板，用于基因策略生成
"""
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from enum import Enum
import random
import numpy as np


class StrategyCategory(Enum):
    """策略类别枚举"""
    MOMENTUM = "momentum"          # 动量策略
    MEAN_REVERSION = "mean_reversion"  # 均值回归
    ARBITRAGE = "arbitrage"        # 套利策略
    EVENT_DRIVEN = "event_driven"  # 事件驱动
    TECHNICAL = "technical"        # 技术分析
    FUNDAMENTAL = "fundamental"    # 基本面
    VOLATILITY = "volatility"      # 波动率
    SENTIMENT = "sentiment"        # 情绪指标


@dataclass
class StrategyParameter:
    """策略参数定义"""
    name: str
    param_type: str  # 'int', 'float', 'bool', 'choice'
    default_value: Any
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    choices: Optional[List[str]] = None
    description: str = ""
    
    def validate(self, value: Any) -> bool:
        """验证参数值是否有效"""
        if self.param_type == 'int':
            if not isinstance(value, int):
                return False
            if self.min_value is not None and value < self.min_value:
                return False
            if self.max_value is not None and value > self.max_value:
                return False
        elif self.param_type == 'float':
            if not isinstance(value, (int, float)):
                return False
            if self.min_value is not None and value < self.min_value:
                return False
            if self.max_value is not None and value > self.max_value:
                return False
        elif self.param_type == 'bool':
            if not isinstance(value, bool):
                return False
        elif self.param_type == 'choice':
            if self.choices and value not in self.choices:
                return False
        return True


@dataclass
class StrategyTemplate:
    """策略模板定义"""
    id: str
    name: str
    category: StrategyCategory
    description: str
    parameters: List[StrategyParameter]
    gene_structure: Dict[str, Any]
    complexity_score: float  # 复杂度评分 0-1
    risk_level: str  # 'low', 'medium', 'high'
    a_share_compatible: bool = True  # 是否兼容A股规则
    
    def generate_random_params(self) -> Dict[str, Any]:
        """生成随机参数组合"""
        params = {}
        for param in self.parameters:
            if param.param_type == 'int':
                if param.min_value is not None and param.max_value is not None:
                    params[param.name] = random.randint(param.min_value, param.max_value)
                else:
                    params[param.name] = param.default_value
            elif param.param_type == 'float':
                if param.min_value is not None and param.max_value is not None:
                    params[param.name] = random.uniform(param.min_value, param.max_value)
                else:
                    params[param.name] = param.default_value
            elif param.param_type == 'bool':
                params[param.name] = random.choice([True, False])
            elif param.param_type == 'choice':
                params[param.name] = random.choice(param.choices) if param.choices else param.default_value
        return params
    
    def validate_params(self, params: Dict[str, Any]) -> bool:
        """验证参数组合"""
        for param in self.parameters:
            if param.name not in params:
                return False
            if not param.validate(params[param.name]):
                return False
        return True


class StrategyTemplateLibrary:
    """策略模板库"""
    
    def __init__(self):
        self.templates: Dict[str, StrategyTemplate] = {}
        self._initialize_templates()
    
    def _initialize_templates(self):
        """初始化策略模板"""
        
        # 1. 双均线策略
        self.templates["dual_ma"] = StrategyTemplate(
            id="dual_ma",
            name="双均线策略",
            category=StrategyCategory.TECHNICAL,
            description="基于快慢均线的交叉信号进行交易",
            parameters=[
                StrategyParameter("fast_period", "int", 5, 1, 20, description="快均线周期"),
                StrategyParameter("slow_period", "int", 20, 10, 60, description="慢均线周期"),
                StrategyParameter("signal_threshold", "float", 0.01, 0.001, 0.05, description="信号阈值"),
                StrategyParameter("position_size", "float", 0.5, 0.1, 1.0, description="仓位大小"),
            ],
            gene_structure={
                "signal_type": "ma_crossover",
                "indicators": ["sma", "ema"],
                "conditions": ["golden_cross", "death_cross"],
                "risk_management": ["stop_loss", "position_sizing"]
            },
            complexity_score=0.3,
            risk_level="low"
        )
        
        # 2. RSI均值回归策略
        self.templates["rsi_mean_reversion"] = StrategyTemplate(
            id="rsi_mean_reversion",
            name="RSI均值回归策略",
            category=StrategyCategory.MEAN_REVERSION,
            description="基于RSI指标的超买超卖信号进行反向交易",
            parameters=[
                StrategyParameter("rsi_period", "int", 14, 5, 30, description="RSI周期"),
                StrategyParameter("oversold_threshold", "float", 30, 20, 40, description="超卖阈值"),
                StrategyParameter("overbought_threshold", "float", 70, 60, 80, description="超买阈值"),
                StrategyParameter("exit_threshold", "float", 50, 45, 55, description="退出阈值"),
                StrategyParameter("position_size", "float", 0.6, 0.2, 0.8, description="仓位大小"),
            ],
            gene_structure={
                "signal_type": "mean_reversion",
                "indicators": ["rsi"],
                "conditions": ["oversold", "overbought"],
                "risk_management": ["stop_loss", "take_profit"]
            },
            complexity_score=0.4,
            risk_level="medium"
        )
        
        # 3. 动量突破策略
        self.templates["momentum_breakout"] = StrategyTemplate(
            id="momentum_breakout",
            name="动量突破策略",
            category=StrategyCategory.MOMENTUM,
            description="基于价格突破和动量确认的趋势跟踪策略",
            parameters=[
                StrategyParameter("lookback_period", "int", 20, 10, 50, description="回看周期"),
                StrategyParameter("breakout_threshold", "float", 0.02, 0.01, 0.05, description="突破阈值"),
                StrategyParameter("momentum_period", "int", 10, 5, 20, description="动量周期"),
                StrategyParameter("volume_filter", "bool", True, description="是否使用成交量过滤"),
                StrategyParameter("position_size", "float", 0.7, 0.3, 1.0, description="仓位大小"),
            ],
            gene_structure={
                "signal_type": "momentum",
                "indicators": ["price", "volume", "momentum"],
                "conditions": ["breakout", "volume_confirmation"],
                "risk_management": ["trailing_stop", "position_sizing"]
            },
            complexity_score=0.6,
            risk_level="medium"
        )
        
        # 4. 配对交易套利策略
        self.templates["pairs_trading"] = StrategyTemplate(
            id="pairs_trading",
            name="配对交易套利策略",
            category=StrategyCategory.ARBITRAGE,
            description="基于两只股票的统计套利机会进行交易",
            parameters=[
                StrategyParameter("pair_period", "int", 60, 30, 120, description="配对周期"),
                StrategyParameter("zscore_threshold", "float", 2.0, 1.5, 3.0, description="Z-score阈值"),
                StrategyParameter("exit_threshold", "float", 0.5, 0.2, 1.0, description="退出阈值"),
                StrategyParameter("correlation_min", "float", 0.7, 0.5, 0.9, description="最小相关性"),
                StrategyParameter("position_size", "float", 0.4, 0.2, 0.6, description="单边仓位大小"),
            ],
            gene_structure={
                "signal_type": "statistical_arbitrage",
                "indicators": ["correlation", "zscore", "spread"],
                "conditions": ["spread_deviation", "mean_reversion"],
                "risk_management": ["hedge_ratio", "stop_loss"]
            },
            complexity_score=0.8,
            risk_level="medium"
        )
        
        # 5. 事件驱动策略
        self.templates["event_driven"] = StrategyTemplate(
            id="event_driven",
            name="事件驱动策略",
            category=StrategyCategory.EVENT_DRIVEN,
            description="基于特定事件（如财报、公告）的交易策略",
            parameters=[
                StrategyParameter("event_type", "choice", "earnings", choices=["earnings", "announcement", "news"], description="事件类型"),
                StrategyParameter("holding_period", "int", 5, 1, 20, description="持有周期"),
                StrategyParameter("sentiment_threshold", "float", 0.6, 0.3, 0.9, description="情绪阈值"),
                StrategyParameter("volume_multiplier", "float", 1.5, 1.0, 3.0, description="成交量倍数"),
                StrategyParameter("position_size", "float", 0.5, 0.2, 0.8, description="仓位大小"),
            ],
            gene_structure={
                "signal_type": "event_based",
                "indicators": ["sentiment", "volume", "price_impact"],
                "conditions": ["event_trigger", "sentiment_filter"],
                "risk_management": ["time_stop", "position_sizing"]
            },
            complexity_score=0.7,
            risk_level="high"
        )
        
        # 6. 布林带策略
        self.templates["bollinger_bands"] = StrategyTemplate(
            id="bollinger_bands",
            name="布林带策略",
            category=StrategyCategory.TECHNICAL,
            description="基于布林带的突破和回归信号进行交易",
            parameters=[
                StrategyParameter("period", "int", 20, 10, 50, description="布林带周期"),
                StrategyParameter("std_dev", "float", 2.0, 1.5, 3.0, description="标准差倍数"),
                StrategyParameter("entry_threshold", "float", 0.1, 0.05, 0.2, description="入场阈值"),
                StrategyParameter("exit_threshold", "float", 0.0, -0.1, 0.1, description="出场阈值"),
                StrategyParameter("position_size", "float", 0.6, 0.3, 0.9, description="仓位大小"),
            ],
            gene_structure={
                "signal_type": "volatility_breakout",
                "indicators": ["bollinger_bands", "volume"],
                "conditions": ["upper_band_touch", "lower_band_touch", "middle_band_cross"],
                "risk_management": ["stop_loss", "take_profit"]
            },
            complexity_score=0.5,
            risk_level="medium"
        )
        
        # 7. MACD策略
        self.templates["macd"] = StrategyTemplate(
            id="macd",
            name="MACD策略",
            category=StrategyCategory.TECHNICAL,
            description="基于MACD指标的趋势跟踪策略",
            parameters=[
                StrategyParameter("fast_ema", "int", 12, 8, 20, description="快EMA周期"),
                StrategyParameter("slow_ema", "int", 26, 20, 40, description="慢EMA周期"),
                StrategyParameter("signal_ema", "int", 9, 5, 15, description="信号线EMA周期"),
                StrategyParameter("histogram_threshold", "float", 0.001, 0.0001, 0.01, description="柱状图阈值"),
                StrategyParameter("position_size", "float", 0.5, 0.2, 0.8, description="仓位大小"),
            ],
            gene_structure={
                "signal_type": "trend_following",
                "indicators": ["macd", "signal_line", "histogram"],
                "conditions": ["macd_crossover", "signal_crossover", "divergence"],
                "risk_management": ["stop_loss", "position_sizing"]
            },
            complexity_score=0.4,
            risk_level="low"
        )
        
        # 8. 波动率突破策略
        self.templates["volatility_breakout"] = StrategyTemplate(
            id="volatility_breakout",
            name="波动率突破策略",
            category=StrategyCategory.VOLATILITY,
            description="基于波动率突破的价格趋势策略",
            parameters=[
                StrategyParameter("atr_period", "int", 14, 5, 30, description="ATR周期"),
                StrategyParameter("atr_multiplier", "float", 2.0, 1.0, 4.0, description="ATR倍数"),
                StrategyParameter("breakout_period", "int", 20, 10, 40, description="突破周期"),
                StrategyParameter("volume_filter", "bool", True, description="成交量过滤"),
                StrategyParameter("position_size", "float", 0.6, 0.3, 0.9, description="仓位大小"),
            ],
            gene_structure={
                "signal_type": "volatility_breakout",
                "indicators": ["atr", "volatility", "volume"],
                "conditions": ["volatility_expansion", "price_breakout"],
                "risk_management": ["atr_stop", "position_sizing"]
            },
            complexity_score=0.6,
            risk_level="medium"
        )
    
    def get_template(self, template_id: str) -> Optional[StrategyTemplate]:
        """获取策略模板"""
        return self.templates.get(template_id)
    
    def get_templates_by_category(self, category: StrategyCategory) -> List[StrategyTemplate]:
        """按类别获取策略模板"""
        return [t for t in self.templates.values() if t.category == category]
    
    def get_a_share_compatible_templates(self) -> List[StrategyTemplate]:
        """获取兼容A股的模板"""
        return [t for t in self.templates.values() if t.a_share_compatible]
    
    def get_templates_by_risk_level(self, risk_level: str) -> List[StrategyTemplate]:
        """按风险等级获取模板"""
        return [t for t in self.templates.values() if t.risk_level == risk_level]
    
    def get_random_template(self, category: Optional[StrategyCategory] = None, 
                          risk_level: Optional[str] = None,
                          a_share_only: bool = True) -> StrategyTemplate:
        """获取随机模板"""
        candidates = list(self.templates.values())
        
        if category:
            candidates = [t for t in candidates if t.category == category]
        if risk_level:
            candidates = [t for t in candidates if t.risk_level == risk_level]
        if a_share_only:
            candidates = [t for t in candidates if t.a_share_compatible]
        
        if not candidates:
            raise ValueError("No matching templates found")
        
        return random.choice(candidates)
    
    def generate_strategy_gene(self, template_id: str, custom_params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """基于模板生成策略基因"""
        template = self.get_template(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")
        
        # 生成或使用自定义参数
        if custom_params:
            if not template.validate_params(custom_params):
                raise ValueError("Invalid custom parameters")
            params = custom_params
        else:
            params = template.generate_random_params()
        
        # 构建基因结构
        gene = {
            "template_id": template_id,
            "template_name": template.name,
            "category": template.category.value,
            "parameters": params,
            "gene_structure": template.gene_structure,
            "complexity_score": template.complexity_score,
            "risk_level": template.risk_level,
            "a_share_compatible": template.a_share_compatible,
            "generation_method": "template_based"
        }
        
        return gene
    
    def list_templates(self) -> List[Dict[str, Any]]:
        """列出所有模板信息"""
        return [
            {
                "id": t.id,
                "name": t.name,
                "category": t.category.value,
                "description": t.description,
                "complexity_score": t.complexity_score,
                "risk_level": t.risk_level,
                "a_share_compatible": t.a_share_compatible,
                "parameter_count": len(t.parameters)
            }
            for t in self.templates.values()
        ]


# 全局模板库实例
strategy_template_library = StrategyTemplateLibrary()