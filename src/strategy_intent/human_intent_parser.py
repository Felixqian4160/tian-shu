from src.strategy_intent.strategy_intent import StrategyIntent


class HumanIntentParser:
    def parse(self, text):
        raw = str(text or "").strip()
        if not raw:
            raise ValueError("human input is required")
        lower = raw.lower()
        indicators = []
        indicator_map = {
            "ma": "MA",
            "均线": "MA",
            "ema": "EMA",
            "macd": "MACD",
            "rsi": "RSI",
            "布林": "BOLL",
            "boll": "BOLL",
            "atr": "ATR",
            "成交量": "VOLUME",
            "volume": "VOLUME"
        }
        for k, v in indicator_map.items():
            if k in lower and v not in indicators:
                indicators.append(v)
        strategy_type = "trend_following"
        if "均值回归" in raw or "回归" in raw or "reversion" in lower:
            strategy_type = "mean_reversion"
        elif "突破" in raw or "breakout" in lower:
            strategy_type = "breakout"
        risk_profile = "balanced"
        if "激进" in raw or "高风险" in raw or "aggressive" in lower:
            risk_profile = "aggressive"
        elif "保守" in raw or "低风险" in raw or "conservative" in lower:
            risk_profile = "conservative"
        entry = "满足主逻辑时开仓"
        if "入场" in raw:
            entry = "按用户描述的入场条件执行"
        exit_rule = "反向信号或风控触发时平仓"
        if "止盈" in raw or "止损" in raw:
            exit_rule = "按用户止盈止损要求平仓"
        intent = StrategyIntent(
            source="human",
            strategy_type=strategy_type,
            logic=raw,
            indicators=indicators,
            entry=entry,
            exit=exit_rule,
            risk_profile=risk_profile,
            confidence=0.72
        )
        intent.validate()
        return intent
