from dataclasses import dataclass, field


@dataclass
class StrategyIntent:
    source: str
    strategy_type: str
    logic: str
    indicators: list[str] = field(default_factory=list)
    entry: str = ""
    exit: str = ""
    risk_profile: str = "balanced"
    confidence: float = 0.5

    def to_dict(self):
        return {
            "source": self.source,
            "strategy_type": self.strategy_type,
            "logic": self.logic,
            "indicators": list(self.indicators),
            "entry": self.entry,
            "exit": self.exit,
            "risk_profile": self.risk_profile,
            "confidence": float(self.confidence)
        }

    @classmethod
    def from_dict(cls, payload):
        if not isinstance(payload, dict):
            raise ValueError("strategy_intent must be a dict")
        confidence = float(payload.get("confidence", 0.0) or 0.0)
        confidence = max(0.0, min(1.0, confidence))
        indicators = payload.get("indicators", [])
        if not isinstance(indicators, list):
            indicators = []
        source = str(payload.get("source", "")).strip().lower()
        if source not in {"human", "market"}:
            raise ValueError("strategy_intent.source must be human or market")
        return cls(
            source=source,
            strategy_type=str(payload.get("strategy_type", "")).strip(),
            logic=str(payload.get("logic", "")).strip(),
            indicators=[str(x).strip() for x in indicators if str(x).strip()],
            entry=str(payload.get("entry", "")).strip(),
            exit=str(payload.get("exit", "")).strip(),
            risk_profile=str(payload.get("risk_profile", "balanced")).strip() or "balanced",
            confidence=confidence
        )

    def validate(self):
        if self.source not in {"human", "market"}:
            raise ValueError("strategy_intent.source must be human or market")
        if not self.strategy_type:
            raise ValueError("strategy_intent.strategy_type is required")
        if not self.logic:
            raise ValueError("strategy_intent.logic is required")
        if not self.entry:
            raise ValueError("strategy_intent.entry is required")
        if not self.exit:
            raise ValueError("strategy_intent.exit is required")
        if not isinstance(self.indicators, list):
            raise ValueError("strategy_intent.indicators must be list")
        if not 0.0 <= float(self.confidence) <= 1.0:
            raise ValueError("strategy_intent.confidence must be in [0,1]")
        return True

    def explain(self):
        indicators = "、".join(self.indicators) if self.indicators else "无"
        return (
            f"来源={self.source}; 类型={self.strategy_type}; 逻辑={self.logic}; "
            f"指标={indicators}; 入场={self.entry}; 出场={self.exit}; "
            f"风格={self.risk_profile}; 置信度={float(self.confidence):.2f}"
        )
