# run_live.py
from src.core.live_cabinet import LiveCabinet
from src.utils.config_loader import ConfigLoader
import os

def main():
    # Load Config
    config = ConfigLoader()
    live_enabled = config.get("system.enable_live", True)
    if not live_enabled:
        print("⛔ Live功能已在配置文件中关闭（system.enable_live=false）")
        return
    
    # Priority: Env Var > Config File > Default
    
    # 1. Targets
    stock_code = config.get("targets")[0] if config.get("targets") else "601899.SH"
    
    # 2. Data Provider
    # Env var overrides config
    env_provider = os.environ.get("DATA_PROVIDER", "").lower()
    tushare_token = os.environ.get("TUSHARE_TOKEN", "") or config.get("data_provider.tushare_token")
    
    if env_provider:
        provider = env_provider
    else:
        provider = config.get("data_provider.source", "akshare")
        
    # Auto-switch to tushare if token exists and provider is tushare
    if provider == 'tushare' and not tushare_token:
        print("⚠️ Tushare selected but no token found. Falling back to Akshare.")
        provider = 'akshare'
        
    print(f"🔌 Selected Data Provider: {provider}")
    print(f"🎯 Target Stock: {stock_code}")
    
    # 3. Capital
    initial_capital = config.get("system.initial_capital", 1000000.0)
    
    cabinet = LiveCabinet(
        stock_code, 
        initial_capital=initial_capital,
        provider_type=provider, 
        tushare_token=tushare_token
    )
    cabinet.run_live()

if __name__ == "__main__":
    main()
