from src.strategy_intent.human_intent_parser import HumanIntentParser
from src.strategy_intent.market_intent_generator import MarketIntentGenerator
from src.strategy_intent.strategy_intent import StrategyIntent


class StrategyIntentEngine:
    def __init__(self):
        self.human_parser = HumanIntentParser()
        self.market_generator = MarketIntentGenerator()

    def from_human_input(self, text):
        intent = self.human_parser.parse(text)
        intent.validate()
        return intent

    def from_market_analysis(self, market_state):
        intent = self.market_generator.generate(market_state)
        intent.validate()
        return intent

    def normalize(self, payload):
        intent = StrategyIntent.from_dict(payload)
        intent.validate()
        return intent
