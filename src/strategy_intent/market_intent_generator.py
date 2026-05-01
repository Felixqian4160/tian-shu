from src.strategy_intent.strategy_intent import StrategyIntent


class MarketIntentGenerator:
    def generate(self, market_state):
        state = market_state if isinstance(market_state, dict) else {}
        trend = str(state.get("trend", "")).strip().lower()
        volatility = str(state.get("volatility", "")).strip().lower()
        momentum = str(state.get("momentum", "")).strip().lower()
        strategy_type = "trend_following"
        logic = "行情结构不明确，使用均衡趋势策略"
        indicators = ["MA", "MACD"]
        entry = "趋势确认后开仓"
        exit_rule = "趋势反转或风险触发时平仓"
        risk_profile = "balanced"
        confidence = 0.6
        if trend in {"up", "bull", "上涨", "多头"}:
            strategy_type = "trend_following"
            logic = "市场处于上行趋势，偏向顺势做多"
            indicators = ["MA", "MACD", "VOLUME"]
            entry = "均线金叉且量能放大时开多"
            exit_rule = "均线死叉或回撤超限时平仓"
            confidence = 0.82
        elif trend in {"down", "bear", "下跌", "空头"}:
            strategy_type = "defensive_rebound"
            logic = "市场处于下行趋势，采用防守反弹策略"
            indicators = ["RSI", "BOLL", "ATR"]
            entry = "超跌反弹并突破布林中轨时轻仓试多"
            exit_rule = "反弹失败或触发ATR止损时平仓"
            risk_profile = "conservative"
            confidence = 0.74
        if volatility in {"high", "高", "高波动"}:
            risk_profile = "conservative"
            confidence = max(0.55, confidence - 0.12)
        elif volatility in {"low", "低", "低波动"} and trend in {"up", "bull", "上涨", "多头"}:
            risk_profile = "aggressive"
            confidence = min(0.95, confidence + 0.05)
        if momentum in {"weak", "弱"}:
            confidence = max(0.45, confidence - 0.08)
        elif momentum in {"strong", "强"}:
            confidence = min(0.95, confidence + 0.06)
        intent = StrategyIntent(
            source="market",
            strategy_type=strategy_type,
            logic=logic,
            indicators=indicators,
            entry=entry,
            exit=exit_rule,
            risk_profile=risk_profile,
            confidence=confidence
        )
        intent.validate()
        return intent
