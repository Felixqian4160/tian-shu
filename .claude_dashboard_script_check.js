
        window.__frontendStaticAssetSkipAll = false;
        window.__frontendStaticAssetDecisionKey = '__frontend_static_asset_allow_remote__';
        window.__frontendStaticAssetAllowRemoteMap = (function () {
            try {
                const raw = localStorage.getItem(window.__frontendStaticAssetDecisionKey);
                const parsed = raw ? JSON.parse(raw) : {};
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch (_) {
                return {};
            }
        })();
        window.__frontendStaticAssetSaveDecision = function () {
            try {
                localStorage.setItem(
                    window.__frontendStaticAssetDecisionKey,
                    JSON.stringify(window.__frontendStaticAssetAllowRemoteMap || {})
                );
            } catch (_) {}
        };
        window.__frontendStaticAssetTryCache = async function (relativePath, remoteUrl) {
            try {
                const res = await fetch('/api/frontend/cache_asset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ relative_path: relativePath, remote_url: remoteUrl })
                });
                const data = await res.json();
                if (res.ok && data && data.status === 'success' && data.local_url) {
                    return `${data.local_url}?v=${Date.now()}`;
                }
            } catch (_) {}
            return '';
        };
        window.__frontendStaticAssetHandleError = async function (el, localPath, remoteUrl, label) {
            if (!el || !remoteUrl || !localPath) return;
            if (window.__frontendStaticAssetSkipAll) return;
            const showLabel = String(label || '静态资源');
            const decisionMap = window.__frontendStaticAssetAllowRemoteMap || {};
            const hasAllowed = decisionMap[localPath] === true;
            if (!hasAllowed) {
                const useRemote = window.confirm(`${showLabel} 本地缓存不存在，是否联网加载？\n点击“取消”将跳过后续外部资源加载提示。`);
                if (!useRemote) {
                    window.__frontendStaticAssetSkipAll = true;
                    window.alert(`已跳过外部资源加载。当前页面可能缺少 ${showLabel} 的样式或功能。`);
                    return;
                }
                decisionMap[localPath] = true;
                window.__frontendStaticAssetSaveDecision();
            }
            const cachedLocalUrl = await window.__frontendStaticAssetTryCache(localPath, remoteUrl);
            const finalUrl = cachedLocalUrl || remoteUrl;
            if (el.tagName === 'LINK') {
                el.onerror = null;
                el.href = finalUrl;
                return;
            }
            if (el.tagName === 'SCRIPT') {
                el.onerror = null;
                el.src = finalUrl;
            }
        };
    






        window.tailwind = window.tailwind || {};
        window.tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        'trading-bg': '#0f172a', // Slate 900
                        'trading-card': '#1e293b', // Slate 800
                        'trading-green': '#10b981', // Emerald 500
                        'trading-red': '#f43f5e', // Rose 500
                        'trading-yellow': '#f59e0b', // Amber 500
                        'trading-blue': '#3b82f6', // Blue 500
                        'trading-dim': '#64748b', // Slate 500
                    },
                    fontFamily: {
                        sans: ['Inter', 'sans-serif'],
                        mono: ['JetBrains Mono', 'monospace'],
                    },
                    animation: {
                        'pulse-fast': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                        'glow': 'glow 2s ease-in-out infinite alternate',
                    },
                    keyframes: {
                        glow: {
                            '0%': { boxShadow: '0 0 5px rgba(59, 130, 246, 0.2)' },
                            '100%': { boxShadow: '0 0 15px rgba(59, 130, 246, 0.6)' },
                        }
                    }
                }
            }
        }
    


        // System State
        const SYSTEM_STATE = {
            stock: '301227.SZ',
            price: 0,
            assets: 1000000,
            strategy: 'Trend Follow',
            logs: []
        };

        // --- WebSocket Integration ---
        let ws = null;
        let wsReconnectTimer = null;
        let wsHeartbeatTimer = null;
        let wsReconnectAttempts = 0;
        let wsLastPongAt = 0;
        let statusSyncInFlight = false;
        const WS_HEARTBEAT_INTERVAL_MS = 15000;
        const WS_STALE_TIMEOUT_MS = 180000;
        const WS_RECONNECT_MAX_DELAY_MS = 10000;
        const RENDER_LOOP_INTERVAL_MS = 50;
        const RENDER_HIGH_BUDGET = 20;
        const RENDER_NORMAL_BUDGET = 30;
        const RENDER_QUEUE_MAX = 1500;
        const RENDER_CRITICAL_TYPES = new Set(['system', 'backtest_result', 'backtest_failed', 'backtest_strategy_report', 'menxia', 'shangshu']);
        const RENDER_COALESCE_TYPES = new Set(['market', 'live_tick', 'ministry_tick', 'backtest_progress']);
        const BACKTEST_STREAM_TYPES = new Set(['backtest_progress', 'backtest_flow', 'backtest_trade', 'ministry_tick']);
        const renderHighQueue = [];
        const renderNormalQueue = [];
        const renderCoalesceMap = new Map();
        let renderLoopTimer = null;
        let strategyReportsBuffer = [];
        let batchOverviewPayload = null;
        let batchRunStatusPayload = null;
        let batchRunPollTimer = null;
        let batchStartPendingDashboard = false;
        let batchStartPendingUi = false;
        let batchDashboardTaskRows = [];
        let batchDashboardTaskSelectedId = '';
        let batchTaskCsvListRows = [];
        let batchComboRecommendPending = false;
        const DEFAULT_TASKS_CSV = 'data/batch_tasks/批量回测任务.csv';
        const DEFAULT_ARCHIVE_TASKS_CSV = 'data/batch_tasks/archive/批量回测任务.archive.csv';
        let evolutionLastState = null;
        let evolutionLastActivity = null;
        let evolutionPlatformTab = 'runtime';
        let evolutionPlatformOverview = null;
        let evolutionPlatformRiskOverview = null;
        let evolutionPlatformDeploymentRows = [];
        let evolutionPlatformAlertRows = [];
        let evolutionPlatformAlertStats = null;
        let evolutionPlatformBackupStatus = null;
        let evolutionPlatformRecoveryStats = null;
        let evolutionPlatformLastRealtimeAt = '';
        let evolutionHistoryRows = [];
        let evolutionTopRows = [];
        let evolutionFamilyStatsRows = [];
        let evolutionProfileUpdateRows = [];
        let evolutionFamilyStatsEnabled = false;
        let evolutionFamilyStatsError = '';
        let evolutionFamilyWeightsSnapshot = null;
        let evolutionFamilyAlertThresholdOverride = '';
        let evolutionFamilyAlertPreset = 'balanced';
        let evolutionRunRows = [];
        let evolutionRunsTotal = 0;
        let evolutionRunsPage = 1;
        let evolutionRunsPageSize = 20;
        let evolutionRunsLastEnabled = false;
        let evolutionRunsDebounceTimer = null;
        let evolutionRunsLastRequestSeq = 0;
        let evolutionLogRows = [];
        let evolutionLastRunning = null;
        let evolutionStartPending = false;
        let evolutionStopPending = false;
        let evolutionProfileUpdatePending = false;
        let evolutionStopConfirmUntil = 0;
        let evolutionStopConfirmTimer = null;
        let evolutionConcurrencyTimer = null;
        let liveRunning = false;
        let liveEnabled = window.__LIVE_ENABLED__ === true;
        let liveActionPending = false;
        let liveLastError = null;
        let pendingLiveStrategyProfiles = null;
        let currentSource = 'default';
        let strategyCatalog = [];
        let selectedStrategyIds = [];
        let strategyPanelTempSelectedIds = [];
        let evolutionSeedTempSelectedIds = [];
        let evolutionSeedAllowTopFallback = true;
        let latestStrategyScores = {};
        let backtestResultRecovered = false;
        let historySyncRunning = false;
        let historySyncSchedulerRunning = false;
        let historySyncStopRequested = false;
        let strategyManagerRows = [];
        let strategyManagerDetailId = null;
        let strategyManagerEditingId = null;
        let strategyEditMode = 'edit';
        let strategyDeletePendingId = null;
        let strategyRegimeHintTimer = null;
        let strategyRegimeLastKey = '';
        let strategyRegimeLastAt = 0;
        let strategyRegimeSnapshot = null;
        let strategyManagerSortByPosition = false;
        let strategyManagerSortDirection = 'desc';
        let strategyManagerPage = 1;
        let strategyManagerPageSize = 20;
        let strategyManagerTotal = 0;
        let pendingGeneratedStrategy = null;
        let actionLayoutMode = 'expanded';
        let rightPanelPrefs = { strategy: true, console: true, stream: true };
        let rightLayoutPreset = 'balanced';
        let liveFundPoolSelectedCode = '';
        let liveFundPoolSelectionTouched = false;
        let liveFundTradeRows = [];
        let liveFundLastFetchAt = 0;
        let liveFundCurveMetric = 'fund_value';
        const FUND_POOL_PORTFOLIO_KEY = '__PORTFOLIO__';
        const LIVE_ACCOUNT_GLOBAL_KEY = '__GLOBAL__';
        const liveFundCurveMap = {};
        const liveAccountSnapshotMap = {};
        let fundPoolModalOpen = false;
        let panelHeightPrefs = { strategy: null, console: null, stream: null };
        let klineModalTimer = null;
        let klineModalOpened = false;
        let currentBacktestChartCtx = null;
        let klineLastProgressDate = null;
        let klineHasRenderedData = false;
        let klinePreloadKey = null;
        let klinePreloadPayload = null;
        let klinePreloadInFlightKey = '';
        let klinePreloadInFlightPromise = null;
        let klinePreloadLastRequestAt = 0;
        let klineRealtimeMarkers = [];
        let klineLoadingShownAt = 0;
        let klineChart = null;
        let klineCandlesSeries = null;
        let klineVolumeSeries = null;
        const STRATEGY_CODE_TEMPLATE_DEFAULT = `from src.strategies.implemented_strategies import BaseImplementedStrategy
import pandas as pd
from src.utils.indicators import Indicators

class GeneratedStrategyTemplate(BaseImplementedStrategy):
    def __init__(self):
        super().__init__("{{STRATEGY_ID}}", "{{STRATEGY_NAME}}", trigger_timeframe="1min")
        self.history = {}
        self.last_buy_day = {}

    def on_bar(self, kline):
        code = kline['code']
        if code not in self.history:
            self.history[code] = pd.DataFrame()
        self.history[code] = pd.concat([self.history[code], pd.DataFrame([kline])], ignore_index=True).tail(2000)
        df = self.history[code]
        if len(df) < 80:
            return None
        close_series = pd.to_numeric(df['close'], errors='coerce').dropna()
        if len(close_series) < 80:
            return None
        ma_fast = Indicators.MA(close_series, 12)
        ma_slow = Indicators.MA(close_series, 36)
        if len(ma_fast) < 2 or len(ma_slow) < 2:
            return None
        qty = int(self.positions.get(code, 0))
        close = float(kline['close'])
        buy_qty = int(self._qty())
        if buy_qty <= 0:
            return None
        if buy_qty % 100 != 0:
            buy_qty = (buy_qty // 100) * 100
        if buy_qty < 100:
            return None
        if qty <= 0 and float(ma_fast.iloc[-2]) <= float(ma_slow.iloc[-2]) and float(ma_fast.iloc[-1]) > float(ma_slow.iloc[-1]):
            self.last_buy_day[code] = str(pd.to_datetime(kline['dt'], errors='coerce').strftime('%Y-%m-%d'))
            return {
                'strategy_id': self.id,
                'code': code,
                'dt': kline['dt'],
                'direction': 'BUY',
                'price': close,
                'qty': buy_qty,
                'stop_loss': close * 0.97,
                'take_profit': None
            }
        curr_day = str(pd.to_datetime(kline['dt'], errors='coerce').strftime('%Y-%m-%d'))
        if qty > 0 and self.last_buy_day.get(code) == curr_day:
            return None
        if qty > 0 and float(ma_fast.iloc[-2]) >= float(ma_slow.iloc[-2]) and float(ma_fast.iloc[-1]) < float(ma_slow.iloc[-1]):
            return self.create_exit_signal(kline, qty, "MA Cross Exit")
        return None`;
        const DIAG_STATE = {
            wsConnected: false,
            apiLatencyMs: null,
            tickTriggerText: '--',
            tickStrategyText: '--',
            signalConsistency: 50,
            riskApproved: 0,
            riskRejected: 0,
            riskRejects: [],
            liveAlerts: [],
            liveAlertSeq: 0,
            liveAlertFilter: 'all',
            liveMonitor: {
                daily_drawdown: 0,
                single_position_weight: 0,
                turnover_rate: 0,
                signal_consistency: 50,
                api_latency_ms: null
            },
            liveKlineFreshnessMap: {},
            liveFundPools: {},
            recentPnls: [],
            backtestSummaryWinRate: null,
            backtestReportWinRate: null,
            confidenceSeries: {
                consistency: [],
                passrate: [],
                winrate: []
            }
        };
        const BT_STATE = {
            progress: -1,
            totalTrades: 0,
            approvedSignals: 0,
            rejectedSignals: 0,
            latestPrice: null,
            lastFlowAt: null
        };
        const BACKTEST_BTN_STATE = {
            idle: 'idle',
            running: 'running',
            error: 'error'
        };
        let backtestBtnState = BACKTEST_BTN_STATE.idle;
        let backtestStatusMonitorTimer = null;
        let backtestMonitorErrorCount = 0;
        let backtestNoRunningTicks = 0;
        let backtestStreamClosed = false;
        let currentBacktestReportId = '';
        let backtestStartInFlight = false;
        let backtestStopInFlight = false;
        let disclaimerAccepted = false;
        const DISCLAIMER_SKIP_ONCE_KEY = 'jince-disclaimer-skip-once-v1';
        const DISCLAIMER_ACCEPT_KEY = 'jince-disclaimer-accepted-v1';
        const DISCLAIMER_FORCE_RECHECK_KEY = 'jince-disclaimer-force-recheck-v1';
        const DISCLAIMER_LAST_BOOT_KEY = 'jince-disclaimer-last-boot-v1';
        const EVOLUTION_FAMILY_ALERT_THRESHOLD_KEY = 'jince-evolution-family-alert-threshold-v1';
        const EVOLUTION_FAMILY_ALERT_PRESET_KEY = 'jince-evolution-family-alert-preset-v1';
        const DISCLAIMER_ACCEPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
        let currentServerBootId = '';
        const STRATEGY_GUIDE = {
            all: {
                name: '全部策略总览',
                trigger: '多周期并行（按各策略trigger_timeframe）',
                entry_rules: ['所有策略并行评估入场条件，命中后进入统一风控审核。'],
                exit_rules: ['策略各自触发离场条件后，由执行模块模拟成交。'],
                params: ['每次信号默认下单数量：1000股（各策略当前实现）'],
                note: '适合先观察系统联动与策略分歧程度。',
                example: '示例：若07与01同向看多，信号一致性提升；若方向分歧，置信度会下降。'
            },
            '00': {
                name: '00 长期持有一次买入',
                trigger: '日线',
                entry_rules: [
                    '仅在首次触发时买入一次。',
                    '买入后不再重复加仓。'
                ],
                exit_rules: ['到达回测最后一根K线时一次性全部卖出。'],
                params: ['下单数量：strategy_params.common.order_qty（默认1000）'],
                note: '该策略仅用于回测基准对照，模拟买入并持有到回测结束。',
                example: '示例：第一根K线买入后全程持有，最后一根K线自动平仓。'
            },
            '01': {
                name: '01 三周期共振波段',
                trigger: '60分钟',
                entry_rules: [
                    '周线MA20上升（最近两根周线MA20：最新 > 上一根）。',
                    '日线回踩条件：|日线最低价 - 日线MA10| / 日线MA10 < 2%。',
                    '60分钟MACD金叉：当前DIF > DEA 且上一根DIF <= DEA。',
                    '60分钟放量：当前成交量 > 近5根60分钟均量。'
                ],
                exit_rules: ['持仓后若日线收盘价 < 日线MA20，则卖出离场。'],
                params: ['止损价：买入价 * 0.97', '止盈：无固定止盈'],
                note: '数据窗口要求较高：至少500根基础K线、20根日线/周线、35根60分钟线。',
                example: '示例：周线趋势向上 + 日线靠近MA10 + 60分钟金叉放量 -> 触发买入。'
            },
            '02': {
                name: '02 短线弱转强烂板',
                trigger: '1分钟',
                entry_rules: ['当前代码实现中无入场条件（不会主动买入）。'],
                exit_rules: ['已有持仓时，持仓bar数 >= 240则卖出（Next Day Exit）。'],
                params: ['最大持有：240个触发bar'],
                note: '该策略当前版本主要保留离场框架，入场逻辑待补充。',
                example: '示例：若外部已有仓位，达到240个bar后强制离场。'
            },
            '03': {
                name: '03 ETF行业轮动',
                trigger: '日线',
                entry_rules: ['日线收盘价 > 日线MA10 -> 买入。'],
                exit_rules: ['持仓后若日线收盘价 < 日线MA10 -> 卖出。'],
                params: ['止损价：买入价 * 0.95', '止盈：无固定止盈'],
                note: '至少需要10根日线数据；当前实现名称为ETF轮动，但对单标的也可运行。',
                example: '示例：日线重新站上MA10建仓，跌破MA10离场。'
            },
            '04': {
                name: '04 龙头首阴反包',
                trigger: '日线',
                entry_rules: ['当前代码实现中无入场逻辑（on_bar 直接返回 None）。'],
                exit_rules: ['当前代码实现中无离场逻辑。'],
                params: ['无'],
                note: '该策略尚未实现，属于占位策略。',
                example: '示例：当前版本不会产生任何交易信号。'
            },
            '05': {
                name: '05 3N法则主升浪',
                trigger: '30分钟',
                entry_rules: [
                    '30分钟MACD多头：DIF > DEA 且 DIF > 0。',
                    '30分钟放量：当前成交量 > 近5根30分钟均量 * 1.5。'
                ],
                exit_rules: ['持仓后若持有bar数 >= 1200，则按时间离场（Time 5 Days）。'],
                params: ['止损价：买入价 * 0.95', '止盈价：买入价 * 1.10'],
                note: '至少需要20根30分钟数据。',
                example: '示例：30分钟水上金叉且明显放量时买入，达到时长或止盈止损后离场。'
            },
            '06': {
                name: '06 海豚交易法',
                trigger: '1分钟',
                entry_rules: [
                    '趋势过滤：当前价 > MA26。',
                    'MACD金叉：当前DIF > DEA 且上一根DIF <= 上一根DEA。',
                    '水上金叉：当前DIF > 0 且 当前DEA > 0。'
                ],
                exit_rules: ['持仓后使用1%追踪止损：当前低点 <= 追踪止损价则卖出。'],
                params: ['初始止损：买入价 * 0.99', '追踪止损：最高价 * 0.99'],
                note: '至少需要50根基础K线。',
                example: '示例：上穿MA26并出现水上金叉入场，后续按最高价动态抬升止损线。'
            },
            '07': {
                name: '07 跳空交易系统',
                trigger: '15分钟',
                entry_rules: [
                    '跳空低开：当前15分钟open < 上一根15分钟close * 0.998。',
                    '阳线确认：当前15分钟close > 当前15分钟open。'
                ],
                exit_rules: ['持仓后使用1%追踪止损：当前价 <= 追踪止损价则卖出。'],
                params: ['初始止损：买入价 * 0.99', '追踪止损：最高价 * 0.99'],
                note: '至少需要20根15分钟数据。',
                example: '示例：15分钟出现低开反包阳线后入场，随后按追踪止损管理仓位。'
            },
            '08': {
                name: '08 神奇九转',
                trigger: '1分钟',
                entry_rules: [
                    '九连条件：最近9根K线均满足 close[i] > close[i-4]。',
                    '强化校验：第5根 > 第1根，且第9根 > 第5根。'
                ],
                exit_rules: ['持仓后使用1%追踪止损：当前收盘价 <= 追踪止损价则卖出。'],
                params: ['初始止损：买入价 * 0.99', '追踪止损：最高价 * 0.99'],
                note: '至少需要13根基础K线（9根序列 + 4根比较滞后）。',
                example: '示例：九连条件和强化校验同时满足后入场，回落触发追踪止损时离场。'
            },
            '09': {
                name: '09 箱体降本策略',
                trigger: '日线',
                entry_rules: [
                    '箱体基准：最近240根日线（不含当根）计算上轨/下轨。',
                    '底仓建仓：价格位于箱体下半区且RSI低于阈值时，优先补到基础仓位。',
                    '机动低吸：价格接近下轨且RSI超卖时，分批加机动仓。'
                ],
                exit_rules: [
                    '机动高抛：价格接近上轨且RSI超买时，优先卖出机动仓。',
                    '跌破止损：价格跌破箱体下轨一定比例时，清仓并停用该策略。',
                    '上破停用：价格突破箱体上轨一定比例时，停止继续加减仓。'
                ],
                params: ['箱体周期: 240', '突破阈值: 5%', 'RSI: 14', '超卖/超买: 30/70', '底仓/机动仓: 可配置'],
                note: '策略09按日线触发，适合震荡区间做降本和仓位再平衡。',
                example: '示例：日线接近下轨且RSI=28分批低吸，价格回到上轨附近且RSI>70后高抛机动仓。'
            }
        };
        const STRATEGY_FALLBACK = [
            { id: '00', name: '长期持有一次买入' },
            { id: '01', name: '三周期共振波段' },
            { id: '02', name: '短线弱转强烂板' },
            { id: '03', name: 'ETF行业轮动' },
            { id: '04', name: '龙头首阴反包' },
            { id: '05', name: '3N法则主升浪' },
            { id: '06', name: '海豚交易法' },
            { id: '07', name: '跳空交易系统' },
            { id: '08', name: '神奇九转' },
            { id: '09', name: '箱体降本策略' }
        ];
        const CLASSIC_PATTERNS = [
            { id: 'p1', patternName: '单边大牛市（主升浪）', stockName: '上纬新材', stockCode: '688585', start: '2025-07-09', end: '2025-12-31' },
            { id: 'p2', patternName: '单边大熊市（主跌浪）', stockName: '仕净科技', stockCode: '301030', start: '2025-01-02', end: '2025-06-30' },
            { id: 'p3', patternName: '妖股连板脉冲（极端题材牛市）', stockName: '首开股份', stockCode: '600376', start: '2025-07-01', end: '2025-12-31' },
            { id: 'p4', patternName: '矩形箱体震荡（标准区间震荡）', stockName: '中国中免', stockCode: '601888', start: '2025-01-02', end: '2025-06-30' },
            { id: 'p5', patternName: '对称三角形整理（变盘形态）', stockName: '先导智能', stockCode: '300450', start: '2025-04-01', end: '2025-09-30' },
            { id: 'p6', patternName: '上升旗形（上涨中继）', stockName: '剑桥科技', stockCode: '603083', start: '2025-03-03', end: '2025-08-29' },
            { id: 'p7', patternName: '高位横盘强势整理', stockName: '中国移动', stockCode: '600941', start: '2025-07-01', end: '2025-12-31' },
            { id: 'p8', patternName: '下降楔形（诱空见底）', stockName: '中国石油', stockCode: '601857', start: '2025-01-02', end: '2025-06-30' },
            { id: 'p9', patternName: 'W底/双底反转（底部反转）', stockName: '东方日升', stockCode: '300118', start: '2025-06-02', end: '2025-11-28' },
            { id: 'p10', patternName: 'V型反转（熊转牛）', stockName: '立讯精密', stockCode: '002475', start: '2025-09-01', end: '2025-12-31' }
        ];
        let patternPickerRendered = false;
        let patternKlineCache = {};
        let patternThumbStatusTimer = null;
        const patternThumbReadyMap = {};
        
        function wsUrl() {
            const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
            return `${proto}://${window.location.host}/ws`;
        }

        function clearWsTimers() {
            if (wsHeartbeatTimer) {
                clearInterval(wsHeartbeatTimer);
                wsHeartbeatTimer = null;
            }
            if (wsReconnectTimer) {
                clearTimeout(wsReconnectTimer);
                wsReconnectTimer = null;
            }
        }

        function scheduleWsReconnect() {
            if (wsReconnectTimer) return;
            const delay = Math.min(WS_RECONNECT_MAX_DELAY_MS, 1000 * Math.max(1, wsReconnectAttempts));
            wsReconnectTimer = setTimeout(() => {
                wsReconnectTimer = null;
                connectWebSocket();
            }, delay);
        }

        function sendWsCommand(payload) {
            if (!ws || ws.readyState !== WebSocket.OPEN) return false;
            try {
                ws.send(JSON.stringify(payload));
                return true;
            } catch (_) {
                return false;
            }
        }

        function processRenderQueue() {
            if (renderCoalesceMap.size > 0) {
                for (const payload of renderCoalesceMap.values()) {
                    if (renderNormalQueue.length < RENDER_QUEUE_MAX) {
                        renderNormalQueue.push(payload);
                    }
                }
                renderCoalesceMap.clear();
            }
            let consumed = 0;
            while (renderHighQueue.length && consumed < RENDER_HIGH_BUDGET) {
                handleEvent(renderHighQueue.shift());
                consumed += 1;
            }
            consumed = 0;
            while (renderNormalQueue.length && consumed < RENDER_NORMAL_BUDGET) {
                handleEvent(renderNormalQueue.shift());
                consumed += 1;
            }
        }

        function ensureRenderLoop() {
            if (renderLoopTimer) return;
            const tick = () => {
                processRenderQueue();
                const hasPending = renderHighQueue.length || renderNormalQueue.length || renderCoalesceMap.size;
                if (!hasPending) {
                    renderLoopTimer = null;
                    return;
                }
                renderLoopTimer = setTimeout(tick, RENDER_LOOP_INTERVAL_MS);
            };
            renderLoopTimer = setTimeout(tick, 0);
        }

        function enqueueIncomingEvent(payload) {
            if (!payload || typeof payload !== 'object') return;
            if (backtestStreamClosed && BACKTEST_STREAM_TYPES.has(String(payload.type || ''))) return;
            handleEvent(payload);
        }

        function closeBacktestStream() {
            backtestStreamClosed = true;
            for (let i = renderHighQueue.length - 1; i >= 0; i--) {
                const x = renderHighQueue[i];
                if (x && BACKTEST_STREAM_TYPES.has(String(x.type || ''))) {
                    renderHighQueue.splice(i, 1);
                }
            }
            for (let i = renderNormalQueue.length - 1; i >= 0; i--) {
                const x = renderNormalQueue[i];
                if (x && BACKTEST_STREAM_TYPES.has(String(x.type || ''))) {
                    renderNormalQueue.splice(i, 1);
                }
            }
            for (const [k, x] of renderCoalesceMap.entries()) {
                if (x && BACKTEST_STREAM_TYPES.has(String(x.type || ''))) {
                    renderCoalesceMap.delete(k);
                }
            }
        }

        async function loadLatestStrategyScores() {
            await fetchGlobalStrategies();
        }

        function connectWebSocket() {
            clearWsTimers();
            try {
                ws = new WebSocket(wsUrl());
            } catch (_) {
                scheduleWsReconnect();
                return;
            }
            ws.onopen = () => {
                wsReconnectAttempts = 0;
                wsLastPongAt = Date.now();
                logMessage('SYSTEM', 'WebSocket 连接成功', 'system');
                DIAG_STATE.wsConnected = true;
                updateDebugPanel();
                loadStrategyManager();
                syncStatus();
                refreshEvolutionDashboard({ withHistory: true, withTop: true, withFamilyStats: true, withProfileUpdates: true });
                wsHeartbeatTimer = setInterval(() => {
                    if (!ws || ws.readyState !== WebSocket.OPEN) return;
                    if (Date.now() - wsLastPongAt > WS_STALE_TIMEOUT_MS) {
                        try { ws.close(); } catch (_) {}
                        return;
                    }
                    sendWsCommand({ type: 'ping', ts: Date.now() });
                }, WS_HEARTBEAT_INTERVAL_MS);
            };
            ws.onmessage = (event) => {
                wsLastPongAt = Date.now();
                let payload = null;
                try {
                    payload = JSON.parse(event.data);
                } catch (_) {
                    return;
                }
                if (payload && payload.type === 'pong') return;
                enqueueIncomingEvent(payload);
            };
            ws.onclose = () => {
                DIAG_STATE.wsConnected = false;
                updateDebugPanel();
                clearWsTimers();
                wsReconnectAttempts += 1;
                logMessage('SYSTEM', 'WebSocket 连接断开，正在自动重连...', 'danger');
                if (backtestBtnState === BACKTEST_BTN_STATE.running) {
                    logMessage('回测', '已切换为状态轮询，等待回测完成...', 'warning');
                    monitorBacktestTaskStatus();
                }
                scheduleWsReconnect();
            };
            ws.onerror = () => {};
        }
        connectWebSocket();

        function handleEvent(payload) {
            const { type, data } = payload;
            
            switch(type) {
                case 'system':
                    {
                        const msg = String(data?.msg || '');
                        const stock = String(data?.stock || data?.stock_code || '').toUpperCase();
                        const tf = String(data?.timeframe || '').trim();
                        const shouldAppend = msg.includes('正在拉取K线数据') && stock;
                        const tfText = tf ? (tf.toUpperCase() === 'D' ? '日线' : tf) : '';
                        const fullMsg = shouldAppend ? `${msg}${tfText ? `（${tfText}）` : ''}` : msg;
                        const eventClock = formatClockTime(data?.time || payload?.server_time || payload?.server_ts || '');
                        logMessage('SYSTEM', fullMsg, 'system', eventClock);
                    }
                    if ((data.msg || '').includes('回测完成')) {
                        closeBacktestStream();
                        setBacktestButtonState(BACKTEST_BTN_STATE.idle);
                    }
                    if ((data.msg || '').includes('回测已手动终止')) {
                        closeBacktestStream();
                        setBacktestButtonState(BACKTEST_BTN_STATE.idle);
                    }
                    if ((data.msg || '').includes('实时监控已启动')) {
                        liveRunning = true;
                        liveActionPending = false;
                        renderLiveStatus();
                    }
                    if ((data.msg || '').includes('已手动停止')) {
                        liveRunning = false;
                        liveActionPending = false;
                        renderLiveStatus();
                    }
                    break;
                case 'init_strategies':
                    applyLiveStrategySelection(data);
                    logMessage('SYSTEM', `已加载 ${data.length} 套内阁策略`, 'system');
                    break;
                case 'market':
                    updateMarket(data, payload.stock_code);
                    BT_STATE.latestPrice = Number(data.price || BT_STATE.latestPrice || 0);
                    pulsePanel('panel-gong');
                    break;
                case 'zhongshu':
                    updateCard('log-zhongshu', data.details, data.status);
                    logMessage('策略中心', data.msg, 'info');
                    pulsePanel('status-zhongshu');
                    pulsePanel('panel-zhongshu');
                    pulsePanel('panel-li');
                    break;
                case 'menxia':
                    updateCard('log-menxia', data.details, data.status);
                    logMessage('风控中心', data.msg, data.status.includes('green') ? 'success' : 'danger');
                    pulsePanel('status-menxia');
                    pulsePanel('panel-menxia');
                    pulsePanel('panel-xing');
                    if (data.decision === 'approved') {
                        DIAG_STATE.riskApproved += 1;
                        BT_STATE.approvedSignals += 1;
                        document.getElementById('rites-compliance-status').innerText = '通过';
                        document.getElementById('rites-compliance-status').className = 'text-trading-green';
                        updateConfidenceScore();
                    }
                    if (data.decision === 'rejected') {
                        DIAG_STATE.riskRejected += 1;
                        BT_STATE.rejectedSignals += 1;
                        document.getElementById('rites-compliance-status').innerText = '驳回';
                        document.getElementById('rites-compliance-status').className = 'text-trading-red';
                        const item = `[${getTime()}] [${data.strategy_id || '--'}] ${data.reason || data.msg || '风控拒绝'}`;
                        DIAG_STATE.riskRejects.unshift(item);
                        DIAG_STATE.riskRejects = DIAG_STATE.riskRejects.slice(0, 5);
                        updateDebugPanel();
                        updateConfidenceScore();
                    }
                    break;
                case 'shangshu':
                    updateCard('log-shangshu', data.details, data.status);
                    logMessage('执行中心', data.msg, 'warning');
                    pulsePanel('status-shangshu');
                    pulsePanel('panel-shangshu');
                    pulsePanel('panel-bing');
                    break;
                case 'account':
                    let latestAssets = null;
                    let latestCash = null;
                    let latestPosPct = null;
                    let latestPnlPct = null;
                    if (data.assets !== undefined && data.assets !== null) {
                        const assetNum = Number(data.assets);
                        if (Number.isFinite(assetNum)) latestAssets = assetNum;
                    }
                    if (data.pnl_pct !== undefined && data.pnl_pct !== null) {
                        const pnlPctNum = Number(data.pnl_pct);
                        if (Number.isFinite(pnlPctNum)) latestPnlPct = pnlPctNum;
                    } else if (data.pnl !== undefined && data.pnl !== null) {
                        const pnlNum = parseMetricNumber(data.pnl);
                        if (Number.isFinite(pnlNum)) latestPnlPct = pnlNum;
                    }
                    if (data.pos_ratio !== undefined && data.pos_ratio !== null) {
                        const posNum = parseMetricNumber(data.pos_ratio) ?? 0;
                        setMetricText('position-ratio', String(data.pos_ratio), posNum);
                    }
                    if (data.cash !== undefined) {
                        const cashNum = Number(data.cash);
                        if (Number.isFinite(cashNum)) latestCash = cashNum;
                    }
                    if (data.pos_ratio) {
                        const posNum = parseMetricNumber(data.pos_ratio);
                        if (Number.isFinite(posNum)) latestPosPct = posNum;
                    }
                    mergeLiveAccountSnapshot(payload, data);
                    refreshTopAccountMetricsFromSnapshots({
                        assets: latestAssets,
                        cash: latestCash,
                        posRatioPct: latestPosPct,
                        pnlPct: latestPnlPct
                    });
                    pulsePanel('panel-hu');
                    break;
                case 'live_tick':
                    renderLiveTick(data);
                    DIAG_STATE.apiLatencyMs = data.api_latency_ms ?? DIAG_STATE.apiLatencyMs;
                    DIAG_STATE.signalConsistency = Number(data.signal_consistency ?? DIAG_STATE.signalConsistency);
                    DIAG_STATE.tickTriggerText = `${data.time || '--'} ${formatTriggerSummaryZh(data.trigger_summary || '--')}`;
                    DIAG_STATE.tickStrategyText = data.strategy_summary || '--';
                    updateDebugPanel();
                    updateConfidenceScore();
                    break;
                case 'trade_exec':
                    if (typeof data.realized_pnl === 'number') {
                        DIAG_STATE.recentPnls.push(Number(data.realized_pnl));
                        if (DIAG_STATE.recentPnls.length > 20) DIAG_STATE.recentPnls.shift();
                        updateConfidenceScore();
                    }
                    renderLiveTradeExec(data);
                    BT_STATE.totalTrades += 1;
                    pulsePanel('panel-bing');
                    break;
                case 'live_alert':
                    renderLiveAlert(data);
                    break;
                case 'live_monitor_snapshot':
                    renderLiveMonitorSnapshot(data);
                    break;
                case 'live_position_lots':
                    renderLivePositionLots(data);
                    break;
                case 'live_kline_freshness':
                    renderLiveKlineFreshness(data, payload.stock_code);
                    break;
                case 'fund_pool':
                    ingestFundPoolSnapshot(data, payload.stock_code, true);
                    break;
                case 'evolution_state':
                    applyEvolutionState(data || {});
                    break;
                case 'evolution_tick':
                    applyEvolutionTick(data || {});
                    break;
                case 'evolution_progress':
                    applyEvolutionProgress(data || {});
                    break;
                case 'platform_deployment_update':
                case 'platform_alert_sent':
                case 'platform_backup_status':
                    applyEvolutionPlatformRealtimeEvent(type, data || {});
                    break;
                case 'backtest_progress':
                    updateBacktestProgress(data);
                    refreshKlineModalImage(false, data.current_date || null);
                    break;
                case 'backtest_flow':
                    renderBacktestFlow(data);
                    break;
                case 'backtest_trade':
                    renderBacktestTrade(data);
                    upsertRealtimeBacktestTradeMarker(data);
                    break;
                case 'ministry_tick':
                    updateMinistryTick(data);
                    break;
                case 'backtest_result':
                    closeBacktestStream();
                    showBacktestResults(data);
                    setBacktestButtonState(BACKTEST_BTN_STATE.idle);
                    refreshKlineModalImage(true);
                    break;
                case 'backtest_failed':
                    handleBacktestFailure(data?.msg || '回测失败');
                    break;
                case 'backtest_strategy_report':
                    upsertStrategyReport(data);
                    break;
            }
        }
        
        function updateMarket(data, payloadStockCode = '') {
            if(data.price) {
                const p = Number(data.price);
                setMetricText('war-price', String(data.price), p);
                SYSTEM_STATE.price = data.price;
            }
            if(data.ma5) {
                const ma5 = Number(data.ma5);
                setMetricText('ind-ma5', ma5.toFixed(2), ma5);
            }
            if(data.macd !== undefined && data.macd !== null) {
                const macd = Number(data.macd);
                setMetricText('ind-macd', macd.toFixed(3), macd);
            }
            if(data.rsi !== undefined && data.rsi !== null) {
                const rsi = Number(data.rsi);
                setMetricText('ind-rsi', rsi.toFixed(2), rsi);
            }
            const source = document.getElementById('ind-source-info');
            const tfSummary = document.getElementById('ind-strategy-tf-summary');
            if (source) {
                const stockCode = String(data.stock_code || data.code || payloadStockCode || '').toUpperCase();
                const stockName = String(data.stock_name || '').trim();
                const stockText = stockName && stockCode ? `${stockName}(${stockCode})` : (stockName || stockCode || '--');
                const tf = String(data.kline_timeframe || '--');
                const dt = String(data.kline_dt || data.time || '--');
                const runTf = Array.isArray(data.runnable_timeframes) ? data.runnable_timeframes.join('/') : '';
                const runIds = Array.isArray(data.runnable_strategy_ids) ? data.runnable_strategy_ids.join(',') : '';
                if (runTf || runIds) {
                    source.innerText = `${stockText} · ${tf} · ${dt} · 本次触发: ${runTf || '--'}${runIds ? ` (${runIds})` : ''}`;
                } else {
                    source.innerText = `${stockText} · ${tf} · ${dt}`;
                }
            }
            if (tfSummary && data.strategy_timeframes && typeof data.strategy_timeframes === 'object') {
                const pairs = Object.keys(data.strategy_timeframes)
                    .sort((a, b) => String(a).localeCompare(String(b)))
                    .map(sid => `${sid}:${String(data.strategy_timeframes[sid] || '--')}`);
                tfSummary.innerText = pairs.length ? pairs.join(' | ') : '--';
            }
        }

        function syncStrategySelectionUI() {
            const selectedSet = new Set((selectedStrategyIds || []).map(x => String(x)));
            document.querySelectorAll('.strategy-item-checkbox').forEach(cb => {
                cb.checked = selectedSet.has(String(cb.value));
            });
            const allBox = document.getElementById('strategy-all-checkbox');
            if (allBox) allBox.checked = selectedStrategyIds.length === strategyCatalog.length && strategyCatalog.length > 0;
            renderStrategySelectionSummary();
            updateStrategyQuick(selectedStrategyIds.length === 1 ? String(selectedStrategyIds[0]) : 'all');
            _refreshBatchStrategyRangeSummary();
            renderEvolutionSeedSourceUi();
        }

        function applyLiveStrategySelection(strategies) {
            const runtimeIds = (Array.isArray(strategies) ? strategies : [])
                .map(s => String(s?.id || '').trim())
                .filter(Boolean);
            if (!runtimeIds.length) return;
            if (!Array.isArray(strategyCatalog) || !strategyCatalog.length) {
                fetchGlobalStrategies();
                return;
            }
            const allowSet = new Set(strategyCatalog.map(s => String(s.id)));
            const picked = runtimeIds.filter(id => allowSet.has(id));
            if (!picked.length) return;
            selectedStrategyIds = Array.from(new Set(picked));
            syncStrategySelectionUI();
        }

        function applyLiveStrategyProfiles(profiles, runningCodes = []) {
            const profileMap = (profiles && typeof profiles === 'object') ? profiles : {};
            const keys = Object.keys(profileMap);
            if (!keys.length) return false;
            if (!Array.isArray(strategyCatalog) || !strategyCatalog.length) {
                pendingLiveStrategyProfiles = {
                    profiles: profileMap,
                    runningCodes: Array.isArray(runningCodes) ? runningCodes.slice() : []
                };
                fetchGlobalStrategies();
                return false;
            }
            const allIds = strategyCatalog.map(s => String(s.id)).filter(Boolean);
            if (!allIds.length) return false;
            const allowSet = new Set(allIds);
            const preferredCode = normalizeCode(document.getElementById('stock-search-input')?.value || '');
            const candidates = [];
            if (preferredCode && profileMap[preferredCode] !== undefined) candidates.push(preferredCode);
            if (liveFundPoolSelectedCode && profileMap[liveFundPoolSelectedCode] !== undefined && !candidates.includes(liveFundPoolSelectedCode)) {
                candidates.push(liveFundPoolSelectedCode);
            }
            const running = Array.isArray(runningCodes) ? runningCodes : [];
            running.forEach(code => {
                if (profileMap[code] !== undefined && !candidates.includes(code)) candidates.push(code);
            });
            keys.forEach(code => {
                if (!candidates.includes(code)) candidates.push(code);
            });
            const normalizeProfile = (profile) => {
                if (Array.isArray(profile)) {
                    const ids = profile.map(x => String(x || '').trim()).filter(Boolean);
                    return { ids, isAll: false };
                }
                const sid = String(profile || '').trim();
                if (!sid || sid.toLowerCase() === 'all') {
                    return { ids: allIds.slice(), isAll: true };
                }
                return { ids: [sid], isAll: false };
            };
            let resolved = null;
            for (const code of candidates) {
                const normalized = normalizeProfile(profileMap[code]);
                const filtered = normalized.ids.filter(id => allowSet.has(id));
                if (normalized.isAll) {
                    resolved = allIds.slice();
                    break;
                }
                if (filtered.length) {
                    resolved = Array.from(new Set(filtered));
                    break;
                }
            }
            if (!Array.isArray(resolved) || !resolved.length) return false;
            selectedStrategyIds = resolved;
            pendingLiveStrategyProfiles = null;
            syncStrategySelectionUI();
            return true;
        }

        function strategyScoreColor(score) {
            const s = Math.max(0, Math.min(100, Number(score || 0)));
            const hue = 120 - (s / 100) * 120;
            return `hsl(${hue}, 85%, 55%)`;
        }

        function getCheckedValuesByClass(className) {
            const ids = [];
            document.querySelectorAll(`.${className}`).forEach(cb => {
                if (cb.checked) ids.push(String(cb.value));
            });
            return ids;
        }

        function setCheckedValuesByClass(className, values, fallbackAllChecked = false) {
            const set = new Set((Array.isArray(values) ? values : []).map(x => String(x)));
            document.querySelectorAll(`.${className}`).forEach(cb => {
                cb.checked = set.size ? set.has(String(cb.value)) : !!fallbackAllChecked;
            });
        }

        function renderSearchableStrategyChecklist(options) {
            const cfg = options && typeof options === 'object' ? options : {};
            const listEl = document.getElementById(cfg.listId);
            if (!listEl) return;
            const searchText = String(document.getElementById(cfg.searchInputId)?.value || '').trim().toLowerCase();
            const rows = Array.isArray(cfg.rows) ? cfg.rows : [];
            const selectedSet = new Set((Array.isArray(cfg.selectedIds) ? cfg.selectedIds : []).map(x => String(x)));
            const filtered = !searchText
                ? rows
                : rows.filter(row => {
                    const id = String(row?.id || '').toLowerCase();
                    const name = String(row?.name || '').toLowerCase();
                    return id.includes(searchText) || name.includes(searchText);
                });
            if (!filtered.length) {
                listEl.innerHTML = '<div class="text-[11px] text-slate-500 px-1 py-1">无匹配策略</div>';
                return;
            }
            listEl.innerHTML = '';
            filtered.forEach(row => {
                const sid = String(row?.id || '').trim();
                if (!sid) return;
                const label = document.createElement('label');
                label.className = 'flex items-center justify-between gap-2 text-xs text-slate-200 py-1 px-1 rounded hover:bg-slate-800/70';
                const checked = selectedSet.has(sid) ? 'checked' : '';
                const rightText = typeof cfg.renderRightText === 'function' ? String(cfg.renderRightText(row) || '') : '';
                label.innerHTML = `<span class="flex items-center gap-2 min-w-0"><input type="checkbox" class="${cfg.checkboxClass}" value="${sid}" ${checked} /> <span class="truncate">[${sid}] ${String(row?.name || sid)}</span></span><span class="font-mono shrink-0">${rightText}</span>`;
                const cb = label.querySelector('input');
                if (cb && typeof cfg.onToggle === 'function') {
                    cb.addEventListener('change', () => cfg.onToggle(cb, row));
                }
                listEl.appendChild(label);
            });
        }

        function updateStrategyMultiListUI() {
            const picked = strategyPanelTempSelectedIds.length ? strategyPanelTempSelectedIds.slice() : selectedStrategyIds.slice();
            const searchText = String(document.getElementById('strategy-multi-search')?.value || '').trim().toLowerCase();
            const scopedRows = !searchText
                ? strategyCatalog.slice()
                : strategyCatalog.filter(row => {
                    const id = String(row?.id || '').toLowerCase();
                    const name = String(row?.name || '').toLowerCase();
                    return id.includes(searchText) || name.includes(searchText);
                });
            renderSearchableStrategyChecklist({
                listId: 'strategy-multi-list',
                searchInputId: 'strategy-multi-search',
                checkboxClass: 'strategy-item-checkbox',
                rows: scopedRows,
                selectedIds: picked,
                renderRightText: (row) => {
                    const sid = String(row?.id || '');
                    const scoreRaw = latestStrategyScores[sid];
                    if (scoreRaw === undefined) return '评分 --';
                    return `评分 ${Number(scoreRaw).toFixed(1)}`;
                },
                onToggle: (cb) => {
                    const sid = String(cb?.value || '').trim();
                    const curr = new Set((Array.isArray(strategyPanelTempSelectedIds) ? strategyPanelTempSelectedIds : []).map(x => String(x)));
                    if (sid) {
                        if (cb.checked) curr.add(sid);
                        else curr.delete(sid);
                    }
                    strategyPanelTempSelectedIds = Array.from(curr);
                    const allBox = document.getElementById('strategy-all-checkbox');
                    if (allBox) {
                        const currSet = new Set(strategyPanelTempSelectedIds.map(x => String(x)));
                        const scopedIds = scopedRows.map(row => String(row?.id || '').trim()).filter(Boolean);
                        allBox.checked = scopedIds.length > 0 && scopedIds.every(id => currSet.has(id));
                    }
                }
            });
            document.querySelectorAll('#strategy-multi-list .font-mono').forEach(el => {
                const text = String(el.textContent || '');
                const m = text.match(/评分\s+([0-9.]+)/);
                if (!m) return;
                const score = Number(m[1]);
                if (!Number.isFinite(score)) return;
                el.style.color = strategyScoreColor(score);
                el.style.fontWeight = '700';
            });
            const allBox = document.getElementById('strategy-all-checkbox');
            if (allBox) {
                const currSet = new Set(picked.map(x => String(x)));
                const scopedIds = scopedRows.map(row => String(row?.id || '').trim()).filter(Boolean);
                allBox.checked = scopedIds.length > 0 && scopedIds.every(id => currSet.has(id));
            }
        }

        function updateStrategyList(strategies, preserveSelection = false) {
            const prevSelected = Array.isArray(selectedStrategyIds) ? selectedStrategyIds.slice() : [];
            strategyCatalog = Array.isArray(strategies) ? strategies.slice() : [];
            strategyCatalog.sort((a, b) => {
                const aId = String(a.id ?? '').trim();
                const bId = String(b.id ?? '').trim();
                const aNum = Number(aId);
                const bNum = Number(bId);
                const aIsNum = Number.isFinite(aNum);
                const bIsNum = Number.isFinite(bNum);
                if (aIsNum && bIsNum) return aNum - bNum;
                if (aIsNum && !bIsNum) return -1;
                if (!aIsNum && bIsNum) return 1;
                return aId.localeCompare(bId);
            });
            if (preserveSelection && prevSelected.length) {
                const ids = new Set(strategyCatalog.map(s => String(s.id)));
                selectedStrategyIds = prevSelected.filter(id => ids.has(String(id)));
            } else {
                selectedStrategyIds = [];
            }
            strategyPanelTempSelectedIds = selectedStrategyIds.slice();
            updateStrategyMultiListUI();
            syncStrategySelectionUI();
        }

        function toggleStrategyPanel() {
            const panel = document.getElementById('strategy-multi-panel');
            if (!panel) return;
            if (panel.classList.contains('hidden')) {
                strategyPanelTempSelectedIds = selectedStrategyIds.slice();
                updateStrategyMultiListUI();
            }
            panel.classList.toggle('hidden');
        }

        function toggleAllStrategies(checked) {
            const searchText = String(document.getElementById('strategy-multi-search')?.value || '').trim().toLowerCase();
            const scopedIds = (!searchText
                ? strategyCatalog
                : strategyCatalog.filter(row => {
                    const id = String(row?.id || '').toLowerCase();
                    const name = String(row?.name || '').toLowerCase();
                    return id.includes(searchText) || name.includes(searchText);
                })
            ).map(row => String(row?.id || '').trim()).filter(Boolean);
            const curr = new Set((Array.isArray(strategyPanelTempSelectedIds) ? strategyPanelTempSelectedIds : []).map(x => String(x)));
            if (checked) {
                scopedIds.forEach(id => curr.add(id));
            } else {
                scopedIds.forEach(id => curr.delete(id));
            }
            strategyPanelTempSelectedIds = Array.from(curr);
            setCheckedValuesByClass('strategy-item-checkbox', strategyPanelTempSelectedIds, !!checked);
        }

        function getSelectedStrategiesFromUI() {
            if (Array.isArray(strategyPanelTempSelectedIds)) return strategyPanelTempSelectedIds.slice();
            return getCheckedValuesByClass('strategy-item-checkbox');
        }

        function renderStrategySelectionSummary() {
            const btn = document.getElementById('strategy-multi-btn');
            if (!btn) return;
            if (!selectedStrategyIds.length) {
                btn.innerText = '策略：未选择';
            } else if (selectedStrategyIds.length === strategyCatalog.length) {
                btn.innerText = '策略：全部策略';
            } else if (selectedStrategyIds.length === 1) {
                const one = strategyCatalog.find(s => String(s.id) === String(selectedStrategyIds[0]));
                const sid = String(selectedStrategyIds[0]);
                const score = latestStrategyScores[sid];
                const scoreText = score === undefined ? '--' : Number(score).toFixed(1);
                btn.innerText = `策略：[${sid}] ${one ? one.name : ''} | 评分 ${scoreText}`;
            } else {
                btn.innerText = `策略：已选 ${selectedStrategyIds.length} 个`;
            }
        }

        function applyStrategySelection() {
            const picked = getSelectedStrategiesFromUI();
            selectedStrategyIds = picked;
            strategyPanelTempSelectedIds = picked.slice();
            const allBox = document.getElementById('strategy-all-checkbox');
            if (allBox) allBox.checked = picked.length === strategyCatalog.length;
            renderStrategySelectionSummary();
            renderEvolutionSeedSourceUi();
            const panel = document.getElementById('strategy-multi-panel');
            if (panel) panel.classList.add('hidden');
            switchStrategy(picked);
        }

        function normalizeStockCodeList(rawList) {
            const out = [];
            const seen = new Set();
            if (!Array.isArray(rawList)) return out;
            rawList.forEach(item => {
                const code = normalizeCode(String(item || ''));
                if (!/^\d{6}\.(SH|SZ)$/.test(code)) return;
                if (seen.has(code)) return;
                seen.add(code);
                out.push(code);
            });
            return out;
        }

        function resolveLiveStartTargets() {
            const configured = normalizeStockCodeList(getByPath(configDraft, 'targets', []));
            if (configured.length) return configured;
            const raw = document.getElementById('stock-search-input').value || '';
            const code = normalizeCode(raw || '600036');
            if (!/^\d{6}\.(SH|SZ)$/.test(code)) return [];
            return [code];
        }

        function readLiveAllocationSettings() {
            const modeSel = document.getElementById('live-allocation-mode');
            const weightsInput = document.getElementById('live-allocation-weights');
            const modeRaw = String(modeSel?.value || 'equal').trim().toLowerCase();
            const mode = ['equal', 'risk_parity', 'manual'].includes(modeRaw) ? modeRaw : 'equal';
            const text = String(weightsInput?.value || '').trim();
            const weights = {};
            if (text) {
                text.split(/[,，;\n]+/).forEach(part => {
                    const pair = String(part || '').trim();
                    if (!pair) return;
                    const m = pair.match(/^([0-9]{6}(?:\.(?:SH|SZ))?)\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)$/i);
                    if (!m) return;
                    const code = normalizeCode(m[1]);
                    const w = Number(m[2]);
                    if (/^\d{6}\.(SH|SZ)$/.test(code) && Number.isFinite(w) && w > 0) {
                        weights[code] = w;
                    }
                });
            }
            return { mode, weights };
        }

        async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 20000) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || 20000)));
            try {
                const res = await fetch(url, { ...options, signal: controller.signal });
                const data = await res.json();
                return { res, data };
            } finally {
                clearTimeout(timer);
            }
        }

        async function startSimulation() {
            if (!liveEnabled) return;
            const targets = resolveLiveStartTargets();
            if (!targets.length) {
                logMessage('SYSTEM', '未找到可用监控标的：请先在配置中心填写监控标的列表，或在输入框填写有效股票代码', 'danger');
                return false;
            }
            const picked = Array.isArray(selectedStrategyIds) ? selectedStrategyIds.slice() : [];
            const useAll = picked.length === 0 || picked.length === strategyCatalog.length;
            const allocation = readLiveAllocationSettings();
            const payload = { replace_existing: true };
            const capInput = document.getElementById('bt-capital-input');
            const capVal = Number(capInput?.value || 0);
            if (Number.isFinite(capVal) && capVal > 0) payload.total_capital = capVal;
            if (targets.length === 1) payload.stock_code = targets[0];
            else payload.stock_codes = targets;
            if (!useAll) payload.strategy_ids = picked;
            payload.allocation_mode = allocation.mode;
            if (Object.keys(allocation.weights).length) payload.allocation_weights = allocation.weights;
            const targetSummary = targets.length > 1 ? `${targets.length}只标的` : targets[0];
            const strategySummary = useAll ? '全部策略' : `${picked.length}个策略`;
            logMessage('SYSTEM', `正在启动实盘监控：${targetSummary}，${strategySummary}`, 'system');
            try {
                const { res, data } = await fetchJsonWithTimeout('/api/control/start_live', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }, 20000);
                if (!res.ok || (data.status !== 'success' && data.status !== 'info')) {
                    throw new Error(data.msg || '启动失败');
                }
                await syncStatus();
                return true;
            } catch (e) {
                const msg = String(e?.message || e || '');
                if (msg.includes('aborted')) {
                    await syncStatus();
                    if (liveRunning) {
                        logMessage('SYSTEM', '启动请求超时，但任务已在后台运行', 'warning');
                        return true;
                    }
                    logMessage('SYSTEM', '启动请求超时，请检查数据源连通性或服务负载', 'danger');
                } else {
                    logMessage('SYSTEM', `启动实盘失败: ${e}`, 'danger');
                }
                liveRunning = false;
                renderLiveStatus();
                return false;
            }
        }

        function setLiveActionPending(pending) {
            liveActionPending = pending;
            renderLiveStatus();
        }

        async function toggleLive() {
            if (!liveEnabled) return;
            if (liveActionPending) return;
            const targets = resolveLiveStartTargets();
            if (!targets.length) {
                const raw = document.getElementById('stock-search-input').value || '';
                logMessage('SYSTEM', `未找到有效监控标的（输入: ${raw || '空'}）`, 'danger');
                return;
            }
            setLiveActionPending(true);
            try {
                if (liveRunning) {
                    await stopSimulation();
                } else {
                    await startSimulation();
                }
            } finally {
                await syncStatus();
                setLiveActionPending(false);
            }
        }

        // --- Stock Search Logic ---
        const searchInput = document.getElementById('stock-search-input');
        const resultsBox = document.getElementById('stock-search-results');
        let searchTimeout;
        const CONSOLE_STATE_KEY = 'jince-console-state-v1';

        function persistConsoleState() {
            try {
                const payload = {
                    stock: String(searchInput?.value || '').trim(),
                    range: String(document.getElementById('bt-range-select')?.value || '1y'),
                    startDate: String(document.getElementById('bt-start-date')?.value || ''),
                    endDate: String(document.getElementById('bt-end-date')?.value || ''),
                    capital: String(document.getElementById('bt-capital-input')?.value || '')
                };
                localStorage.setItem(CONSOLE_STATE_KEY, JSON.stringify(payload));
            } catch (_) {}
        }

        function restoreConsoleState() {
            try {
                const raw = localStorage.getItem(CONSOLE_STATE_KEY);
                if (!raw) return;
                const payload = JSON.parse(raw);
                if (!payload || typeof payload !== 'object') return;
                if (typeof payload.stock === 'string' && payload.stock.trim()) {
                    searchInput.value = payload.stock.trim();
                }
                const rangeSel = document.getElementById('bt-range-select');
                if (rangeSel && typeof payload.range === 'string' && payload.range) {
                    const hasOption = Array.from(rangeSel.options || []).some(opt => opt.value === payload.range);
                    if (hasOption) rangeSel.value = payload.range;
                }
                const startInput = document.getElementById('bt-start-date');
                const endInput = document.getElementById('bt-end-date');
                if (startInput && typeof payload.startDate === 'string') startInput.value = payload.startDate;
                if (endInput && typeof payload.endDate === 'string') endInput.value = payload.endDate;
                const capInput = document.getElementById('bt-capital-input');
                if (capInput && typeof payload.capital === 'string' && payload.capital !== '') capInput.value = payload.capital;
            } catch (_) {}
        }

        function persistEvolutionFamilyAlertThresholdPreference(value) {
            // Persist family-alert threshold so dashboard refresh keeps user preference.
            try {
                const v = String(value || '').trim();
                if (!v) {
                    localStorage.removeItem(EVOLUTION_FAMILY_ALERT_THRESHOLD_KEY);
                    return;
                }
                localStorage.setItem(EVOLUTION_FAMILY_ALERT_THRESHOLD_KEY, v);
            } catch (_) {}
        }

        function evolutionPresetToThreshold(preset) {
            // Map user-friendly preset to threshold value.
            const p = String(preset || '').trim().toLowerCase();
            if (p === 'steady') return '0.12';
            if (p === 'aggressive') return '0.25';
            return '0.18';
        }

        function evolutionThresholdToPreset(threshold) {
            // Reverse map threshold value to preset key.
            const t = String(threshold || '').trim();
            if (t === '0.12') return 'steady';
            if (t === '0.25') return 'aggressive';
            return 'balanced';
        }

        function evolutionPresetStyleMeta(preset) {
            // Risk-style hint for operator and suggested adaptive blend ratio.
            const p = String(preset || '').trim().toLowerCase();
            if (p === 'steady') return { name: '稳健', blend: 0.20 };
            if (p === 'aggressive') return { name: '进攻', blend: 0.55 };
            return { name: '平衡', blend: 0.35 };
        }

        function persistEvolutionFamilyAlertPresetPreference(preset) {
            // Persist selected preset so next boot restores user risk profile.
            try {
                const p = String(preset || '').trim().toLowerCase();
                if (!p) {
                    localStorage.removeItem(EVOLUTION_FAMILY_ALERT_PRESET_KEY);
                    return;
                }
                localStorage.setItem(EVOLUTION_FAMILY_ALERT_PRESET_KEY, p);
            } catch (_) {}
        }

        function loadEvolutionFamilyAlertPresetPreference() {
            // Restore alert preset and sync threshold control/value.
            try {
                const raw = String(localStorage.getItem(EVOLUTION_FAMILY_ALERT_PRESET_KEY) || '').trim().toLowerCase();
                if (!raw) return;
                const presetSel = document.getElementById('evolution-family-alert-preset');
                const thresholdSel = document.getElementById('evolution-family-alert-threshold');
                if (!presetSel || !thresholdSel) return;
                const presetValues = Array.from(presetSel.options || []).map((x) => String(x.value || '').trim().toLowerCase());
                if (!presetValues.includes(raw)) return;
                presetSel.value = raw;
                evolutionFamilyAlertPreset = raw;
                const threshold = evolutionPresetToThreshold(raw);
                thresholdSel.value = threshold;
                evolutionFamilyAlertThresholdOverride = threshold;
            } catch (_) {}
        }

        function loadEvolutionFamilyAlertThresholdPreference() {
            // Restore persisted family-alert threshold into UI and runtime override.
            try {
                const raw = String(localStorage.getItem(EVOLUTION_FAMILY_ALERT_THRESHOLD_KEY) || '').trim();
                if (!raw) return;
                const thresholdSel = document.getElementById('evolution-family-alert-threshold');
                if (!thresholdSel) return;
                const optValues = Array.from(thresholdSel.options || []).map((x) => String(x.value || '').trim());
                if (!optValues.includes(raw)) return;
                thresholdSel.value = raw;
                evolutionFamilyAlertThresholdOverride = raw;
                const preset = evolutionThresholdToPreset(raw);
                const presetSel = document.getElementById('evolution-family-alert-preset');
                if (presetSel) presetSel.value = preset;
                evolutionFamilyAlertPreset = preset;
            } catch (_) {}
        }

        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            persistConsoleState();
            if (val.length < 1) {
                resultsBox.classList.add('hidden');
                return;
            }
            
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                fetch(`/api/search?q=${val}`)
                    .then(res => res.json())
                    .then(data => {
                        renderSearchResults(data.results);
                    })
                    .catch(err => console.error("Search failed", err));
            }, 300);
        });

        function renderSearchResults(results) {
            resultsBox.innerHTML = '';
            if (!results || results.length === 0) {
                resultsBox.innerHTML = '<div class="p-3 text-xs text-slate-500 text-center">未找到匹配股票</div>';
            } else {
                results.forEach(stock => {
                    const div = document.createElement('div');
                    div.className = 'px-4 py-2 hover:bg-slate-800 cursor-pointer text-xs flex justify-between items-center border-b border-slate-800 last:border-0 transition-colors';
                    div.innerHTML = `
                        <div class="flex flex-col">
                            <span class="font-bold text-white font-mono text-sm">${stock.code}</span>
                            <span class="text-[10px] text-slate-500">${stock.pinyin || ''}</span>
                        </div>
                        <span class="text-trading-blue font-bold">${stock.name}</span>
                    `;
                    div.onclick = () => {
                        selectStock(stock);
                    };
                    resultsBox.appendChild(div);
                });
            }
            resultsBox.classList.remove('hidden');
        }

        function selectStock(stock) {
            searchInput.value = stock.code;
            persistConsoleState();
            resultsBox.classList.add('hidden');
            if (liveEnabled && liveRunning) restartSimulation(stock.code);
        }

        async function restartSimulation(code) {
            if (!liveEnabled) return;
            logMessage('SYSTEM', `正在切换监控标的: ${code}...`, 'warning');
            const picked = Array.isArray(selectedStrategyIds) ? selectedStrategyIds.slice() : [];
            const useAll = picked.length === 0 || picked.length === strategyCatalog.length;
            const allocation = readLiveAllocationSettings();
            const payload = { stock_code: normalizeCode(code), replace_existing: true };
            const capInput = document.getElementById('bt-capital-input');
            const capVal = Number(capInput?.value || 0);
            if (Number.isFinite(capVal) && capVal > 0) payload.total_capital = capVal;
            if (!useAll) payload.strategy_ids = picked;
            payload.allocation_mode = allocation.mode;
            if (Object.keys(allocation.weights).length) payload.allocation_weights = allocation.weights;
            try {
                const stopResp = await fetchJsonWithTimeout('/api/control/stop', { method: 'POST' }, 15000);
                if (!stopResp.res.ok || (stopResp.data.status !== 'success' && stopResp.data.status !== 'info')) {
                    throw new Error(stopResp.data.msg || '停止旧任务失败');
                }
                const { res, data } = await fetchJsonWithTimeout('/api/control/start_live', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }, 20000);
                if (!res.ok || (data.status !== 'success' && data.status !== 'info')) {
                    throw new Error(data.msg || '切换失败');
                }
                await syncStatus();
            } catch (e) {
                const msg = String(e?.message || e || '');
                if (msg.includes('aborted')) {
                    await syncStatus();
                    if (liveRunning) {
                        logMessage('SYSTEM', '切换请求超时，但任务可能已在后台完成切换', 'warning');
                        return;
                    }
                    logMessage('SYSTEM', '切换请求超时，请检查服务负载或数据源连通性', 'danger');
                    return;
                }
                logMessage('SYSTEM', `切换监控标的失败: ${e}`, 'danger');
            }
        }

        async function stopSimulation() {
            if (!liveEnabled) return;
            try {
                const { res, data } = await fetchJsonWithTimeout('/api/control/stop', { method: 'POST' }, 15000);
                if (!res.ok || (data.status !== 'success' && data.status !== 'info')) {
                    throw new Error(data.msg || '停止失败');
                }
                logMessage('SYSTEM', data.msg || '已发送停止指令', 'warning');
            } catch (e) {
                const msg = String(e?.message || e || '');
                if (msg.includes('aborted')) {
                    await syncStatus();
                    if (!liveRunning) {
                        logMessage('SYSTEM', '停止请求超时，但任务已停止', 'warning');
                    } else {
                        logMessage('SYSTEM', '停止请求超时，请稍后重试', 'danger');
                    }
                } else {
                    logMessage('SYSTEM', `停止实盘失败: ${e}`, 'danger');
                }
            }
            liveRunning = false;
            renderLiveStatus();
        }

        function normalizeCode(raw) {
            const v = String(raw || '').trim().toUpperCase();
            if (v.includes('.SH') || v.includes('.SZ')) return v;
            if (/^\d{6}$/.test(v)) return v.startsWith('6') ? `${v}.SH` : `${v}.SZ`;
            return v;
        }

        function renderLiveStatus() {
            const text = document.getElementById('system-status-text');
            const badge = document.getElementById('live-run-state');
            const btn = document.getElementById('live-toggle-btn');
            const icon = document.getElementById('live-toggle-icon');
            const label = document.getElementById('live-toggle-label');
            if (!text || !badge || !btn || !icon || !label) return;
            const compact = isCompactActionLayout();
            const btnMin = compact ? 'min-w-[108px]' : 'min-w-[128px]';
            if (!liveEnabled && !liveRunning) {
                text.className = 'text-slate-500';
                text.innerText = '实盘已关闭';
                badge.className = 'text-[10px] px-2 py-0.5 rounded bg-slate-700 text-slate-400';
                badge.innerText = '已关闭';
                btn.disabled = true;
                return;
            }
            if (liveActionPending && !liveRunning) {
                text.className = 'text-trading-yellow animate-pulse';
                text.innerText = '切换中';
                badge.className = 'text-[10px] px-2 py-0.5 rounded bg-amber-700 text-white animate-pulse';
                badge.innerText = '切换中';
                btn.className = `bg-amber-600 text-white px-4 py-2 rounded font-bold text-sm transition-all border border-amber-500 ${btnMin} cursor-not-allowed opacity-90`;
                icon.className = 'fa-solid fa-spinner animate-spin';
                label.innerText = compact ? '切换中' : '切换中...';
                btn.disabled = true;
                return;
            }
            if (liveRunning) {
                text.className = 'text-trading-green animate-pulse';
                text.innerText = '实时运行中';
                badge.className = 'text-[10px] px-2 py-0.5 rounded bg-emerald-700 text-white animate-pulse';
                badge.innerText = '运行中';
                btn.className = `bg-trading-red hover:bg-rose-600 text-white px-4 py-2 rounded font-bold text-sm transition-all border border-rose-500 hover:-translate-y-0.5 active:scale-95 ${btnMin}`;
                icon.className = 'fa-solid fa-stop';
                label.innerText = compact ? '实盘停' : '停止实盘';
                btn.disabled = false;
            } else {
                text.className = 'text-slate-300';
                text.innerText = '待机';
                badge.className = 'text-[10px] px-2 py-0.5 rounded bg-slate-700 text-slate-200';
                badge.innerText = '待机';
                btn.className = `bg-trading-green hover:bg-emerald-600 text-white px-4 py-2 rounded font-bold text-sm transition-all border border-emerald-500 hover:-translate-y-0.5 active:scale-95 ${btnMin}`;
                icon.className = 'fa-solid fa-satellite-dish';
                label.innerText = compact ? '实盘开' : '启动实盘';
                btn.disabled = false;
            }
        }

        function renderLiveExceptionPanel() {
            const panel = document.getElementById('live-exception-panel');
            const timeEl = document.getElementById('live-exception-time');
            const stockEl = document.getElementById('live-exception-stock');
            const stageEl = document.getElementById('live-exception-stage');
            const msgEl = document.getElementById('live-exception-message');
            const stackEl = document.getElementById('live-exception-stack');
            if (!panel || !timeEl || !stockEl || !stageEl || !msgEl || !stackEl) return;
            const err = liveLastError && typeof liveLastError === 'object' ? liveLastError : null;
            if (!err) {
                panel.classList.add('hidden');
                return;
            }
            panel.classList.remove('hidden');
            const t = String(err.time || '--');
            const stock = String(err.stock_code || '--');
            const stage = String(err.stage || '--');
            const type = String(err.error_type || 'Exception');
            const msg = String(err.error_msg || '');
            const stack = String(err.stack || '');
            timeEl.innerText = t;
            stockEl.innerText = stock;
            stageEl.innerText = stage;
            msgEl.innerText = msg ? `${type}: ${msg}` : type;
            stackEl.innerText = stack || '无堆栈信息';
        }

        function toZhTimeframe(tf) {
            const m = {
                '1min': '1分钟',
                '5min': '5分钟',
                '10min': '10分钟',
                '15min': '15分钟',
                '30min': '30分钟',
                '60min': '60分钟',
                'D': '日线'
            };
            return m[tf] || tf;
        }

        function formatTriggerSummaryZh(text) {
            if (!text || text === '无') return '无';
            return text.split('|').map(part => {
                const p = part.trim();
                const idx = p.indexOf(':');
                if (idx < 0) return p;
                const tf = p.slice(0, idx).trim();
                const rest = p.slice(idx + 1).trim();
                return `${toZhTimeframe(tf)}:${rest}`;
            }).join(' | ');
        }

        function renderLiveTick(data) {
            const trigger = document.getElementById('live-trigger-summary');
            const list = document.getElementById('live-strategy-summary');
            if (trigger) trigger.innerText = `[${data.time || '--'}] ${formatTriggerSummaryZh(data.trigger_summary || '--')}`;
            if (list) list.innerText = data.strategy_summary || '--';
        }

        function formatLiveMetricLabel(metric) {
            const m = {
                daily_drawdown: '当日回撤',
                single_position_weight: '单票仓位',
                turnover_rate: '当日换手率',
                signal_execution_delay_ms: '执行延迟',
                expected_vs_actual_price_deviation: '成交偏差'
            };
            return m[String(metric || '')] || String(metric || '--');
        }

        function formatLiveMetricValue(metric, value) {
            const v = Number(value || 0);
            const key = String(metric || '');
            if (key.includes('delay_ms')) return `${v.toFixed(0)} ms`;
            if (key.includes('deviation') || key.includes('drawdown') || key.includes('weight') || key.includes('turnover')) return `${(v * 100).toFixed(3)}%`;
            return String(v);
        }

        function alertBadgeByLevel(level) {
            if (level === 'critical') return { text: '严重', cls: 'text-[10px] px-2 py-0.5 rounded bg-rose-700 text-white' };
            if (level === 'warn') return { text: '预警', cls: 'text-[10px] px-2 py-0.5 rounded bg-amber-700 text-white' };
            return { text: '正常', cls: 'text-[10px] px-2 py-0.5 rounded bg-slate-700 text-slate-200' };
        }

        function renderRecentLiveAlerts() {
            const list = document.getElementById('live-alert-list');
            const badge = document.getElementById('live-alert-badge');
            const filterSel = document.getElementById('live-alert-filter');
            if (!list || !badge) return;
            if (filterSel && filterSel.value !== DIAG_STATE.liveAlertFilter) {
                filterSel.value = DIAG_STATE.liveAlertFilter;
            }
            const alerts = Array.isArray(DIAG_STATE.liveAlerts) ? DIAG_STATE.liveAlerts : [];
            const filtered = alerts.filter(x => DIAG_STATE.liveAlertFilter === 'all' || String(x.metric || '') === DIAG_STATE.liveAlertFilter);
            const sorted = filtered.slice().sort((a, b) => {
                const pa = a.level === 'critical' ? 0 : (a.level === 'warn' ? 1 : 2);
                const pb = b.level === 'critical' ? 0 : (b.level === 'warn' ? 1 : 2);
                if (pa !== pb) return pa - pb;
                return Number(b.seq || 0) - Number(a.seq || 0);
            });
            const top = sorted[0];
            const b = alertBadgeByLevel(top?.level || 'ok');
            badge.className = b.cls;
            badge.innerText = b.text;
            if (!sorted.length) {
                list.innerHTML = '<div class="text-slate-500">暂无告警</div>';
                return;
            }
            list.innerHTML = '';
            sorted.slice(0, 8).forEach(item => {
                const row = document.createElement('div');
                const level = String(item.level || 'ok');
                row.className = level === 'critical'
                    ? 'text-rose-300 animate-pulse border border-rose-500/50 rounded px-1 py-0.5'
                    : (level === 'warn' ? 'text-amber-300' : 'text-slate-300');
                const t = String(item.time || getTime());
                const metric = formatLiveMetricLabel(item.metric);
                const value = formatLiveMetricValue(item.metric, item.value);
                row.innerText = `[${t}] ${level.toUpperCase()} ${metric}: ${value}`;
                list.appendChild(row);
            });
        }

        function onLiveAlertFilterChange(value) {
            DIAG_STATE.liveAlertFilter = String(value || 'all');
            renderRecentLiveAlerts();
        }

        function clearLiveAlerts() {
            DIAG_STATE.liveAlerts = [];
            renderRecentLiveAlerts();
            logMessage('风控中心', '最近告警列表已清空', 'system');
        }

        function renderLiveAlert(data) {
            const level = String(data?.level || 'ok');
            const metric = String(data?.metric || '--');
            const value = Number(data?.value || 0);
            DIAG_STATE.liveAlerts.unshift({
                seq: ++DIAG_STATE.liveAlertSeq,
                time: data?.time || getTime(),
                level,
                metric,
                value
            });
            DIAG_STATE.liveAlerts = DIAG_STATE.liveAlerts.slice(0, 20);
            renderRecentLiveAlerts();
            const statusMenxia = document.getElementById('status-menxia');
            if (statusMenxia) {
                if (level === 'critical') statusMenxia.className = 'status-dot bg-trading-red shadow-[0_0_8px_currentColor] animate-pulse';
                if (level === 'warn') statusMenxia.className = 'status-dot bg-trading-yellow shadow-[0_0_8px_currentColor]';
            }
            const txt = `${formatLiveMetricLabel(metric)} ${formatLiveMetricValue(metric, value)}`;
            logMessage('风控中心', `实盘告警(${level.toUpperCase()}): ${txt}`, level === 'critical' ? 'danger' : 'warning');
            pulsePanel('panel-xing');
        }

        function renderLiveMonitorSnapshot(data) {
            DIAG_STATE.liveMonitor = {
                daily_drawdown: Number(data?.daily_drawdown || 0),
                single_position_weight: Number(data?.single_position_weight || 0),
                turnover_rate: Number(data?.turnover_rate || 0),
                signal_consistency: Number(data?.signal_consistency ?? DIAG_STATE.signalConsistency),
                api_latency_ms: Number(data?.api_latency_ms ?? DIAG_STATE.apiLatencyMs ?? 0)
            };
            DIAG_STATE.signalConsistency = DIAG_STATE.liveMonitor.signal_consistency;
            DIAG_STATE.apiLatencyMs = DIAG_STATE.liveMonitor.api_latency_ms;
            const ddEl = document.getElementById('live-mon-dd');
            const posEl = document.getElementById('live-mon-pos');
            const turnoverEl = document.getElementById('live-mon-turnover');
            const latencyEl = document.getElementById('live-mon-latency');
            if (ddEl) {
                ddEl.innerText = `${(DIAG_STATE.liveMonitor.daily_drawdown * 100).toFixed(3)}%`;
                ddEl.className = DIAG_STATE.liveMonitor.daily_drawdown >= 0.03 ? 'text-[12px] font-mono text-rose-300' : (DIAG_STATE.liveMonitor.daily_drawdown >= 0.02 ? 'text-[12px] font-mono text-amber-300' : 'text-[12px] font-mono text-emerald-300');
            }
            if (posEl) {
                posEl.innerText = `${(DIAG_STATE.liveMonitor.single_position_weight * 100).toFixed(3)}%`;
                posEl.className = DIAG_STATE.liveMonitor.single_position_weight >= 0.2 ? 'text-[12px] font-mono text-rose-300' : (DIAG_STATE.liveMonitor.single_position_weight >= 0.15 ? 'text-[12px] font-mono text-amber-300' : 'text-[12px] font-mono text-cyan-300');
            }
            if (turnoverEl) {
                turnoverEl.innerText = `${(DIAG_STATE.liveMonitor.turnover_rate * 100).toFixed(3)}%`;
                turnoverEl.className = DIAG_STATE.liveMonitor.turnover_rate >= 0.8 ? 'text-[12px] font-mono text-rose-300' : (DIAG_STATE.liveMonitor.turnover_rate >= 0.5 ? 'text-[12px] font-mono text-amber-300' : 'text-[12px] font-mono text-cyan-300');
            }
            if (latencyEl) {
                latencyEl.innerText = `${Math.round(DIAG_STATE.liveMonitor.api_latency_ms)} ms`;
                latencyEl.className = DIAG_STATE.liveMonitor.api_latency_ms >= 15000 ? 'text-[12px] font-mono text-rose-300' : (DIAG_STATE.liveMonitor.api_latency_ms >= 5000 ? 'text-[12px] font-mono text-amber-300' : 'text-[12px] font-mono text-slate-200');
            }
            updateDebugPanel();
            updateConfidenceScore();
        }

        function renderLiveKlineFreshness(data, payloadStockCode) {
            const list = document.getElementById('live-kline-freshness-list');
            const badge = document.getElementById('live-kline-freshness-badge');
            if (!list || !badge) return;
            const reasonLabelMap = {
                OK: '正常',
                TOKEN_INVALID: 'Token失效',
                NETWORK_TIMEOUT: '网络超时',
                NETWORK_ERROR: '网络异常',
                CODE_NO_DATA: '代码无数据',
                TABLE_EMPTY: '数据表空',
                UNKNOWN: '未知原因'
            };
            const stockCode = String(data?.stock_code || payloadStockCode || '--').toUpperCase();
            if (!stockCode || stockCode === '--') return;
            DIAG_STATE.liveKlineFreshnessMap[stockCode] = {
                stock_code: stockCode,
                check_time: String(data?.check_time || getTime()),
                check_ok: Boolean(data?.check_ok !== false),
                message: String(data?.message || ''),
                reason_category: String(data?.reason_category || 'UNKNOWN').toUpperCase(),
                reason_label: String(data?.reason_label || '').trim(),
                reason_detail: String(data?.reason_detail || '').trim(),
                expected_latest_trade_date: String(data?.expected_latest_trade_date || '--'),
                latest_kline_date: String(data?.latest_kline_date || '--'),
                latest_kline_dt: String(data?.latest_kline_dt || '--'),
                lagged: Boolean(data?.lagged),
                timeframes: Array.isArray(data?.timeframes) ? data.timeframes : []
            };
            const rows = Object.values(DIAG_STATE.liveKlineFreshnessMap).sort((a, b) => String(a.stock_code).localeCompare(String(b.stock_code)));
            const hasFail = rows.some(r => r.check_ok === false);
            const hasLag = rows.some(r => Boolean(r.lagged));
            badge.className = hasFail
                ? 'text-[10px] px-2 py-0.5 rounded bg-rose-700 text-white'
                : (hasLag
                ? 'text-[10px] px-2 py-0.5 rounded bg-rose-700 text-white'
                : 'text-[10px] px-2 py-0.5 rounded bg-emerald-700 text-white');
            badge.innerText = hasFail ? '校验失败' : (hasLag ? '有滞后' : '已最新');
            list.innerHTML = '';
            rows.forEach(item => {
                const row = document.createElement('div');
                const cls = item.check_ok === false
                    ? 'text-rose-200 border border-rose-700/70 rounded px-1 py-0.5'
                    : (item.lagged
                    ? 'text-rose-300 border border-rose-700/60 rounded px-1 py-0.5'
                    : 'text-emerald-300 border border-emerald-700/40 rounded px-1 py-0.5');
                row.className = cls;
                const lagTag = item.check_ok === false ? '失败' : (item.lagged ? '滞后' : '正常');
                const reasonLabel = item.reason_label || reasonLabelMap[item.reason_category] || reasonLabelMap.UNKNOWN;
                const tfLag = (Array.isArray(item.timeframes) ? item.timeframes : [])
                    .filter(x => Boolean(x?.lagged))
                    .map(x => `${String(x?.timeframe || '--')}:${Number(x?.lag_days || 0)}d`)
                    .join(', ');
                const lagText = tfLag ? ` | ${tfLag}` : '';
                const reasonText = item.check_ok === false ? ` | 原因分类 ${reasonLabel}` : '';
                const msgText = item.message ? ` | ${item.message}` : '';
                const detailText = item.reason_detail ? ` | 诊断 ${item.reason_detail}` : '';
                row.innerText = `[${item.check_time}] ${item.stock_code} | 最新 ${item.latest_kline_date || '--'} | 预期 ${item.expected_latest_trade_date || '--'} | ${lagTag}${reasonText}${lagText}${msgText}${detailText}`;
                list.appendChild(row);
            });
            if (!rows.length) {
                list.innerHTML = '<div class="text-slate-500">暂无校验结果</div>';
            }
        }

        function renderLivePositionLots(data) {
            const summary = document.getElementById('live-lot-summary');
            const list = document.getElementById('live-lot-list');
            if (!summary || !list) return;
            const totalQty = Number(data?.total_qty || 0);
            const sellableQty = Number(data?.sellable_qty || 0);
            const lockedQty = Number(data?.locked_qty || 0);
            const totalLot = totalQty / 100;
            const sellableLot = sellableQty / 100;
            const lockedLot = lockedQty / 100;
            const timeText = String(data?.time || '--');
            summary.innerText = `[${timeText}] 总持仓 ${totalLot.toFixed(0)} 手 | 可卖 ${sellableLot.toFixed(0)} 手 | 冻结 ${lockedLot.toFixed(0)} 手`;
            const rows = Array.isArray(data?.rows) ? data.rows : [];
            if (!rows.length) {
                list.innerHTML = '<div class="text-slate-500">暂无持仓批次</div>';
                return;
            }
            list.innerHTML = '';
            rows.forEach(r => {
                const row = document.createElement('div');
                const sellable = Number(r?.sellable_qty || 0);
                const qty = Number(r?.qty || 0);
                const locked = Number(r?.locked_qty || 0);
                const strategyId = String(r?.strategy_id || '--');
                const buyDay = String(r?.buy_day || '--');
                const unitCost = Number(r?.unit_cost || 0);
                const color = sellable > 0 ? 'text-emerald-300' : 'text-amber-300';
                row.className = `${color} border border-slate-700/70 rounded px-1 py-0.5`;
                row.innerText = `S${strategyId} | 买入日 ${buyDay} | 持仓 ${(qty/100).toFixed(0)}手 | 可卖 ${(sellable/100).toFixed(0)}手 | 冻结 ${(locked/100).toFixed(0)}手 | 成本 ${unitCost.toFixed(3)}`;
                list.appendChild(row);
            });
        }

        function fmtCurrency(v) {
            const n = Number(v || 0);
            return Number.isFinite(n) ? `¥ ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '--';
        }

        function fundPoolSelectedCodeFallback() {
            const running = Object.keys(DIAG_STATE.liveFundPools || {});
            if (running.length) return String(running[0]).toUpperCase();
            const stockInput = document.getElementById('stock-search-input');
            const code = normalizeCode(stockInput?.value || '');
            return code || '';
        }

        function updateFundPoolStockSelect() {
            const sel = document.getElementById('fund-pool-stock-select');
            if (!sel) return;
            const existed = new Set();
            const codes = Object.keys(DIAG_STATE.liveFundPools || {}).sort((a, b) => String(a).localeCompare(String(b)));
            const preferPortfolioOnInit = !liveFundPoolSelectionTouched && codes.length > 1;
            const keep = preferPortfolioOnInit
                ? FUND_POOL_PORTFOLIO_KEY
                : (liveFundPoolSelectedCode || fundPoolSelectedCodeFallback());
            sel.innerHTML = '';
            if (codes.length > 1) {
                const optAll = document.createElement('option');
                optAll.value = FUND_POOL_PORTFOLIO_KEY;
                optAll.innerText = '组合总览';
                sel.appendChild(optAll);
                existed.add(FUND_POOL_PORTFOLIO_KEY);
            }
            codes.forEach(code => {
                existed.add(code);
                const opt = document.createElement('option');
                opt.value = code;
                opt.innerText = code;
                sel.appendChild(opt);
            });
            if (!codes.length) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.innerText = '--';
                sel.appendChild(opt);
            }
            if (keep && existed.has(keep)) {
                sel.value = keep;
                liveFundPoolSelectedCode = keep;
            } else if (codes.length) {
                sel.value = codes[0];
                liveFundPoolSelectedCode = codes[0];
            } else {
                sel.value = '';
                liveFundPoolSelectedCode = '';
            }
        }

        function mergeLiveAccountSnapshot(payload, data) {
            const stockCode = String(payload?.stock_code || data?.stock_code || '').toUpperCase();
            const key = stockCode || LIVE_ACCOUNT_GLOBAL_KEY;
            if (!liveAccountSnapshotMap[key] || typeof liveAccountSnapshotMap[key] !== 'object') {
                liveAccountSnapshotMap[key] = {};
            }
            const snap = liveAccountSnapshotMap[key];
            if (data?.assets !== undefined && data?.assets !== null) {
                const assetNum = Number(data.assets);
                if (Number.isFinite(assetNum)) snap.assets = assetNum;
            }
            if (data?.cash !== undefined && data?.cash !== null) {
                const cashNum = Number(data.cash);
                if (Number.isFinite(cashNum)) snap.cash = cashNum;
            }
            if (data?.pos_ratio !== undefined && data?.pos_ratio !== null) {
                const posNum = parseMetricNumber(data.pos_ratio);
                if (Number.isFinite(posNum)) snap.pos_ratio_pct = posNum;
            }
            if (data?.day_start_assets !== undefined && data?.day_start_assets !== null) {
                const baseNum = Number(data.day_start_assets);
                if (Number.isFinite(baseNum) && baseNum > 0) snap.day_start_assets = baseNum;
            }
            if (data?.pnl_pct !== undefined && data?.pnl_pct !== null) {
                const pnlPctNum = Number(data.pnl_pct);
                if (Number.isFinite(pnlPctNum)) snap.pnl_pct = pnlPctNum;
            } else if (data?.pnl !== undefined && data?.pnl !== null) {
                const pnlPctNum = parseMetricNumber(data.pnl);
                if (Number.isFinite(pnlPctNum)) snap.pnl_pct = pnlPctNum;
            }
            return key;
        }

        function aggregateLiveAccountSnapshot() {
            const keys = Object.keys(liveAccountSnapshotMap || {});
            const codeKeys = keys.filter(k => k !== LIVE_ACCOUNT_GLOBAL_KEY);
            if (!codeKeys.length) {
                const g = liveAccountSnapshotMap[LIVE_ACCOUNT_GLOBAL_KEY];
                if (!g || !Number.isFinite(Number(g.assets))) return null;
                const assets = Number(g.assets);
                const cash = Number.isFinite(Number(g.cash)) ? Number(g.cash) : null;
                let posRatioPct = Number.isFinite(Number(g.pos_ratio_pct)) ? Number(g.pos_ratio_pct) : null;
                let pnlPct = Number.isFinite(Number(g.pnl_pct)) ? Number(g.pnl_pct) : null;
                const dayStartAssets = Number(g.day_start_assets);
                if (!Number.isFinite(posRatioPct) && Number.isFinite(cash) && assets > 0) {
                    posRatioPct = Math.max(0, Math.min(100, (1 - (cash / assets)) * 100));
                }
                if (!Number.isFinite(pnlPct) && Number.isFinite(dayStartAssets) && dayStartAssets > 0) {
                    pnlPct = ((assets - dayStartAssets) / dayStartAssets) * 100;
                }
                return { assets, cash, posRatioPct, pnlPct };
            }
            let sumAssets = 0;
            let sumCash = 0;
            let sumDayStartAssets = 0;
            let hasAssets = false;
            let hasCash = false;
            let hasDayStart = false;
            codeKeys.forEach(code => {
                const s = liveAccountSnapshotMap[code];
                const a = Number(s?.assets);
                if (Number.isFinite(a)) {
                    sumAssets += a;
                    hasAssets = true;
                }
                const c = Number(s?.cash);
                if (Number.isFinite(c)) {
                    sumCash += c;
                    hasCash = true;
                }
                const b = Number(s?.day_start_assets);
                if (Number.isFinite(b) && b > 0) {
                    sumDayStartAssets += b;
                    hasDayStart = true;
                }
            });
            if (!hasAssets) return null;
            const posRatioPct = hasCash && sumAssets > 0 ? Math.max(0, Math.min(100, (1 - (sumCash / sumAssets)) * 100)) : null;
            const pnlPct = hasDayStart && sumDayStartAssets > 0 ? ((sumAssets - sumDayStartAssets) / sumDayStartAssets) * 100 : null;
            return {
                assets: sumAssets,
                cash: hasCash ? sumCash : null,
                posRatioPct,
                pnlPct
            };
        }

        function refreshTopAccountMetricsFromSnapshots(fallback = {}) {
            const agg = aggregateLiveAccountSnapshot();
            const fallbackAssets = Number(fallback.assets);
            const fallbackCash = Number(fallback.cash);
            const fallbackPos = Number(fallback.posRatioPct);
            const fallbackPnlPct = Number(fallback.pnlPct);
            const assets = agg && Number.isFinite(Number(agg.assets))
                ? Number(agg.assets)
                : (Number.isFinite(fallbackAssets) ? fallbackAssets : null);
            const cash = agg && Number.isFinite(Number(agg.cash))
                ? Number(agg.cash)
                : (Number.isFinite(fallbackCash) ? fallbackCash : null);
            const posRatioPct = agg && Number.isFinite(Number(agg.posRatioPct))
                ? Number(agg.posRatioPct)
                : (Number.isFinite(fallbackPos) ? fallbackPos : null);
            const pnlPct = agg && Number.isFinite(Number(agg.pnlPct))
                ? Number(agg.pnlPct)
                : (Number.isFinite(fallbackPnlPct) ? fallbackPnlPct : null);
            if (Number.isFinite(assets)) {
                setMetricText('total-assets', `¥ ${assets.toLocaleString()}`, assets);
            }
            if (Number.isFinite(cash)) {
                setMetricText('revenue-cash', cash.toLocaleString(), cash);
            }
            if (Number.isFinite(pnlPct)) {
                setMetricText('daily-pnl', `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`, pnlPct);
                setDailyPnlStyle(pnlPct);
            }
            if (Number.isFinite(posRatioPct)) {
                setMetricText('position-ratio', `${posRatioPct.toFixed(2)}%`, posRatioPct);
                const availVal = Math.max(0, Math.min(100, 100 - posRatioPct));
                setMetricText('personnel-available-pos', `${availVal.toFixed(1)}%`, availVal);
            }
            updateRevenueCashRatioBar(cash, assets);
        }

        function buildPortfolioFundPoolSnapshot() {
            const poolMap = (DIAG_STATE.liveFundPools && typeof DIAG_STATE.liveFundPools === 'object') ? DIAG_STATE.liveFundPools : {};
            const codes = Object.keys(poolMap);
            if (!codes.length) return null;
            const out = {
                stock_code: FUND_POOL_PORTFOLIO_KEY,
                cash: 0,
                holdings_value: 0,
                fund_value: 0,
                realized_pnl: 0,
                initial_capital: 0,
                positions: [],
                trade_details: [],
                updated_at: ''
            };
            let latestTs = '';
            codes.forEach(code => {
                const s = poolMap[code];
                if (!s || typeof s !== 'object') return;
                out.cash += Number(s.cash || 0);
                out.holdings_value += Number(s.holdings_value || 0);
                out.fund_value += Number(s.fund_value || 0);
                out.realized_pnl += Number(s.realized_pnl || 0);
                out.initial_capital += Number(s.initial_capital || 0);
                if (Array.isArray(s.positions)) {
                    out.positions.push(...s.positions.map(row => Object.assign({}, row)));
                }
                if (Array.isArray(s.trade_details)) {
                    out.trade_details.push(...s.trade_details.map(row => Object.assign({}, row)));
                }
                const ts = String(s.updated_at || '');
                if (ts && (!latestTs || ts > latestTs)) latestTs = ts;
            });
            out.updated_at = latestTs;
            out.trade_details.sort((a, b) => String(b?.dt || '').localeCompare(String(a?.dt || '')));
            if (out.trade_details.length > 3000) out.trade_details = out.trade_details.slice(0, 3000);
            return out;
        }

        function buildPortfolioCurve() {
            const codes = Object.keys(liveFundCurveMap || {});
            if (!codes.length) return [];
            const codeArrMap = {};
            const tsSet = new Set();
            codes.forEach(code => {
                const arr = Array.isArray(liveFundCurveMap[code]) ? liveFundCurveMap[code] : [];
                if (!arr.length) return;
                codeArrMap[code] = arr.slice().sort((a, b) => String(a?.ts || '').localeCompare(String(b?.ts || '')));
                codeArrMap[code].forEach(p => {
                    const ts = String(p?.ts || '');
                    if (ts) tsSet.add(ts);
                });
            });
            const tsList = Array.from(tsSet).sort((a, b) => String(a).localeCompare(String(b)));
            if (!tsList.length) return [];
            const idxMap = {};
            const lastMap = {};
            Object.keys(codeArrMap).forEach(code => {
                idxMap[code] = 0;
                lastMap[code] = null;
            });
            const out = [];
            tsList.forEach(ts => {
                let sumFund = 0;
                let sumHoldings = 0;
                let sumCash = 0;
                let valid = false;
                Object.keys(codeArrMap).forEach(code => {
                    const arr = codeArrMap[code];
                    let idx = Number(idxMap[code] || 0);
                    while (idx < arr.length && String(arr[idx]?.ts || '') <= ts) {
                        lastMap[code] = arr[idx];
                        idx += 1;
                    }
                    idxMap[code] = idx;
                    const last = lastMap[code];
                    if (!last) return;
                    sumFund += Number(last.fund_value || 0);
                    sumHoldings += Number(last.holdings_value || 0);
                    sumCash += Number(last.cash || 0);
                    valid = true;
                });
                if (!valid) return;
                out.push({ ts, fund_value: sumFund, holdings_value: sumHoldings, cash: sumCash });
            });
            if (out.length > 240) return out.slice(out.length - 240);
            return out;
        }

        function appendFundCurvePoint(stockCode, snap) {
            const code = String(stockCode || '').toUpperCase();
            if (!code || !snap || typeof snap !== 'object') return;
            const fundValue = Number(snap.fund_value || 0);
            const holdingsValue = Number(snap.holdings_value || 0);
            const cashValue = Number(snap.cash || 0);
            if (!Number.isFinite(fundValue) || fundValue <= 0) return;
            const ts = String(snap.updated_at || new Date().toISOString());
            if (!liveFundCurveMap[code]) liveFundCurveMap[code] = [];
            const arr = liveFundCurveMap[code];
            const last = arr.length ? arr[arr.length - 1] : null;
            if (
                !last
                || String(last.ts) !== ts
                || Math.abs(Number(last.fund_value || 0) - fundValue) > 0.0001
                || Math.abs(Number(last.holdings_value || 0) - holdingsValue) > 0.0001
                || Math.abs(Number(last.cash || 0) - cashValue) > 0.0001
            ) {
                arr.push({ ts, fund_value: fundValue, holdings_value: holdingsValue, cash: cashValue });
            }
            if (arr.length > 240) arr.splice(0, arr.length - 240);
        }

        function onFundPoolCurveMetricChange(metric) {
            const next = String(metric || 'fund_value').trim();
            liveFundCurveMetric = ['fund_value', 'holdings_value', 'cash'].includes(next) ? next : 'fund_value';
            const selected = String(liveFundPoolSelectedCode || fundPoolSelectedCodeFallback() || '').toUpperCase();
            const snap = selected === FUND_POOL_PORTFOLIO_KEY ? buildPortfolioFundPoolSnapshot() : (selected ? DIAG_STATE.liveFundPools?.[selected] : null);
            renderFundPoolCurve(selected, snap);
        }

        function renderFundPoolCurve(stockCode, snap) {
            const line = document.getElementById('fund-pool-curve-line');
            const baseline = document.getElementById('fund-pool-curve-baseline');
            const dot = document.getElementById('fund-pool-curve-dot');
            const meta = document.getElementById('fund-pool-curve-meta');
            const ret = document.getElementById('fund-pool-curve-return');
            const cumRet = document.getElementById('fund-pool-cum-return');
            const maxDdEl = document.getElementById('fund-pool-max-dd');
            const rangeEl = document.getElementById('fund-pool-curve-range');
            const legendEl = document.getElementById('fund-pool-curve-legend');
            if (!line || !baseline || !dot || !meta || !ret || !cumRet || !maxDdEl || !rangeEl || !legendEl) return;
            const code = String(stockCode || '').toUpperCase();
            const curve = code === FUND_POOL_PORTFOLIO_KEY ? buildPortfolioCurve() : (Array.isArray(liveFundCurveMap[code]) ? liveFundCurveMap[code] : []);
            const metric = ['fund_value', 'holdings_value', 'cash'].includes(String(liveFundCurveMetric || '')) ? String(liveFundCurveMetric) : 'fund_value';
            const metricLabel = metric === 'holdings_value' ? '持仓市值' : (metric === 'cash' ? '现金' : '总资产');
            if (!curve.length) {
                line.setAttribute('points', '');
                baseline.setAttribute('points', '');
                dot.setAttribute('opacity', '0');
                meta.innerText = '暂无数据';
                ret.innerText = '区间变化 --';
                ret.className = 'text-[10px] text-slate-300';
                cumRet.innerText = '累计变化 --';
                cumRet.className = 'text-slate-300';
                maxDdEl.innerText = '最大回撤 --';
                maxDdEl.className = 'text-slate-300 text-right';
                rangeEl.innerText = '范围 --';
                legendEl.innerText = `红线=${metricLabel}｜灰线=基准线`;
                return;
            }
            const width = 320;
            const height = 216;
            const values = curve.map(x => Number(x?.[metric] || 0));
            const latest = Number(values[values.length - 1] || 0);
            const intervalBase = Number(values[0] || 0) || 0;
            const initCapital = Number(snap?.initial_capital || intervalBase || latest || 0);
            const baselineSeed = metric === 'fund_value' ? initCapital : intervalBase;
            const baselineValues = curve.map(() => baselineSeed);
            let minV = Math.min(...values, ...baselineValues);
            let maxV = Math.max(...values, ...baselineValues);
            if (Math.abs(maxV - minV) < 0.0001) {
                maxV += 1;
                minV -= 1;
            }
            const buildPoints = (arr) => arr.map((v, idx) => {
                const px = curve.length <= 1 ? 0 : (idx / (curve.length - 1)) * width;
                const py = height - ((Number(v || 0) - minV) / (maxV - minV)) * (height - 4) - 2;
                return `${px.toFixed(2)},${py.toFixed(2)}`;
            }).join(' ');
            line.setAttribute('points', buildPoints(values));
            baseline.setAttribute('points', buildPoints(baselineValues));
            const lastX = curve.length <= 1 ? 0 : 320;
            const lastY = height - ((latest - minV) / (maxV - minV)) * (height - 4) - 2;
            dot.setAttribute('cx', String(lastX));
            dot.setAttribute('cy', String(lastY));
            dot.setAttribute('opacity', '1');
            meta.innerText = `${curve.length}点 | ${metricLabel} ${fmtCurrency(latest)}`;
            rangeEl.innerText = `范围 ${fmtCurrency(minV)} ~ ${fmtCurrency(maxV)}`;
            const latestV = Number(values[values.length - 1] || 0);
            const initV = Number(baselineSeed || 0);
            const isUp = latestV >= initV;
            line.setAttribute('stroke', isUp ? '#f87171' : '#34d399');
            dot.setAttribute('fill', isUp ? '#f87171' : '#34d399');
            const intervalRetPct = intervalBase > 0 ? ((latest - intervalBase) / intervalBase) * 100 : 0;
            ret.innerText = `区间变化 ${intervalRetPct >= 0 ? '+' : ''}${intervalRetPct.toFixed(2)}%`;
            ret.className = intervalRetPct > 0 ? 'text-[10px] text-rose-300' : (intervalRetPct < 0 ? 'text-[10px] text-emerald-300' : 'text-[10px] text-slate-300');
            const cumulativeRetPct = initV > 0 ? ((latestV - initV) / initV) * 100 : 0;
            cumRet.innerText = `累计变化 ${cumulativeRetPct >= 0 ? '+' : ''}${cumulativeRetPct.toFixed(2)}%`;
            cumRet.className = cumulativeRetPct > 0 ? 'text-rose-300' : (cumulativeRetPct < 0 ? 'text-emerald-300' : 'text-slate-300');
            let peak = Number(values[0] || 0);
            let maxDd = 0;
            for (const v of values) {
                const vv = Number(v || 0);
                peak = Math.max(peak, vv);
                if (peak > 0) {
                    maxDd = Math.max(maxDd, (peak - vv) / peak);
                }
            }
            maxDdEl.innerText = `最大回撤 ${(maxDd * 100).toFixed(2)}%`;
            maxDdEl.className = maxDd >= 0.03 ? 'text-rose-300 text-right' : (maxDd >= 0.02 ? 'text-amber-300 text-right' : 'text-emerald-300 text-right');
            legendEl.innerText = metric === 'fund_value' ? '红线=总资产｜灰线=初始资金基准线' : `红线=${metricLabel}｜灰线=区间起点基准线`;
        }

        function renderFundPoolPositions(snap) {
            const tbody = document.getElementById('fund-pool-position-tbody');
            if (!tbody) return;
            const rows = Array.isArray(snap?.positions) ? snap.positions : [];
            if (!rows.length) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-slate-500 py-1">暂无仓位</td></tr>';
                return;
            }
            tbody.innerHTML = rows.map(r => {
                const sid = String(r?.strategy_id || '--');
                const code = String(r?.code || '--');
                const qty = Number(r?.qty || 0);
                const avg = Number(r?.avg_price || 0);
                const mv = Number(r?.market_value || 0);
                return `<tr class="border-t border-slate-800"><td class="py-0.5">${sid}</td><td class="py-0.5">${code}</td><td class="py-0.5 text-right">${qty}</td><td class="py-0.5 text-right">${avg.toFixed(3)}</td><td class="py-0.5 text-right">${mv.toFixed(2)}</td></tr>`;
            }).join('');
        }

        function renderFundPoolTrades() {
            const tbody = document.getElementById('fund-pool-trade-tbody');
            if (!tbody) return;
            const dirSel = document.getElementById('fund-trade-dir-filter');
            const sidInput = document.getElementById('fund-trade-strategy-filter');
            const dir = String(dirSel?.value || 'all').toUpperCase();
            const sidLike = String(sidInput?.value || '').trim();
            const rows = Array.isArray(liveFundTradeRows) ? liveFundTradeRows : [];
            const filtered = rows.filter(x => {
                const xDir = String(x?.direction || '').toUpperCase();
                const xSid = String(x?.strategy_id || '');
                if (dir !== 'ALL' && dir !== 'all' && xDir !== dir) return false;
                if (sidLike && !xSid.includes(sidLike)) return false;
                return true;
            });
            if (!filtered.length) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-slate-500 py-1">暂无成交记录</td></tr>';
                return;
            }
            tbody.innerHTML = filtered.slice(-300).reverse().map(r => {
                const t = String(r?.dt || '--').replace('T', ' ').slice(0, 19);
                const sid = String(r?.strategy_id || '--');
                const d = String(r?.direction || '--').toUpperCase();
                const qty = Number(r?.quantity || 0);
                const price = Number(r?.price || 0);
                const fee = Number(r?.cost || 0);
                const pnl = Number(r?.pnl || 0);
                const pnlCls = pnl > 0 ? 'text-rose-300' : (pnl < 0 ? 'text-emerald-300' : 'text-slate-300');
                const dirCls = d === 'BUY' ? 'text-cyan-300' : (d === 'SELL' ? 'text-amber-300' : 'text-slate-300');
                return `<tr class="border-t border-slate-800"><td class="py-0.5">${t}</td><td class="py-0.5">${sid}</td><td class="py-0.5 ${dirCls}">${d}</td><td class="py-0.5 text-right">${qty}</td><td class="py-0.5 text-right">${price.toFixed(3)}</td><td class="py-0.5 text-right">${fee.toFixed(2)}</td><td class="py-0.5 text-right ${pnlCls}">${pnl.toFixed(2)}</td></tr>`;
            }).join('');
        }

        function renderFundPoolPanel(snap, stockCode) {
            const cashEl = document.getElementById('fund-pool-cash');
            const holdEl = document.getElementById('fund-pool-holdings');
            const assetEl = document.getElementById('fund-pool-assets');
            const pnlEl = document.getElementById('fund-pool-realized');
            const capInput = document.getElementById('fund-pool-capital-input');
            const metricSel = document.getElementById('fund-pool-curve-metric');
            if (!cashEl || !holdEl || !assetEl || !pnlEl) return;
            if (metricSel && metricSel.value !== liveFundCurveMetric) metricSel.value = liveFundCurveMetric;
            if (!snap || typeof snap !== 'object') {
                cashEl.innerText = '--';
                holdEl.innerText = '--';
                assetEl.innerText = '--';
                pnlEl.innerText = '--';
                liveFundTradeRows = [];
                renderFundPoolPositions(null);
                renderFundPoolTrades();
                renderFundPoolCurve(stockCode, null);
                return;
            }
            cashEl.innerText = fmtCurrency(snap.cash);
            holdEl.innerText = fmtCurrency(snap.holdings_value);
            assetEl.innerText = fmtCurrency(snap.fund_value);
            const realized = Number(snap.realized_pnl || 0);
            pnlEl.innerText = `${realized >= 0 ? '+' : ''}${realized.toFixed(2)}`;
            pnlEl.className = realized > 0 ? 'font-mono text-rose-300' : (realized < 0 ? 'font-mono text-emerald-300' : 'font-mono text-slate-200');
            const initCapital = Number(snap.initial_capital || 0);
            if (capInput) {
                capInput.placeholder = initCapital > 0 ? String(Math.round(initCapital)) : '初始资金';
            }
            liveFundTradeRows = Array.isArray(snap.trade_details) ? snap.trade_details : [];
            renderFundPoolPositions(snap);
            renderFundPoolTrades();
            renderFundPoolCurve(stockCode, snap);
        }

        function ingestFundPoolSnapshot(data, payloadStockCode, withTrades) {
            const stockCode = String(data?.stock_code || payloadStockCode || '').toUpperCase();
            if (!stockCode) return;
            const snap = Object.assign({}, data || {});
            if (!withTrades && Array.isArray(DIAG_STATE.liveFundPools?.[stockCode]?.trade_details)) {
                const prevTrades = DIAG_STATE.liveFundPools[stockCode].trade_details;
                const nextTrades = Array.isArray(snap.trade_details) ? snap.trade_details : [];
                if (!nextTrades.length || prevTrades.length > nextTrades.length) {
                    snap.trade_details = prevTrades;
                }
            }
            if (!DIAG_STATE.liveFundPools) DIAG_STATE.liveFundPools = {};
            DIAG_STATE.liveFundPools[stockCode] = snap;
            appendFundCurvePoint(stockCode, snap);
            updateFundPoolStockSelect();
            const selected = liveFundPoolSelectedCode || fundPoolSelectedCodeFallback();
            if (selected && selected === stockCode) {
                renderFundPoolPanel(snap, stockCode);
            } else if (selected === FUND_POOL_PORTFOLIO_KEY) {
                renderFundPoolPanel(buildPortfolioFundPoolSnapshot(), FUND_POOL_PORTFOLIO_KEY);
            } else if (!liveFundPoolSelectedCode && stockCode) {
                liveFundPoolSelectedCode = stockCode;
                renderFundPoolPanel(snap, stockCode);
            }
        }

        async function refreshFundPoolPanel(stockCode = null) {
            const selected = String(stockCode || liveFundPoolSelectedCode || fundPoolSelectedCodeFallback() || '').toUpperCase();
            if (!selected) {
                renderFundPoolPanel(null, '');
                return;
            }
            liveFundPoolSelectedCode = selected;
            if (selected === FUND_POOL_PORTFOLIO_KEY) {
                renderFundPoolPanel(buildPortfolioFundPoolSnapshot(), FUND_POOL_PORTFOLIO_KEY);
                liveFundLastFetchAt = Date.now();
                return;
            }
            try {
                const res = await fetch(`/api/live/fund_pool?stock_code=${encodeURIComponent(selected)}&include_transactions=true&tx_limit=1000`);
                const data = await res.json();
                if (!res.ok || data.status !== 'success' || !data.fund_pool) {
                    throw new Error(data.msg || '资金池获取失败');
                }
                ingestFundPoolSnapshot(data.fund_pool, selected, true);
                liveFundLastFetchAt = Date.now();
            } catch (e) {
                logMessage('SYSTEM', `资金池刷新失败(${selected}): ${e}`, 'danger');
            }
        }

        function onFundPoolStockChange(code) {
            liveFundPoolSelectedCode = String(code || '').toUpperCase();
            liveFundPoolSelectionTouched = true;
            if (liveFundPoolSelectedCode === FUND_POOL_PORTFOLIO_KEY) {
                renderFundPoolPanel(buildPortfolioFundPoolSnapshot(), FUND_POOL_PORTFOLIO_KEY);
                return;
            }
            const snap = DIAG_STATE.liveFundPools?.[liveFundPoolSelectedCode];
            if (snap) {
                renderFundPoolPanel(snap, liveFundPoolSelectedCode);
            } else {
                refreshFundPoolPanel(liveFundPoolSelectedCode);
            }
        }

        async function resetFundPoolByUI() {
            const selected = String(liveFundPoolSelectedCode || fundPoolSelectedCodeFallback() || '').toUpperCase();
            if (!selected) {
                logMessage('SYSTEM', '请先选择资金池标的', 'warning');
                return;
            }
            const panelCapInput = document.getElementById('fund-pool-capital-input');
            const panelRaw = String(panelCapInput?.value || '').trim();
            const panelCapVal = Number(panelRaw || 0);
            const customCap = (panelRaw && Number.isFinite(panelCapVal) && panelCapVal > 0) ? panelCapVal : null;
            const requestReset = async (code) => {
                const payload = { stock_code: code };
                if (customCap !== null) payload.initial_capital = customCap;
                const res = await fetch('/api/live/fund_pool/reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok || data.status !== 'success') {
                    throw new Error(data.msg || '重置失败');
                }
                return data;
            };
            if (selected === FUND_POOL_PORTFOLIO_KEY) {
                const codes = Object.keys(DIAG_STATE.liveFundPools || {})
                    .map(x => String(x || '').toUpperCase())
                    .filter(x => x && x !== FUND_POOL_PORTFOLIO_KEY);
                if (!codes.length) {
                    logMessage('SYSTEM', '组合内暂无可重置标的', 'warning');
                    return;
                }
                if (!window.confirm(`确认重置组合内全部 ${codes.length} 只标的的虚拟资金池吗？`)) return;
                const failed = [];
                for (const code of codes) {
                    try {
                        await requestReset(code);
                    } catch (e) {
                        failed.push(`${code}: ${String(e?.message || e || '重置失败')}`);
                    }
                }
                if (failed.length) {
                    logMessage('SYSTEM', `组合批量重置完成，失败 ${failed.length} 只：${failed.join(' | ')}`, 'danger');
                } else {
                    logMessage('SYSTEM', `组合批量重置成功：共 ${codes.length} 只`, 'warning');
                }
                await refreshFundPoolPanel(FUND_POOL_PORTFOLIO_KEY);
                return;
            }
            if (!window.confirm(`确认重置 ${selected} 的虚拟资金池吗？`)) return;
            try {
                await requestReset(selected);
                logMessage('SYSTEM', `资金池已重置: ${selected}`, 'warning');
                await refreshFundPoolPanel(selected);
            } catch (e) {
                logMessage('SYSTEM', `资金池重置失败(${selected}): ${e}`, 'danger');
            }
        }

        function toggleDebugPanel() {
            const panel = document.getElementById('debug-panel');
            if (!panel) return;
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden')) updateDebugPanel();
        }

        function updateDebugPanel() {
            const conn = document.getElementById('debug-conn-status');
            const latency = document.getElementById('debug-api-latency');
            const tick = document.getElementById('debug-tick-trigger');
            const rejects = document.getElementById('debug-risk-rejects');
            const breakdown = document.getElementById('debug-confidence-breakdown');
            if (conn) {
                conn.className = `font-mono ${DIAG_STATE.wsConnected ? 'text-emerald-300' : 'text-rose-300'}`;
                conn.innerText = DIAG_STATE.wsConnected ? '已连接' : '已断开';
            }
            if (latency) {
                latency.innerText = DIAG_STATE.apiLatencyMs === null ? '-- 毫秒' : `${DIAG_STATE.apiLatencyMs} 毫秒`;
            }
            if (tick) {
                tick.innerText = `${DIAG_STATE.tickTriggerText}\n${DIAG_STATE.tickStrategyText}`;
            }
            if (rejects) {
                if (!DIAG_STATE.riskRejects.length) {
                    rejects.innerHTML = '<div class="text-slate-400">暂无</div>';
                } else {
                    rejects.innerHTML = DIAG_STATE.riskRejects.map(x => `<div>${x}</div>`).join('');
                }
            }
            if (breakdown) {
                breakdown.innerText = document.getElementById('confidence-desc')?.innerText || '--';
            }
        }

        function pushConfidencePoint(name, value) {
            const arr = DIAG_STATE.confidenceSeries[name];
            if (!arr) return;
            arr.push(Math.max(0, Math.min(100, Number(value || 0))));
            if (arr.length > 60) arr.shift();
        }

        function buildSparklinePoints(series, width, height) {
            if (!Array.isArray(series) || !series.length) return '';
            if (series.length === 1) return `0,${height - (series[0] / 100) * height}`;
            return series.map((v, idx) => {
                const x = (idx / (series.length - 1)) * width;
                const y = height - (Math.max(0, Math.min(100, v)) / 100) * height;
                return `${x.toFixed(2)},${y.toFixed(2)}`;
            }).join(' ');
        }

        function renderConfidenceSparkline(consistency, passrate, winrate) {
            pushConfidencePoint('consistency', consistency);
            pushConfidencePoint('passrate', passrate);
            pushConfidencePoint('winrate', winrate);
            const w = 210;
            const h = 48;
            const cLine = document.getElementById('confidence-line-consistency');
            const pLine = document.getElementById('confidence-line-passrate');
            const wLine = document.getElementById('confidence-line-winrate');
            if (cLine) cLine.setAttribute('points', buildSparklinePoints(DIAG_STATE.confidenceSeries.consistency, w, h));
            if (pLine) pLine.setAttribute('points', buildSparklinePoints(DIAG_STATE.confidenceSeries.passrate, w, h));
            if (wLine) wLine.setAttribute('points', buildSparklinePoints(DIAG_STATE.confidenceSeries.winrate, w, h));
            setMetricText('confidence-consistency-val', `一致性 ${Number(consistency).toFixed(1)}%`, Number(consistency));
            setMetricText('confidence-passrate-val', `放行率 ${Number(passrate).toFixed(1)}%`, Number(passrate));
            setMetricText('confidence-winrate-val', `胜率 ${Number(winrate).toFixed(1)}%`, Number(winrate));
        }

        function toRatePercent(value) {
            const num = Number(value);
            if (!Number.isFinite(num)) return null;
            const pct = num <= 1 ? num * 100 : num;
            return Math.max(0, Math.min(100, pct));
        }

        function computeWeightedWinRate(rows, winRateKey, weightKey) {
            if (!Array.isArray(rows) || !rows.length) return null;
            let weightedSum = 0;
            let totalWeight = 0;
            let simpleSum = 0;
            let simpleCount = 0;
            rows.forEach(row => {
                const wrPct = toRatePercent(row?.[winRateKey]);
                if (wrPct === null) return;
                const weight = Number(row?.[weightKey]);
                if (Number.isFinite(weight) && weight > 0) {
                    weightedSum += wrPct * weight;
                    totalWeight += weight;
                }
                simpleSum += wrPct;
                simpleCount += 1;
            });
            if (totalWeight > 0) return weightedSum / totalWeight;
            if (simpleCount > 0) return simpleSum / simpleCount;
            return null;
        }

        function updateConfidenceScore() {
            const consistency = Math.max(0, Math.min(100, Number(DIAG_STATE.signalConsistency || 0)));
            const riskTotal = DIAG_STATE.riskApproved + DIAG_STATE.riskRejected;
            const riskPassRate = riskTotal > 0 ? (DIAG_STATE.riskApproved / riskTotal) * 100 : 50;
            const reportWinRate = Number.isFinite(Number(DIAG_STATE.backtestReportWinRate)) ? Number(DIAG_STATE.backtestReportWinRate) : null;
            const summaryWinRate = Number.isFinite(Number(DIAG_STATE.backtestSummaryWinRate)) ? Number(DIAG_STATE.backtestSummaryWinRate) : null;
            let recentWinRate = reportWinRate;
            if (recentWinRate === null) recentWinRate = summaryWinRate;
            if (recentWinRate === null) {
                const wins = DIAG_STATE.recentPnls.filter(v => v > 0).length;
                const losses = DIAG_STATE.recentPnls.filter(v => v <= 0).length;
                const tradeTotal = wins + losses;
                recentWinRate = tradeTotal > 0 ? (wins / tradeTotal) * 100 : 50;
            }
            const score = consistency * 0.40 + riskPassRate * 0.35 + recentWinRate * 0.25;

            const valEl = document.getElementById('confidence-val');
            const barEl = document.getElementById('confidence-bar');
            if (valEl) setMetricText('confidence-val', `${score.toFixed(1)}%`, score);
            if (barEl) {
                barEl.style.transition = 'width 360ms cubic-bezier(0.22,1,0.36,1)';
                barEl.style.width = `${Math.max(0, Math.min(100, score)).toFixed(1)}%`;
            }
            renderConfidenceSparkline(consistency, riskPassRate, recentWinRate);
            updateDebugPanel();
        }

        function applyLiveVisibility() {
            const liveConsolePanel = document.getElementById('live-console-panel');
            const liveStreamPanel = document.getElementById('live-stream-panel');
            const liveStatusWrap = document.getElementById('live-status-wrap');
            const liveToggleBtn = document.getElementById('live-toggle-btn');
            const backtestTriggerBtn = document.getElementById('backtest-trigger-btn');
            const patternPickerBtn = document.getElementById('pattern-picker-btn');
            const patternPickerMenuBtn = document.getElementById('pattern-picker-menu-btn');
            if (liveConsolePanel) liveConsolePanel.classList.toggle('hidden', !liveEnabled);
            if (liveStreamPanel) liveStreamPanel.classList.remove('hidden');
            if (liveStatusWrap) liveStatusWrap.classList.toggle('hidden', !liveEnabled);
            if (liveToggleBtn) liveToggleBtn.classList.toggle('hidden', !liveEnabled);
            if (backtestTriggerBtn) backtestTriggerBtn.classList.toggle('hidden', liveEnabled);
            if (patternPickerBtn) patternPickerBtn.classList.toggle('hidden', liveEnabled);
            if (patternPickerMenuBtn) patternPickerMenuBtn.classList.toggle('hidden', liveEnabled);
            if (liveEnabled) closePatternPicker();
            syncRuntimeParamsUI();
            updateWebhookRetryEntryState();
            syncActionLayout();
            applyAllRightPanelStates();
        }
        async function openFundPoolModal() {
            fundPoolModalOpen = true;
            const modal = document.getElementById('fund-pool-modal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
            syncFundPoolPanelPlacement();
            if (!liveFundPoolSelectedCode) {
                try {
                    const res = await fetch('/api/live/fund_pool?include_transactions=false');
                    const data = await res.json();
                    if (res.ok && data.status === 'success' && data.fund_pools && typeof data.fund_pools === 'object') {
                        Object.keys(data.fund_pools).forEach(code => ingestFundPoolSnapshot(data.fund_pools[code], code, false));
                        updateFundPoolStockSelect();
                    }
                } catch (_) {}
            }
            refreshFundPoolPanel();
        }
        function closeFundPoolModal() {
            fundPoolModalOpen = false;
            const modal = document.getElementById('fund-pool-modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
            syncFundPoolPanelPlacement();
        }
        function syncFundPoolPanelPlacement() {
            const checkPanel = document.getElementById('fund-pool-panel-block');
            const lotPanel = document.getElementById('fund-pool-lot-block');
            const managePanel = document.getElementById('fund-pool-manage-block');
            const modalHost = document.getElementById('fund-pool-modal-host');
            const liveConsoleBody = document.getElementById('live-console-body');
            if (!modalHost || !liveConsoleBody) return;
            if (fundPoolModalOpen) {
                if (checkPanel && checkPanel.parentElement !== modalHost) modalHost.appendChild(checkPanel);
                if (lotPanel && lotPanel.parentElement !== modalHost) modalHost.appendChild(lotPanel);
                if (managePanel && managePanel.parentElement !== modalHost) modalHost.appendChild(managePanel);
                if (checkPanel) checkPanel.className = 'bg-slate-900/60 border border-slate-700 rounded p-2';
                if (lotPanel) lotPanel.className = 'mt-2 bg-slate-900/60 border border-slate-700 rounded p-2';
                if (managePanel) managePanel.className = 'mt-2 bg-slate-900/60 border border-slate-700 rounded p-2';
            } else {
                const anchor = document.getElementById('live-exception-panel');
                if (checkPanel && checkPanel.parentElement !== liveConsoleBody) liveConsoleBody.insertBefore(checkPanel, anchor);
                if (lotPanel && lotPanel.parentElement !== liveConsoleBody) liveConsoleBody.insertBefore(lotPanel, anchor);
                if (managePanel && managePanel.parentElement !== liveConsoleBody) liveConsoleBody.insertBefore(managePanel, anchor);
                if (checkPanel) checkPanel.className = 'mt-2 bg-slate-900/60 border border-slate-700 rounded p-2';
                if (lotPanel) lotPanel.className = 'mt-2 bg-slate-900/60 border border-slate-700 rounded p-2';
                if (managePanel) managePanel.className = 'mt-2 bg-slate-900/60 border border-slate-700 rounded p-2';
            }
        }
        function loadPanelHeightPrefs() {
            try {
                const raw = localStorage.getItem('jince-right-panel-heights-v1');
                const parsed = JSON.parse(String(raw || '{}'));
                if (!parsed || typeof parsed !== 'object') return;
                const toNum = (v) => {
                    const n = Number(v);
                    return Number.isFinite(n) && n > 0 ? n : null;
                };
                panelHeightPrefs = {
                    strategy: toNum(parsed.strategy),
                    console: toNum(parsed.console),
                    stream: toNum(parsed.stream)
                };
            } catch (_) {}
        }
        function savePanelHeightPrefs() {
            try {
                localStorage.setItem('jince-right-panel-heights-v1', JSON.stringify(panelHeightPrefs || {}));
            } catch (_) {}
        }
        function applyPanelHeightPrefs() {
            const strategy = document.getElementById('strategy-quick-panel');
            const consolePanel = document.getElementById('live-console-panel');
            const streamPanel = document.getElementById('live-stream-panel');
            const strategyExpanded = !!rightPanelPrefs.strategy;
            const consoleExpanded = !!rightPanelPrefs.console;
            const streamExpanded = !!rightPanelPrefs.stream;
            if (strategy) {
                if (strategyExpanded && Number(panelHeightPrefs.strategy || 0) >= 140) {
                    strategy.style.height = `${Number(panelHeightPrefs.strategy)}px`;
                } else {
                    strategy.style.height = '';
                }
            }
            if (consolePanel) {
                if (consoleExpanded && Number(panelHeightPrefs.console || 0) >= 180) {
                    consolePanel.style.height = `${Number(panelHeightPrefs.console)}px`;
                } else {
                    consolePanel.style.height = '';
                }
            }
            if (streamPanel) {
                if (streamExpanded && Number(panelHeightPrefs.stream || 0) >= 180) {
                    streamPanel.style.height = `${Number(panelHeightPrefs.stream)}px`;
                    streamPanel.classList.remove('flex-1');
                    streamPanel.classList.add('flex-none');
                } else if (streamExpanded) {
                    streamPanel.style.height = '';
                    streamPanel.classList.remove('flex-none');
                    streamPanel.classList.add('flex-1');
                } else {
                    streamPanel.style.height = '';
                }
            }
        }
        function startPanelResize(key, ev) {
            const k = String(key || '');
            if (!['strategy', 'console', 'stream'].includes(k)) return;
            if ((k === 'strategy' && !rightPanelPrefs.strategy) || (k === 'console' && !rightPanelPrefs.console) || (k === 'stream' && !rightPanelPrefs.stream)) return;
            const map = {
                strategy: { id: 'strategy-quick-panel', min: 140 },
                console: { id: 'live-console-panel', min: 180 },
                stream: { id: 'live-stream-panel', min: 180 }
            };
            const target = document.getElementById(map[k].id);
            if (!target) return;
            ev.preventDefault();
            const startY = Number(ev.clientY || 0);
            const startH = Number(target.getBoundingClientRect().height || 0);
            const onMove = (e) => {
                const dy = Number(e.clientY || 0) - startY;
                const nextH = Math.max(map[k].min, Math.round(startH + dy));
                panelHeightPrefs[k] = nextH;
                applyPanelHeightPrefs();
            };
            const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                savePanelHeightPrefs();
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        }
        loadRightPanelPrefs();
        loadPanelHeightPrefs();
        loadRightLayoutPreset();
        applyLiveVisibility();
        renderLiveStatus();
        renderLiveExceptionPanel();
        syncFundPoolPanelPlacement();
        updateFundPoolStockSelect();
        renderFundPoolPanel(null, '');

        function isCompactActionLayout() {
            return actionLayoutMode === 'compact';
        }

        function closeActionMoreMenu() {
            const menu = document.getElementById('action-more-menu');
            if (menu) menu.classList.add('hidden');
        }

        function toggleActionMoreMenu() {
            const menu = document.getElementById('action-more-menu');
            if (!menu) return;
            menu.classList.toggle('hidden');
        }

        function syncActionLayout() {
            const cluster = document.getElementById('action-cluster');
            const inline = document.getElementById('action-secondary-inline');
            const moreWrap = document.getElementById('action-more-wrap');
            const backtestBtn = document.getElementById('backtest-trigger-btn');
            if (!cluster || !inline || !moreWrap) return;
            const w = window.innerWidth || 1920;
            actionLayoutMode = liveEnabled ? 'expanded' : (w < 1650 ? 'compact' : 'expanded');
            if (isCompactActionLayout()) {
                cluster.className = 'flex items-center gap-2';
                inline.classList.add('hidden');
                moreWrap.classList.remove('hidden');
                if (backtestBtn) backtestBtn.classList.remove('min-w-[128px]');
                if (backtestBtn) backtestBtn.classList.add('min-w-[108px]');
            } else {
                cluster.className = 'flex items-center gap-2 flex-nowrap justify-end';
                inline.classList.remove('hidden');
                moreWrap.classList.add('hidden');
                closeActionMoreMenu();
                if (backtestBtn) backtestBtn.classList.remove('min-w-[108px]');
                if (backtestBtn) backtestBtn.classList.add('min-w-[128px]');
            }
            updateWebhookRetryEntryState();
        }

        function syncRuntimeParamsUI() {
            const btnLabel = document.getElementById('runtime-params-btn-label');
            const title = document.getElementById('runtime-params-title');
            const liveModeRow = document.getElementById('runtime-live-allocation-mode-row');
            const liveWeightsRow = document.getElementById('runtime-live-allocation-weights-row');
            const drawer = document.getElementById('live-params-drawer');
            if (btnLabel) btnLabel.innerText = liveEnabled ? '运行参数' : '回测参数';
            if (title) title.innerText = liveEnabled ? '运行参数（实盘）' : '运行参数（回测）';
            if (liveModeRow) liveModeRow.classList.toggle('hidden', !liveEnabled);
            if (liveWeightsRow) liveWeightsRow.classList.toggle('hidden', !liveEnabled);
            if (!liveEnabled && drawer && !drawer.classList.contains('pointer-events-none')) {
                const modeSel = document.getElementById('live-allocation-mode');
                const weightsInput = document.getElementById('live-allocation-weights');
                if (modeSel) modeSel.value = 'equal';
                if (weightsInput) weightsInput.value = '';
            }
        }

        function updateWebhookRetryEntryState() {
            const inlineBtn = document.getElementById('webhook-retry-btn');
            const menuBtn = document.getElementById('webhook-retry-menu-btn');
            if (inlineBtn) inlineBtn.classList.toggle('hidden', !liveEnabled);
            if (menuBtn) menuBtn.classList.toggle('hidden', !liveEnabled);
            if (!liveEnabled) closeWebhookRetryCenter();
        }

        function loadRightPanelPrefs() {
            try {
                const raw = localStorage.getItem('jince-right-panels-v1');
                if (!raw) return;
                const parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object') return;
                rightPanelPrefs = {
                    strategy: parsed.strategy !== false,
                    console: parsed.console !== false,
                    stream: parsed.stream !== false
                };
            } catch (_) {}
        }

        function saveRightPanelPrefs() {
            try {
                localStorage.setItem('jince-right-panels-v1', JSON.stringify(rightPanelPrefs));
            } catch (_) {}
        }

        function loadRightLayoutPreset() {
            try {
                const raw = localStorage.getItem('jince-right-layout-preset-v1');
                const value = String(raw || '').trim();
                if (['balanced', 'monitor', 'strategy', 'alert', 'custom'].includes(value)) {
                    rightLayoutPreset = value;
                }
            } catch (_) {}
        }

        function saveRightLayoutPreset() {
            try {
                localStorage.setItem('jince-right-layout-preset-v1', String(rightLayoutPreset || 'balanced'));
            } catch (_) {}
        }

        function updateRightPresetButtons() {
            const b1 = document.getElementById('right-preset-monitor');
            const b2 = document.getElementById('right-preset-strategy');
            const b3 = document.getElementById('right-preset-alert');
            const activeCls = 'text-[10px] px-2 py-1 rounded border';
            if (b1) {
                b1.className = rightLayoutPreset === 'monitor'
                    ? `${activeCls} bg-cyan-500 text-white border-cyan-400`
                    : `${activeCls} bg-cyan-800/60 hover:bg-cyan-700 text-cyan-100 border-cyan-700`;
            }
            if (b2) {
                b2.className = rightLayoutPreset === 'strategy'
                    ? `${activeCls} bg-indigo-500 text-white border-indigo-400`
                    : `${activeCls} bg-indigo-800/60 hover:bg-indigo-700 text-indigo-100 border-indigo-700`;
            }
            if (b3) {
                b3.className = rightLayoutPreset === 'alert'
                    ? `${activeCls} bg-rose-500 text-white border-rose-400`
                    : `${activeCls} bg-rose-800/60 hover:bg-rose-700 text-rose-100 border-rose-700`;
            }
        }

        function applyRightLayoutPresetVisual() {
            const stack = document.getElementById('right-panel-stack');
            if (!stack) return;
            const strategyExpanded = !!rightPanelPrefs.strategy;
            if (!strategyExpanded) {
                stack.style.gridTemplateRows = '64px minmax(0, 1fr)';
            } else if (rightLayoutPreset === 'strategy') {
                stack.style.gridTemplateRows = '2.1fr 0.9fr';
            } else if (rightLayoutPreset === 'monitor' || rightLayoutPreset === 'alert') {
                stack.style.gridTemplateRows = '0.85fr 2.15fr';
            } else {
                stack.style.gridTemplateRows = 'minmax(0, 1fr) minmax(0, 1fr)';
            }
            updateRightPresetButtons();
        }

        function setRightLayoutPreset(mode) {
            const m = String(mode || '').trim();
            if (!['monitor', 'strategy', 'alert', 'balanced'].includes(m)) return;
            rightLayoutPreset = m;
            if (m === 'monitor') {
                rightPanelPrefs = { strategy: false, console: false, stream: true };
            } else if (m === 'strategy') {
                rightPanelPrefs = { strategy: true, console: false, stream: false };
            } else if (m === 'alert') {
                rightPanelPrefs = { strategy: false, console: true, stream: false };
            } else {
                rightPanelPrefs = { strategy: true, console: true, stream: true };
            }
            applyAllRightPanelStates();
            applyRightLayoutPresetVisual();
            saveRightPanelPrefs();
            saveRightLayoutPreset();
        }

        function applyRightPanelState(key) {
            const expanded = !!rightPanelPrefs[key];
            if (key === 'strategy') {
                const panel = document.getElementById('strategy-quick-panel');
                const body = document.getElementById('strategy-quick-body');
                const btn = document.getElementById('strategy-quick-toggle-btn');
                if (!panel || !body || !btn) return;
                if (expanded) {
                    panel.className = 'glass-panel rounded-lg p-3 border border-slate-700/70 h-full min-h-0 overflow-y-auto';
                    body.classList.remove('hidden');
                    btn.innerText = '折叠';
                } else {
                    panel.className = 'glass-panel rounded-lg p-3 border border-slate-700/70 h-auto min-h-[64px] overflow-hidden';
                    body.classList.add('hidden');
                    btn.innerText = '展开';
                }
                return;
            }
            if (key === 'console') {
                const panel = document.getElementById('live-console-panel');
                const body = document.getElementById('live-console-body');
                const btn = document.getElementById('live-console-toggle-btn');
                if (!panel || !body || !btn) return;
                if (expanded) {
                    panel.className = 'hidden glass-panel rounded-lg p-3 border border-slate-700/70 shrink-0 min-h-[180px] max-h-[58%] overflow-y-auto';
                    body.classList.remove('hidden');
                    btn.innerText = '折叠';
                } else {
                    panel.className = 'hidden glass-panel rounded-lg p-3 border border-slate-700/70 shrink-0 min-h-[64px] max-h-[64px] overflow-hidden';
                    body.classList.add('hidden');
                    btn.innerText = '展开';
                }
                panel.classList.toggle('hidden', !liveEnabled);
                return;
            }
            if (key === 'stream') {
                const panel = document.getElementById('live-stream-panel');
                const body = document.getElementById('imperial-timeline');
                const btn = document.getElementById('live-stream-toggle-btn');
                if (!panel || !body || !btn) return;
                if (expanded) {
                    panel.className = 'glass-panel flex-1 min-h-[180px] rounded-lg p-0 overflow-hidden flex flex-col';
                    body.classList.remove('hidden');
                    btn.innerText = '折叠';
                } else {
                    panel.className = 'glass-panel flex-none min-h-[64px] max-h-[64px] rounded-lg p-0 overflow-hidden flex flex-col';
                    body.classList.add('hidden');
                    btn.innerText = '展开';
                }
            }
        }

        function applyAllRightPanelStates() {
            applyRightPanelState('strategy');
            applyRightPanelState('console');
            applyRightPanelState('stream');
            applyRightLayoutPresetVisual();
            applyPanelHeightPrefs();
        }

        function toggleRightPanel(key) {
            if (!['strategy', 'console', 'stream'].includes(String(key || ''))) return;
            rightPanelPrefs[key] = !rightPanelPrefs[key];
            rightLayoutPreset = 'custom';
            applyRightPanelState(key);
            saveRightPanelPrefs();
            saveRightLayoutPreset();
            applyRightLayoutPresetVisual();
        }
        let configDraft = {};
        let webhookFailedEvents = [];
        let webhookFailedSelectedIds = new Set();
        const WEBHOOK_CATEGORY_OPTIONS_DEFAULT = [
            { value: 'A', label: 'A 系统生命周期', desc: '启动/停止/切换/配置生效' },
            { value: 'B', label: 'B 系统异常', desc: '异常/失败/退出' },
            { value: 'C', label: 'C 交易决策', desc: '策略信号（zhongshu）' },
            { value: 'D', label: 'D 风控结果', desc: '风控结果（menxia）' },
            { value: 'E', label: 'E 成交执行', desc: '成交信号（trade_exec）' },
            { value: 'F', label: 'F 账户资金', desc: 'account/fund_pool' },
            { value: 'G', label: 'G 监控告警', desc: 'live_alert' },
            { value: 'H', label: 'H 健康快照', desc: 'live_monitor_snapshot/live_kline_freshness' },
            { value: 'I', label: 'I 持仓手数', desc: 'live_position_lots' },
            { value: 'J', label: 'J 回测进度', desc: 'backtest_progress/backtest_flow' },
            { value: 'K', label: 'K 回测结果', desc: 'backtest_result/backtest_failed/backtest_strategy_report' },
            { value: 'L', label: 'L 数据链路调试', desc: '拉取K线/rt_min/stk_mins' }
        ];
        let webhookCategoryOptions = WEBHOOK_CATEGORY_OPTIONS_DEFAULT.slice();
        let fundamentalInterfaceOptions = [];
        let fundamentalCacheRows = [];
        let fundamentalDetailPayload = {};
        let fundamentalModuleDetailKey = '';

        function normalizeFundamentalInterfaceOptions(catalog) {
            const out = [];
            const categories = Array.isArray(catalog?.categories) ? catalog.categories : [];
            categories.forEach(cat => {
                const catLabel = String(cat?.label || cat?.category || '未分类');
                const interfaces = Array.isArray(cat?.interfaces) ? cat.interfaces : [];
                interfaces.forEach(item => {
                    const key = String(item?.key || '').trim();
                    if (!key) return;
                    const label = String(item?.label || key);
                    const api = String(item?.api || '');
                    const cost = String(item?.cost_level || '');
                    out.push({
                        value: key,
                        label: `${label} (${key})`,
                        desc: `${catLabel}${api ? ` | API=${api}` : ''}${cost ? ` | 成本=${cost}` : ''}`,
                    });
                });
            });
            return out;
        }

        const BIZ_SECTIONS = [
            {
                title: '系统总控',
                subtitle: '运行模式与全局开关',
                fields: [
                    { path: 'system.mode', label: '运行模式', type: 'select', options: [{ value: 'backtest', label: '回测模式' }, { value: 'live', label: '实盘模式' }], desc: '用于切换系统主流程（回测/实盘）' },
                    { path: 'system.enable_live', label: '启用实盘', type: 'boolean', desc: '实盘总开关；需与“运行模式=实盘”同时满足才会生效' },
                    // 自动实盘启动：默认开启，默认时间 09:20，可按运营需要在配置中心改动。
                    { path: 'system.live_auto_start_enabled', label: '自动开启实盘', type: 'boolean', default: true, desc: '开启后在指定时间自动拉起实盘任务（仅在运行模式=实盘且启用实盘时触发）' },
                    { path: 'system.live_auto_start_time', label: '自动开启时间', type: 'text', default: '09:20', placeholder: 'HH:MM，例如 09:20', desc: '24小时制，格式 HH:MM；配置非法时服务端会回退到 09:20' },
                    { path: 'system.initial_capital', label: '系统初始资金', type: 'number', unit: '元', min: 10000, max: 100000000, step: 10000, slider: true },
                    { path: 'system.live_kline_log_on_change_only', label: 'K线明细仅变化时打印', type: 'boolean', desc: '开启后仅在分钟K线数据变化时打印明细，减少并发标的日志噪声' },
                    { path: 'system.log_level', label: '日志级别', type: 'select', options: [{ value: 'DEBUG', label: '调试' }, { value: 'INFO', label: '信息' }, { value: 'WARNING', label: '警告' }, { value: 'ERROR', label: '错误' }] }
                ]
            },
            {
                title: '太子院标的池',
                subtitle: '标的列表与监控对象',
                fields: [
                    { path: 'targets', label: '监控标的列表', type: 'lines', itemType: 'string', hint: '每行一个股票代码，例如 301227.SZ' }
                ]
            },
            {
                title: '工部数据源',
                subtitle: '主数据源与回退策略',
                fields: [
                    { path: 'data_provider.source', label: '主数据源', type: 'select', options: [{ value: 'default', label: 'default' }, { value: 'akshare', label: 'akshare' }, { value: 'tushare', label: 'tushare' }, { value: 'mysql', label: 'mysql' }, { value: 'postgresql', label: 'postgresql' }, { value: 'tdx', label: 'tdx' }] },
                    { path: 'data_provider.enable_fallback', label: '启用数据回退', type: 'boolean' },
                    { path: 'live_monitoring.minute_close_confirm.enabled', label: '分钟收盘确认触发', type: 'boolean', desc: '开启后实盘信号在下一分钟到来时，按上一分钟已收盘K线触发，减少分钟内抖动误触发。' },
                    { path: 'data_provider.backtest_cache_db_source', label: '回测缓存落库源', type: 'select', options: [{ value: '', label: '关闭' }, { value: 'mysql', label: 'mysql' }, { value: 'postgresql', label: 'postgresql' }] },
                    { path: 'data_provider.tushare_api_url', label: 'Tushare接口地址', type: 'text' },
                    { path: 'data_provider.tushare_token', label: 'Tushare令牌', type: 'password', secret: true },
                    { path: 'data_provider.tdxdir', label: 'TDX数据目录(vipdoc上级)', type: 'text' },
                    { path: 'data_provider.tdx_host', label: 'TDX主机', type: 'text' },
                    { path: 'data_provider.tdx_port', label: 'TDX端口', type: 'number', min: 1, max: 65535, step: 1 },
                    { path: 'data_provider.tdx_node_list', label: 'TDX节点池(host:port,...)', type: 'text' },
                    { path: 'data_provider.tdx_timeout_sec', label: 'TDX超时(秒)', type: 'number', min: 1, max: 60, step: 1 },
                    { path: 'data_provider.tdx_retry_count', label: 'TDX重试次数', type: 'number', min: 0, max: 10, step: 1 },
                    { path: 'data_provider.tdx_max_bars', label: 'TDX最大拉取条数', type: 'number', min: 500, max: 100000, step: 500 },
                    { path: 'data_provider.default_api_key', label: '默认数据服务密钥', type: 'password', secret: true },
                    { path: 'data_provider.default_api_url', label: '默认数据服务地址', type: 'text' },
                    { path: 'data_provider.mysql_host', label: 'MySQL主机', type: 'text' },
                    { path: 'data_provider.mysql_port', label: 'MySQL端口', type: 'number', min: 1, max: 65535, step: 1 },
                    { path: 'data_provider.mysql_user', label: 'MySQL用户', type: 'text' },
                    { path: 'data_provider.mysql_password', label: 'MySQL密码', type: 'password', secret: true },
                    { path: 'data_provider.mysql_database', label: 'MySQL库名', type: 'text' },
                    { path: 'data_provider.mysql_charset', label: 'MySQL字符集', type: 'text' },
                    { path: 'data_provider.mysql_pool_size', label: 'MySQL连接池大小', type: 'number', min: 1, max: 64, step: 1 },
                    { path: 'data_provider.mysql_pool_wait_timeout_sec', label: '连接池等待秒数', type: 'number', min: 1, max: 120, step: 1 },
                    { path: 'data_provider.mysql_query_page_size', label: '分页批量条数', type: 'number', min: 1000, max: 200000, step: 1000 },
                    { path: 'data_provider.mysql_table_1min', label: 'MySQL 1分钟表', type: 'text' },
                    { path: 'data_provider.mysql_table_5min', label: 'MySQL 5分钟表', type: 'text' },
                    { path: 'data_provider.mysql_table_10min', label: 'MySQL 10分钟表', type: 'text' },
                    { path: 'data_provider.mysql_table_15min', label: 'MySQL 15分钟表', type: 'text' },
                    { path: 'data_provider.mysql_table_30min', label: 'MySQL 30分钟表', type: 'text' },
                    { path: 'data_provider.mysql_table_60min', label: 'MySQL 60分钟表', type: 'text' },
                    { path: 'data_provider.mysql_table_day', label: 'MySQL 日线表', type: 'text' },
                    { path: 'data_provider.postgres_host', label: 'PostgreSQL主机', type: 'text' },
                    { path: 'data_provider.postgres_port', label: 'PostgreSQL端口', type: 'number', min: 1, max: 65535, step: 1 },
                    { path: 'data_provider.postgres_user', label: 'PostgreSQL用户', type: 'text' },
                    { path: 'data_provider.postgres_password', label: 'PostgreSQL密码', type: 'password', secret: true },
                    { path: 'data_provider.postgres_database', label: 'PostgreSQL库名', type: 'text' },
                    { path: 'data_provider.postgres_schema', label: 'PostgreSQL Schema', type: 'text' },
                    { path: 'data_provider.postgres_pool_size', label: 'PostgreSQL连接池大小', type: 'number', min: 1, max: 64, step: 1 },
                    { path: 'data_provider.postgres_pool_wait_timeout_sec', label: 'PostgreSQL等待秒数', type: 'number', min: 1, max: 120, step: 1 },
                    { path: 'data_provider.postgres_query_page_size', label: 'PostgreSQL分页条数', type: 'number', min: 1000, max: 200000, step: 1000 },
                    { path: 'data_provider.postgres_table_1min', label: 'PostgreSQL 1分钟表', type: 'text' },
                    { path: 'data_provider.postgres_table_5min', label: 'PostgreSQL 5分钟表', type: 'text' },
                    { path: 'data_provider.postgres_table_10min', label: 'PostgreSQL 10分钟表', type: 'text' },
                    { path: 'data_provider.postgres_table_15min', label: 'PostgreSQL 15分钟表', type: 'text' },
                    { path: 'data_provider.postgres_table_30min', label: 'PostgreSQL 30分钟表', type: 'text' },
                    { path: 'data_provider.postgres_table_60min', label: 'PostgreSQL 60分钟表', type: 'text' },
                    { path: 'data_provider.postgres_table_day', label: 'PostgreSQL 日线表', type: 'text' },
                    { path: 'data_provider.llm_api_url', label: '智能服务地址（OpenAI兼容）', type: 'text' },
                    { path: 'data_provider.llm_api_key', label: '智能服务访问密钥', type: 'password', secret: true },
                    { path: 'data_provider.llm_model', label: '智能模型名称', type: 'text' },
                    { path: 'data_provider.strategy_llm_api_url', label: '新增策略智能服务地址', type: 'text' },
                    { path: 'data_provider.strategy_llm_api_key', label: '新增策略智能服务密钥', type: 'password', secret: true },
                    { path: 'data_provider.strategy_llm_model', label: '新增策略智能模型名称', type: 'text' },
                    { path: 'data_provider.strategy_llm_timeout_sec', label: '新增策略智能超时秒数', type: 'number', min: 30, max: 300, step: 1, slider: true }
                ]
            },
            {
                title: '基本面适配器',
                subtitle: '全局可插拔（回测/实盘共用，按接口勾选）',
                fields: [
                    { path: 'fundamental_adapter.enabled', label: '启用基本面适配器', type: 'boolean' },
                    { path: 'fundamental_adapter.apply_in_backtest', label: '回测阶段启用', type: 'boolean' },
                    { path: 'fundamental_adapter.apply_in_live', label: '实盘阶段启用', type: 'boolean' },
                    { path: 'fundamental_adapter.prefetch_on_backtest_start', label: '回测启动前自动预热', type: 'boolean' },
                    { path: 'fundamental_adapter.provider', label: '提供方', type: 'select', options: [{ value: 'tushare', label: 'tushare' }, { value: 'tdx', label: 'tdx' }] },
                    { path: 'fundamental_adapter.cache_ttl_sec', label: '缓存TTL(秒)', type: 'number', min: 60, max: 604800, step: 60, slider: true },
                    { path: 'fundamental_adapter.min_refresh_interval_sec', label: '最小刷新间隔(秒)', type: 'number', min: 30, max: 43200, step: 30, slider: true },
                    { path: 'fundamental_adapter.disk_persist_enabled', label: '开启落盘缓存', type: 'boolean', desc: '开启后将每次抓取结果写入项目目录，便于人工核对与复盘。' },
                    { path: 'fundamental_adapter.disk_cache_dir', label: '落盘目录', type: 'text', placeholder: 'data/fundamental_cache' },
                    { path: 'fundamental_adapter.disk_cache_max_files', label: '落盘文件上限', type: 'number', min: 50, max: 5000, step: 10, slider: true },
                    { path: 'fundamental_adapter.tushare_interfaces', label: 'Tushare接口勾选', type: 'toggle_map', options: [], desc: '仅勾选需要的接口，降低积分与频率消耗；未勾选接口不会拉取。' }
                ]
            },
            {
                title: '太常寺策略进化（LLM）',
                subtitle: 'Evolution 生成策略专用大模型配置（建议密钥走私有配置）',
                field_groups: [
                    { key: 'basic', name: '基础', defaultOpen: true, paths: ['evolution.llm.enabled', 'evolution.llm.provider', 'evolution.llm.model'] },
                    { key: 'network', name: '网络', defaultOpen: true, paths: ['evolution.llm.base_url', 'evolution.llm.timeout_seconds', 'evolution.llm.retry_times'] },
                    { key: 'security', name: '安全', defaultOpen: false, paths: ['evolution.llm.api_key', 'evolution.llm.fallback_to_mock'] },
                    { key: 'generation', name: '生成策略', defaultOpen: false, paths: ['evolution.llm.temperature', 'evolution.llm.max_tokens', 'evolution.llm.system_prompt'] }
                ],
                fields: [
                    { path: 'evolution.llm.enabled', label: '启用真实LLM', type: 'boolean', desc: '关闭时使用内置Mock生成；开启后按以下配置调用真实模型' },
                    { path: 'evolution.llm.provider', label: '服务类型', type: 'select', options: [{ value: 'openai_compatible', label: 'OpenAI兼容' }] },
                    { path: 'evolution.llm.base_url', label: 'API地址', type: 'text', placeholder: '例如 https://xxx/v1 或 https://xxx/v1/chat/completions' },
                    { path: 'evolution.llm.api_key', label: 'API密钥', type: 'password', secret: true, desc: '密钥字段会走 private_config_path 覆盖，不写入公开配置' },
                    { path: 'evolution.llm.model', label: '模型名', type: 'text', placeholder: '例如 gpt-4o-mini / deepseek-chat' },
                    { path: 'evolution.llm.temperature', label: '采样温度', type: 'number', min: 0, max: 2, step: 0.01, slider: true },
                    { path: 'evolution.llm.max_tokens', label: '最大输出Token', type: 'number', min: 128, max: 8000, step: 1, slider: true },
                    { path: 'evolution.llm.timeout_seconds', label: '请求超时(秒)', type: 'number', min: 5, max: 300, step: 1, slider: true },
                    { path: 'evolution.llm.retry_times', label: '失败重试次数', type: 'number', min: 0, max: 5, step: 1, slider: true },
                    { path: 'evolution.llm.fallback_to_mock', label: '失败回退Mock', type: 'boolean', desc: '开启后真实LLM失败会自动回退到Mock，保证进化流程不中断' },
                    { path: 'evolution.llm.system_prompt', label: '系统提示词', type: 'text', placeholder: '用于约束策略生成风格与输出格式' }
                ]
            },
            {
                title: '工部增量同步',
                subtitle: '历史增量同步写入模式',
                fields: [
                    { path: 'history_sync.write_mode', label: '写入模式', type: 'select', options: [{ value: 'api', label: 'api（写default_api_url）' }, { value: 'direct_db', label: 'direct_db（直连数据库）' }] },
                    { path: 'history_sync.direct_db_source', label: '直连数据库源', type: 'select', options: [{ value: 'mysql', label: 'mysql' }, { value: 'postgresql', label: 'postgresql' }] },
                    { path: 'history_sync.time_mode', label: '时间模式', type: 'select', options: [{ value: 'lookback', label: 'lookback（最近N天）' }, { value: 'custom', label: 'custom（自定义区间）' }] },
                    { path: 'history_sync.lookback_days', label: '默认回看天数', type: 'number', min: 1, max: 3650, step: 1, slider: true },
                    { path: 'history_sync.custom_start_time', label: '自定义开始时间', type: 'text', placeholder: '例如：2026-03-01 09:30:00', desc: '格式：YYYY-MM-DD HH:MM:SS；time_mode=custom时生效' },
                    { path: 'history_sync.custom_end_time', label: '自定义结束时间', type: 'text', placeholder: '例如：2026-03-31 15:00:00', desc: '格式：YYYY-MM-DD HH:MM:SS；time_mode=custom时生效' },
                    { path: 'history_sync.session_only', label: '仅交易时段(09:30-15:00)', type: 'boolean' },
                    { path: 'history_sync.intraday_mode', label: '盘中窗口模式', type: 'boolean' },
                    { path: 'history_sync.max_codes', label: '默认标的上限', type: 'number', min: 1, max: 50000, step: 1, slider: true },
                    { path: 'history_sync.batch_size', label: '默认分批条数', type: 'number', min: 1, max: 5000, step: 1, slider: true },
                    { path: 'history_sync.dry_run', label: '默认仅预演（不写库）', type: 'boolean', desc: '开启=只统计缺失与预计写入，不执行落库；关闭=真实写入数据库' }
                ]
            },
            {
                title: '通告推送',
                subtitle: 'Webhook与飞书通知配置',
                fields: [
                    { path: 'webhook_notification.enabled', label: '启用推送', type: 'boolean' },
                    { path: 'webhook_notification.event_types', label: '推送事件类型', type: 'lines', itemType: 'string', hint: '每行一个事件类型，例如 trade_exec' },
                    { path: 'webhook_notification.webhook_urls', label: '通用Webhook地址列表', type: 'lines', itemType: 'string', hint: '每行一个URL，可配置多个' },
                    { path: 'webhook_notification.feishu_webhook_url', label: '飞书Webhook地址', type: 'password', secret: true },
                    { path: 'webhook_notification.feishu_secret', label: '飞书签名密钥', type: 'password', secret: true },
                    { path: 'webhook_notification.dedupe_window_seconds', label: '去重窗口秒数', type: 'number', min: 0, max: 300, step: 1, slider: true },
                    { path: 'webhook_notification.timeout_sec', label: '单次请求超时秒数', type: 'number', min: 1, max: 60, step: 1, slider: true },
                    { path: 'webhook_notification.max_retries', label: '即时重试次数', type: 'number', min: 0, max: 10, step: 1, slider: true },
                    { path: 'webhook_notification.retry_backoff_seconds', label: '重试退避秒数', type: 'number', min: 0.1, max: 30, step: 0.1, slider: true },
                    { path: 'webhook_notification.persist_failed_events', label: '失败落盘', type: 'boolean' },
                    { path: 'webhook_notification.failed_events_file', label: '失败队列文件', type: 'text' },
                    { path: 'webhook_notification.failed_retry_interval_seconds', label: '补偿重试间隔秒', type: 'number', min: 1, max: 3600, step: 1, slider: true },
                    { path: 'webhook_notification.failed_retry_batch_size', label: '每轮补偿重试条数', type: 'number', min: 1, max: 500, step: 1, slider: true },
                    { path: 'webhook_notification.failed_max_retry', label: '单条最大补偿重试次数', type: 'number', min: 1, max: 200, step: 1, slider: true },
                    { path: 'webhook_notification.category_filter_mode', label: '分类过滤模式', type: 'select', options: [{ value: 'off', label: '关闭过滤（全量）' }, { value: 'whitelist', label: '白名单（仅推送勾选）' }, { value: 'blacklist', label: '黑名单（不推送勾选）' }] },
                    { path: 'webhook_notification.category_codes', label: '分类勾选（A~L）', type: 'checkbox_group', options: WEBHOOK_CATEGORY_OPTIONS_DEFAULT, desc: '白名单模式=仅推送勾选项；黑名单模式=屏蔽勾选项' }
                ]
            },
            {
                title: '吏部策略编组',
                subtitle: '启用策略ID管理',
                fields: [
                    { path: 'strategies.active_ids', label: '激活策略ID', type: 'lines', itemType: 'string', hint: '每行一个策略ID，例如 01' }
                ]
            },
            {
                title: '门下省合规',
                subtitle: '风控阈值配置',
                fields: [
                    { path: 'risk_control.max_stop_loss_pct', label: '单笔最大止损', type: 'number', unit: '%', min: 0.001, max: 0.3, step: 0.001, slider: true, scale: 100 },
                    { path: 'risk_control.max_pos_per_stock', label: '单票最大仓位', type: 'number', unit: '%', min: 0.01, max: 1, step: 0.01, slider: true, scale: 100 },
                    { path: 'risk_control.max_total_pos', label: '总仓位上限', type: 'number', unit: '%', min: 0.01, max: 1, step: 0.01, slider: true, scale: 100 },
                    { path: 'risk_control.max_daily_loss_pct', label: '单日亏损熔断', type: 'number', unit: '%', min: 0.001, max: 0.2, step: 0.001, slider: true, scale: 100 }
                ]
            },
            {
                title: '刑部监察',
                subtitle: '强平与回撤限制参数',
                fields: [
                    { path: 'risk_control.max_total_pos', label: '总仓位上限', type: 'number', unit: '%', min: 0.01, max: 1, step: 0.01, slider: true, scale: 100 },
                    { path: 'risk_control.max_drawdown_pct', label: '回撤限制', type: 'number', unit: '%', min: 0.001, max: 0.5, step: 0.001, slider: true, scale: 100 }
                ]
            },
            {
                title: '户部成本',
                subtitle: '手续费与税费模型',
                fields: [
                    { path: 'trading_cost.commission_rate', label: '手续费率', type: 'number', min: 0, max: 0.01, step: 0.00001, slider: true },
                    { path: 'trading_cost.min_commission', label: '最低手续费', type: 'number', unit: '元', min: 0, max: 100, step: 0.1, slider: true },
                    { path: 'trading_cost.stamp_duty', label: '印花税率', type: 'number', min: 0, max: 0.01, step: 0.00001, slider: true },
                    { path: 'trading_cost.transfer_fee', label: '过户费率', type: 'number', min: 0, max: 0.001, step: 0.000001, slider: true }
                ]
            },
            {
                title: '兵部执行',
                subtitle: '成交滑点与执行偏差',
                fields: [
                    { path: 'execution.slippage', label: '滑点比例', type: 'number', min: 0, max: 0.01, step: 0.0001, slider: true, scale: 100 }
                ]
            }
        ];

        const STRATEGY_FORM_GROUPS = [
            {
                id: 'common',
                name: '公共参数',
                fields: [
                    {
                        path: 'strategy_params.common.order_qty_mode',
                        label: '默认下单模式',
                        type: 'select',
                        options: [
                            { value: 'fixed', label: '固定数量' },
                            { value: 'cash_pct', label: '按持有现金百分比' }
                        ]
                    },
                    { path: 'strategy_params.common.order_qty', label: '默认下单数量', type: 'number', min: 100, max: 100000, step: 100, slider: true, desc: '固定数量模式下生效（单位：股）' },
                    { path: 'strategy_params.common.order_cash_pct', label: '现金下单比例', type: 'number', min: 0.1, max: 100, step: 0.1, slider: true, unit: '%', desc: '现金百分比模式下生效，10 表示 10%（也兼容 0.1 表示 10%）' }
                ]
            },
            { id: '00', name: '00 长期持有', fields: [] },
            { id: '01', name: '01 三周期共振', fields: [{ path: 'strategy_params.01.min_history_bars', label: '最小历史K线', type: 'number', min: 50, max: 5000, step: 10, slider: true }, { path: 'strategy_params.01.daily_ma10_tolerance', label: 'MA10偏离容忍', type: 'number', min: 0.001, max: 0.1, step: 0.001, slider: true, scale: 100 }, { path: 'strategy_params.01.volume_ma_window', label: '量能均线窗口', type: 'number', min: 2, max: 30, step: 1, slider: true }, { path: 'strategy_params.01.stop_loss_pct', label: '止损比例', type: 'number', min: 0.001, max: 0.2, step: 0.001, slider: true, scale: 100 }] },
            { id: '02', name: '02 烂板战法', fields: [{ path: 'strategy_params.02.max_hold_bars', label: '最大持有Bar', type: 'number', min: 10, max: 5000, step: 10, slider: true }] },
            { id: '03', name: '03 ETF轮动', fields: [{ path: 'strategy_params.03.stop_loss_pct', label: '止损比例', type: 'number', min: 0.001, max: 0.2, step: 0.001, slider: true, scale: 100 }] },
            { id: '05', name: '05 3N主升浪', fields: [{ path: 'strategy_params.05.min_30m_bars', label: '最小30分钟K线', type: 'number', min: 10, max: 1000, step: 1, slider: true }, { path: 'strategy_params.05.volume_ma_window', label: '量能均线窗口', type: 'number', min: 2, max: 30, step: 1, slider: true }, { path: 'strategy_params.05.volume_multiple', label: '放量倍数', type: 'number', min: 1, max: 5, step: 0.1, slider: true }, { path: 'strategy_params.05.max_hold_bars', label: '最大持有Bar', type: 'number', min: 10, max: 5000, step: 10, slider: true }, { path: 'strategy_params.05.stop_loss_pct', label: '止损比例', type: 'number', min: 0.001, max: 0.2, step: 0.001, slider: true, scale: 100 }, { path: 'strategy_params.05.take_profit_pct', label: '止盈比例', type: 'number', min: 0.001, max: 0.5, step: 0.001, slider: true, scale: 100 }] },
            { id: '06', name: '06 海豚交易法', fields: [{ path: 'strategy_params.06.min_history_bars', label: '最小历史K线', type: 'number', min: 10, max: 2000, step: 10, slider: true }, { path: 'strategy_params.06.ma_period', label: 'MA周期', type: 'number', min: 5, max: 120, step: 1, slider: true }, { path: 'strategy_params.06.trailing_stop_pct', label: '追踪止损', type: 'number', min: 0.001, max: 0.1, step: 0.001, slider: true, scale: 100 }, { path: 'strategy_params.06.stop_loss_pct', label: '初始止损', type: 'number', min: 0.001, max: 0.1, step: 0.001, slider: true, scale: 100 }] },
            { id: '07', name: '07 跳空交易', fields: [{ path: 'strategy_params.07.min_15m_bars', label: '最小15分钟K线', type: 'number', min: 10, max: 1000, step: 1, slider: true }, { path: 'strategy_params.07.gap_down_multiplier', label: '低开阈值系数', type: 'number', min: 0.95, max: 1, step: 0.0005, slider: true }, { path: 'strategy_params.07.trailing_stop_pct', label: '追踪止损', type: 'number', min: 0.001, max: 0.1, step: 0.001, slider: true, scale: 100 }, { path: 'strategy_params.07.stop_loss_pct', label: '初始止损', type: 'number', min: 0.001, max: 0.1, step: 0.001, slider: true, scale: 100 }] },
            { id: '08', name: '08 神奇九转', fields: [{ path: 'strategy_params.08.min_history_bars', label: '最小历史K线', type: 'number', min: 10, max: 1000, step: 1, slider: true }, { path: 'strategy_params.08.trailing_stop_pct', label: '追踪止损', type: 'number', min: 0.001, max: 0.1, step: 0.001, slider: true, scale: 100 }, { path: 'strategy_params.08.stop_loss_pct', label: '初始止损', type: 'number', min: 0.001, max: 0.1, step: 0.001, slider: true, scale: 100 }] },
            { id: '09', name: '09 箱体降本策略', fields: [{ path: 'strategy_params.09.box_period', label: '箱体周期', type: 'number', min: 30, max: 1000, step: 1, slider: true }, { path: 'strategy_params.09.break_pct', label: '突破阈值', type: 'number', min: 0.001, max: 0.2, step: 0.001, slider: true, scale: 100 }, { path: 'strategy_params.09.rsi_period', label: 'RSI周期', type: 'number', min: 5, max: 60, step: 1, slider: true }, { path: 'strategy_params.09.rsi_oversold', label: 'RSI超卖阈值', type: 'number', min: 5, max: 45, step: 1, slider: true }, { path: 'strategy_params.09.rsi_overbought', label: 'RSI超买阈值', type: 'number', min: 55, max: 95, step: 1, slider: true }, { path: 'strategy_params.09.base_build_rsi', label: '底仓建仓RSI阈值', type: 'number', min: 5, max: 60, step: 1, slider: true }, { path: 'strategy_params.09.buy_zone_ratio', label: '低吸区比例', type: 'number', min: 0.01, max: 0.5, step: 0.01, slider: true, scale: 100 }, { path: 'strategy_params.09.sell_zone_ratio', label: '高抛区比例', type: 'number', min: 0.01, max: 0.5, step: 0.01, slider: true, scale: 100 }, { path: 'strategy_params.09.base_order_qty', label: '底仓手数', type: 'number', min: 100, max: 200000, step: 100, slider: true }, { path: 'strategy_params.09.dynamic_order_qty', label: '机动仓单次手数', type: 'number', min: 100, max: 100000, step: 100, slider: true }, { path: 'strategy_params.09.max_dynamic_qty', label: '机动仓总上限', type: 'number', min: 100, max: 500000, step: 100, slider: true }, { path: 'strategy_params.09.stop_loss_pct', label: '止损比例', type: 'number', min: 0.001, max: 0.3, step: 0.001, slider: true, scale: 100 }] }
        ];

        function getByPath(obj, path, fallback = undefined) {
            const parts = path.split('.');
            let cur = obj;
            for (const p of parts) {
                if (cur === null || cur === undefined || !(p in cur)) return fallback;
                cur = cur[p];
            }
            return cur;
        }

        function setText(id, text) {
            const el = document.getElementById(id);
            if (el) el.innerText = text;
        }

        function parseMetricNumber(v) {
            if (typeof v === 'number') return Number.isFinite(v) ? v : null;
            const s = String(v ?? '').replace(/[^0-9+-.]/g, '');
            const n = Number(s);
            return Number.isFinite(n) ? n : null;
        }

        function animateMetric(el, nextRaw) {
            if (!el) return;
            const prevRaw = parseMetricNumber(el.dataset.metricRaw);
            if (nextRaw === null || nextRaw === undefined) return;
            if (prevRaw === null) {
                el.dataset.metricRaw = String(nextRaw);
                return;
            }
            const diff = Number(nextRaw) - Number(prevRaw);
            if (Math.abs(diff) < 1e-12) return;
            el.classList.remove('metric-pop-up', 'metric-pop-down');
            void el.offsetWidth;
            el.classList.add(diff >= 0 ? 'metric-pop-up' : 'metric-pop-down');
            el.dataset.metricRaw = String(nextRaw);
        }

        function setMetricText(id, text, rawValue = null) {
            const el = document.getElementById(id);
            if (!el) return;
            const raw = rawValue === null ? parseMetricNumber(text) : rawValue;
            animateMetric(el, raw);
            el.innerText = text;
        }

        function setDailyPnlStyle(rawPnl) {
            const el = document.getElementById('daily-pnl');
            if (!el) return;
            el.className = `font-mono font-bold text-lg ${rawPnl >= 0 ? 'text-trading-red' : 'text-trading-green'}`;
        }

        function updateRevenueCashRatioBar(cashVal = null, assetVal = null) {
            const bar = document.getElementById('revenue-cash-bar');
            const label = document.getElementById('revenue-cash-ratio');
            if (!bar && !label) return;
            const cash = cashVal !== null && cashVal !== undefined
                ? Number(cashVal)
                : parseMetricNumber(document.getElementById('revenue-cash')?.dataset?.metricRaw ?? document.getElementById('revenue-cash')?.innerText);
            const assets = assetVal !== null && assetVal !== undefined
                ? Number(assetVal)
                : parseMetricNumber(document.getElementById('total-assets')?.dataset?.metricRaw ?? document.getElementById('total-assets')?.innerText);
            if (!Number.isFinite(cash) || !Number.isFinite(assets) || assets <= 0) {
                if (bar) bar.style.width = '0%';
                if (label) label.innerText = '--';
                return;
            }
            const ratio = Math.max(0, Math.min(100, (cash / assets) * 100));
            if (bar) bar.style.width = `${ratio.toFixed(1)}%`;
            if (label) label.innerText = `${ratio.toFixed(1)}%`;
        }

        function fmtPct(v, digits = 2) {
            const n = Number(v);
            if (!Number.isFinite(n)) return '--';
            return `${(n * 100).toFixed(digits)}%`;
        }

        function clamp01(v) {
            const n = Number(v);
            if (!Number.isFinite(n)) return 0;
            return Math.max(0, Math.min(1, n));
        }

        function normalizeByRange(v, min, max) {
            const n = Number(v);
            if (!Number.isFinite(n)) return 0;
            const span = Number(max) - Number(min);
            if (!Number.isFinite(span) || span <= 0) return 0;
            return clamp01((n - Number(min)) / span);
        }

        function resolveRiskLevel(cfg) {
            const stopPct = Number(getByPath(cfg, 'risk_control.max_stop_loss_pct', 0.05));
            const perStockPct = Number(getByPath(cfg, 'risk_control.max_pos_per_stock', 0.1));
            const totalPosPct = Number(getByPath(cfg, 'risk_control.max_total_pos', 0.5));
            const dayLossPct = Number(getByPath(cfg, 'risk_control.max_daily_loss_pct', 0.02));
            const drawdownPct = Number(getByPath(cfg, 'risk_control.max_drawdown_pct', dayLossPct));
            const toleranceScore = (
                normalizeByRange(stopPct, 0.001, 0.3) * 0.25 +
                normalizeByRange(perStockPct, 0.01, 1) * 0.2 +
                normalizeByRange(totalPosPct, 0.01, 1) * 0.2 +
                normalizeByRange(dayLossPct, 0.001, 0.2) * 0.2 +
                normalizeByRange(drawdownPct, 0.001, 0.5) * 0.15
            );
            if (toleranceScore < 0.34) return { text: '保守', className: 'text-cyan-300' };
            if (toleranceScore < 0.67) return { text: '稳健', className: 'text-trading-green' };
            return { text: '激进', className: 'text-rose-300' };
        }

        function renderRiskLevelByConfig(cfg) {
            const el = document.getElementById('risk-level');
            if (!el) return;
            const risk = resolveRiskLevel(cfg || {});
            el.innerText = risk.text;
            el.className = `font-mono font-bold text-lg ${risk.className}`;
        }

        function applyConfigToBoards(cfg) {
            if (!cfg || typeof cfg !== 'object') return;
            const active = getByPath(cfg, 'strategies.active_ids', []);
            const activeText = Array.isArray(active) ? `${active.length}个 (${active.join(',')})` : '--';
            setText('cfg-zhongshu-active', activeText);
            const boxPeriod = Number(getByPath(cfg, 'strategy_params.09.box_period', 0));
            const stopPct = Number(getByPath(cfg, 'risk_control.max_stop_loss_pct', 0));
            const dayLossPct = Number(getByPath(cfg, 'risk_control.max_daily_loss_pct', 0));
            const drawdownPct = Number(getByPath(cfg, 'risk_control.max_drawdown_pct', dayLossPct));
            const slippage = Number(getByPath(cfg, 'execution.slippage', 0));
            const capital = Number(getByPath(cfg, 'system.initial_capital', 0));
            const commissionRate = Number(getByPath(cfg, 'trading_cost.commission_rate', 0));
            const minCommission = Number(getByPath(cfg, 'trading_cost.min_commission', 0));
            const totalPos = Number(getByPath(cfg, 'risk_control.max_total_pos', 0));
            setMetricText('cfg-zhongshu-box', `${boxPeriod}`, boxPeriod);
            setMetricText('cfg-menxia-stop', fmtPct(stopPct), stopPct * 100);
            setMetricText('cfg-menxia-dayloss', fmtPct(dayLossPct), dayLossPct * 100);
            setMetricText('cfg-shangshu-slippage', fmtPct(slippage, 3), slippage * 100);
            setText('cfg-shangshu-mode', `${getByPath(cfg, 'system.mode', '--')}`);
            setMetricText('cfg-li-capital', `¥ ${capital.toLocaleString()}`, capital);
            setMetricText('cfg-hu-commission', `${commissionRate.toFixed(6)}`, commissionRate);
            setMetricText('cfg-hu-minc', `¥ ${minCommission.toFixed(2)}`, minCommission);
            setText('cfg-li-rites-live', getByPath(cfg, 'system.enable_live', false) ? '开启' : '关闭');
            setMetricText('cfg-bing-slippage', fmtPct(slippage, 3), slippage * 100);
            setMetricText('cfg-xing-totalpos', fmtPct(totalPos), totalPos * 100);
            setText('cfg-gong-source', `${getByPath(cfg, 'data_provider.source', '--')}`);
            setText('cfg-gong-fallback', getByPath(cfg, 'data_provider.enable_fallback', false) ? 'ON' : 'OFF');
            setMetricText('justice-dd-limit', fmtPct(drawdownPct), drawdownPct * 100);
            renderRiskLevelByConfig(cfg);
        }

        async function syncBoardConfig() {
            try {
                const res = await fetch('/api/config');
                const data = await res.json();
                if (data.status === 'success') {
                    configDraft = data.config || configDraft;
                    applyConfigToBoards(configDraft);
                }
            } catch (_) {}
        }

        function setByPath(obj, path, value) {
            const parts = path.split('.');
            let cur = obj;
            for (let i = 0; i < parts.length - 1; i++) {
                const p = parts[i];
                if (!(p in cur) || cur[p] === null || typeof cur[p] !== 'object') cur[p] = {};
                cur = cur[p];
            }
            cur[parts[parts.length - 1]] = value;
        }

        function createFieldRow(labelText) {
            const row = document.createElement('div');
            row.className = 'grid grid-cols-[220px_1fr] gap-3 items-center bg-slate-950/60 border border-slate-700 rounded p-2';
            const label = document.createElement('div');
            label.className = 'text-[12px] text-slate-200';
            label.innerText = labelText;
            row.appendChild(label);
            const holder = document.createElement('div');
            row.appendChild(holder);
            return { row, holder };
        }

        function createBusinessField(field, cfg) {
            const { row, holder } = createFieldRow(field.label);
            const value = getByPath(cfg, field.path, field.default);
            if (field.type === 'boolean') {
                const box = document.createElement('div');
                box.className = 'space-y-1';
                const wrap = document.createElement('label');
                wrap.className = 'inline-flex items-center gap-2 text-xs text-slate-200';
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.className = 'accent-purple-500';
                input.checked = !!value;
                input.dataset.path = field.path;
                input.dataset.kind = 'value';
                input.dataset.valueType = 'boolean';
                const txt = document.createElement('span');
                txt.innerText = input.checked ? '开启' : '关闭';
                input.addEventListener('change', () => txt.innerText = input.checked ? '开启' : '关闭');
                wrap.appendChild(input);
                wrap.appendChild(txt);
                box.appendChild(wrap);
                if (field.desc) {
                    const desc = document.createElement('div');
                    desc.className = 'text-[10px] text-slate-500';
                    desc.innerText = field.desc;
                    box.appendChild(desc);
                }
                holder.appendChild(box);
            } else if (field.type === 'select') {
                const sel = document.createElement('select');
                sel.className = 'w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-purple-500';
                sel.dataset.path = field.path;
                sel.dataset.kind = 'value';
                sel.dataset.valueType = 'string';
                (field.options || []).forEach(opt => {
                    const o = document.createElement('option');
                    o.value = opt.value;
                    o.innerText = opt.label;
                    sel.appendChild(o);
                });
                sel.value = value ?? '';
                holder.appendChild(sel);
            } else if (field.type === 'lines') {
                const area = document.createElement('textarea');
                area.className = 'w-full min-h-[72px] bg-slate-900 border border-slate-700 rounded p-2 text-xs font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-purple-500';
                area.dataset.path = field.path;
                area.dataset.kind = 'lines';
                area.dataset.itemType = field.itemType || 'string';
                area.value = Array.isArray(value) ? value.map(v => String(v)).join('\n') : '';
                holder.appendChild(area);
                if (field.hint) {
                    const hint = document.createElement('div');
                    hint.className = 'text-[10px] text-slate-500 mt-1';
                    hint.innerText = field.hint;
                    holder.appendChild(hint);
                }
            } else if (field.type === 'checkbox_group') {
                const box = document.createElement('div');
                box.className = 'space-y-2';
                const selected = new Set(Array.isArray(value) ? value.map(x => String(x).trim().toUpperCase()) : []);
                const opts = field.path === 'webhook_notification.category_codes'
                    ? (Array.isArray(webhookCategoryOptions) && webhookCategoryOptions.length ? webhookCategoryOptions : (field.options || []))
                    : (field.options || []);
                const grid = document.createElement('div');
                grid.className = 'grid grid-cols-2 gap-1';
                opts.forEach(opt => {
                    const v = String(opt?.value || '').trim().toUpperCase();
                    if (!v) return;
                    const item = document.createElement('label');
                    item.className = 'flex items-start gap-2 text-xs text-slate-200 bg-slate-900 border border-slate-700 rounded px-2 py-1';
                    const input = document.createElement('input');
                    input.type = 'checkbox';
                    input.className = 'accent-purple-500 mt-0.5';
                    input.checked = selected.has(v);
                    input.dataset.path = field.path;
                    input.dataset.kind = 'checkitem';
                    input.dataset.value = v;
                    const txtWrap = document.createElement('span');
                    txtWrap.className = 'leading-tight';
                    const ttl = document.createElement('div');
                    ttl.className = 'text-slate-100';
                    ttl.innerText = String(opt?.label || v);
                    txtWrap.appendChild(ttl);
                    const dsc = String(opt?.desc || '').trim();
                    if (dsc) {
                        const sub = document.createElement('div');
                        sub.className = 'text-[10px] text-slate-500';
                        sub.innerText = dsc;
                        txtWrap.appendChild(sub);
                    }
                    item.appendChild(input);
                    item.appendChild(txtWrap);
                    grid.appendChild(item);
                });
                box.appendChild(grid);
                if (field.desc) {
                    const desc = document.createElement('div');
                    desc.className = 'text-[10px] text-slate-500';
                    desc.innerText = field.desc;
                    box.appendChild(desc);
                }
                holder.appendChild(box);
            } else if (field.type === 'toggle_map') {
                const box = document.createElement('div');
                box.className = 'space-y-2';
                const valMap = (value && typeof value === 'object') ? value : {};
                const opts = field.path === 'fundamental_adapter.tushare_interfaces'
                    ? (Array.isArray(fundamentalInterfaceOptions) ? fundamentalInterfaceOptions : [])
                    : (field.options || []);
                if (!opts.length) {
                    const empty = document.createElement('div');
                    empty.className = 'text-[10px] text-slate-500';
                    empty.innerText = '暂无可选接口，请稍后重试。';
                    box.appendChild(empty);
                } else {
                    const grid = document.createElement('div');
                    grid.className = 'grid grid-cols-1 gap-1';
                    opts.forEach(opt => {
                        const key = String(opt?.value || '').trim();
                        if (!key) return;
                        const item = document.createElement('label');
                        item.className = 'flex items-start gap-2 text-xs text-slate-200 bg-slate-900 border border-slate-700 rounded px-2 py-1';
                        const input = document.createElement('input');
                        input.type = 'checkbox';
                        input.className = 'accent-purple-500 mt-0.5';
                        input.checked = !!valMap[key];
                        input.dataset.path = field.path;
                        input.dataset.kind = 'mapitem';
                        input.dataset.value = key;
                        const txtWrap = document.createElement('span');
                        txtWrap.className = 'leading-tight';
                        const ttl = document.createElement('div');
                        ttl.className = 'text-slate-100';
                        ttl.innerText = String(opt?.label || key);
                        txtWrap.appendChild(ttl);
                        const dsc = String(opt?.desc || '').trim();
                        if (dsc) {
                            const sub = document.createElement('div');
                            sub.className = 'text-[10px] text-slate-500';
                            sub.innerText = dsc;
                            txtWrap.appendChild(sub);
                        }
                        item.appendChild(input);
                        item.appendChild(txtWrap);
                        grid.appendChild(item);
                    });
                    box.appendChild(grid);
                }
                if (field.desc) {
                    const desc = document.createElement('div');
                    desc.className = 'text-[10px] text-slate-500';
                    desc.innerText = field.desc;
                    box.appendChild(desc);
                }
                holder.appendChild(box);
            } else {
                const wrap = document.createElement('div');
                wrap.className = 'space-y-1';
                const line = document.createElement('div');
                line.className = 'flex items-center gap-2';
                if (field.slider) {
                    const range = document.createElement('input');
                    range.type = 'range';
                    range.min = String(field.min ?? 0);
                    range.max = String(field.max ?? 1);
                    range.step = String(field.step ?? 0.001);
                    range.value = String(typeof value === 'number' ? value : Number(value || 0));
                    range.className = 'w-full accent-purple-500';
                    line.appendChild(range);
                    const num = document.createElement('input');
                    num.type = 'number';
                    num.min = field.min !== undefined ? String(field.min) : undefined;
                    num.max = field.max !== undefined ? String(field.max) : undefined;
                    num.step = String(field.step ?? 'any');
                    num.value = String(value ?? field.default ?? 0);
                    num.dataset.path = field.path;
                    num.dataset.kind = 'value';
                    num.dataset.valueType = field.type === 'number' ? 'number' : 'string';
                    num.className = 'w-36 bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-purple-500';
                    range.addEventListener('input', () => num.value = range.value);
                    num.addEventListener('input', () => {
                        const v = Number(num.value);
                        if (Number.isFinite(v)) range.value = String(v);
                    });
                    line.appendChild(num);
                    if (field.unit) {
                        const unit = document.createElement('span');
                        unit.className = 'text-[11px] text-slate-400';
                        unit.innerText = field.unit;
                        line.appendChild(unit);
                    }
                } else {
                    const input = document.createElement('input');
                    input.type = field.type === 'number' ? 'number' : (field.type === 'password' ? 'password' : 'text');
                    input.min = field.min !== undefined ? String(field.min) : undefined;
                    input.max = field.max !== undefined ? String(field.max) : undefined;
                    input.step = field.type === 'number' ? String(field.step ?? 'any') : undefined;
                    input.value = String(value ?? field.default ?? '');
                    if (field.placeholder) input.placeholder = String(field.placeholder);
                    input.dataset.path = field.path;
                    input.dataset.kind = 'value';
                    input.dataset.valueType = field.type === 'number' ? 'number' : 'string';
                    if (field.type === 'password' || field.secret) {
                        input.dataset.secret = '1';
                        input.dataset.secretMask = '********';
                        input.autocomplete = 'new-password';
                    }
                    input.className = 'w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-purple-500';
                    line.appendChild(input);
                    if (field.unit) {
                        const unit = document.createElement('span');
                        unit.className = 'text-[11px] text-slate-400';
                        unit.innerText = field.unit;
                        line.appendChild(unit);
                    }
                }
                wrap.appendChild(line);
                if (field.desc) {
                    const desc = document.createElement('div');
                    desc.className = 'text-[10px] text-slate-500';
                    desc.innerText = field.desc;
                    wrap.appendChild(desc);
                }
                holder.appendChild(wrap);
            }
            return row;
        }

        function toggleConfigGroupBody(bodyId) {
            const body = document.getElementById(bodyId);
            if (!body) return;
            body.classList.toggle('hidden');
        }

        function toggleConfigSectionBody(bodyId) {
            const body = document.getElementById(bodyId);
            if (!body) return;
            body.classList.toggle('hidden');
        }

        function setAllConfigSections(expanded) {
            const open = !!expanded;
            document.querySelectorAll('#config-form-container .config-section-body').forEach(el => {
                if (open) el.classList.remove('hidden');
                else el.classList.add('hidden');
            });
        }

        function renderConfigFieldGroups(host, sectionMeta, fields, cfg) {
            const groups = Array.isArray(sectionMeta?.field_groups) ? sectionMeta.field_groups : [];
            if (!groups.length) {
                fields.forEach(f => host.appendChild(createBusinessField(f, cfg)));
                return;
            }
            const map = {};
            fields.forEach(f => { map[String(f.path || '')] = f; });
            groups.forEach((g, idx) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'border border-slate-700 rounded p-2 space-y-2 bg-slate-950/40';
                const bodyId = `cfg-group-${String(sectionMeta.title || 'section').replace(/[^\w\u4e00-\u9fa5]+/g, '-')}-${String(g.key || idx)}`;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'w-full text-left text-[11px] text-cyan-300 font-bold flex items-center justify-between';
                btn.setAttribute('onclick', `toggleConfigGroupBody('${bodyId}')`);
                btn.innerHTML = `<span>${String(g.name || g.key || `分组${idx + 1}`)}</span><span class="text-slate-400">折叠/展开</span>`;
                wrapper.appendChild(btn);
                const inner = document.createElement('div');
                inner.id = bodyId;
                inner.className = `space-y-2 ${g.defaultOpen === false ? 'hidden' : ''}`;
                const groupPaths = Array.isArray(g.paths) ? g.paths.map(x => String(x || '')) : [];
                groupPaths.forEach(p => {
                    if (map[p]) inner.appendChild(createBusinessField(map[p], cfg));
                });
                wrapper.appendChild(inner);
                host.appendChild(wrapper);
            });
            const allGrouped = new Set();
            groups.forEach(g => (Array.isArray(g.paths) ? g.paths : []).forEach(p => allGrouped.add(String(p || ''))));
            fields.forEach(f => {
                if (!allGrouped.has(String(f.path || ''))) host.appendChild(createBusinessField(f, cfg));
            });
        }

        function renderSectionBlock(title, subtitle, fields, cfg, sectionMeta = null) {
            const block = document.createElement('div');
            block.className = 'border border-slate-700 rounded-lg overflow-hidden';
            const sectionBodyId = `cfg-section-body-${String(title || 'section').replace(/[^\w\u4e00-\u9fa5]+/g, '-')}`;
            const head = document.createElement('div');
            head.className = 'px-3 py-2 bg-slate-800 flex items-center justify-between gap-2';
            head.innerHTML = `<div><div class="text-xs font-bold text-purple-300 uppercase tracking-widest">${title}</div><div class="text-[10px] text-slate-400 mt-0.5">${subtitle || ''}</div></div><button type="button" onclick="toggleConfigSectionBody('${sectionBodyId}')" class="text-[11px] text-slate-300 hover:text-white border border-slate-600 rounded px-2 py-1">折叠/展开</button>`;
            block.appendChild(head);
            const body = document.createElement('div');
            body.id = sectionBodyId;
            body.className = 'p-3 space-y-2 config-section-body';
            renderConfigFieldGroups(body, sectionMeta, fields, cfg);
            if (String(title || '') === '工部数据源') {
                const ops = document.createElement('div');
                ops.className = 'mt-2 border border-cyan-800/60 rounded p-3 bg-slate-950/50 space-y-2';
                ops.innerHTML = `
                    <div class="text-[11px] text-cyan-300 font-bold">数据同步操作</div>
                    <div class="flex flex-wrap items-center gap-2">
                        <button id="config-tushare-test-btn" onclick="testTushareConnectivity()" class="bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 rounded text-xs border border-indigo-500">
                            <i id="config-tushare-test-icon" class="fa-solid fa-plug-circle-check"></i>
                            <span id="config-tushare-test-label">测试Tushare连通性</span>
                        </button>
                        <span id="config-tushare-test-status" class="text-[10px] text-slate-400">填写 Tushare 接口地址和令牌后可测试</span>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <button id="config-tdx-test-btn" onclick="testTdxConnectivity()" class="bg-cyan-700 hover:bg-cyan-600 text-white px-3 py-1.5 rounded text-xs border border-cyan-500">
                            <i id="config-tdx-test-icon" class="fa-solid fa-magnifying-glass"></i>
                            <span id="config-tdx-test-label">自动探测TDX并测试</span>
                        </button>
                        <span id="config-tdx-test-status" class="text-[10px] text-slate-400">无需手填路径，自动探测 tdxdir 并校验</span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button id="history-sync-run-btn" onclick="runHistorySync()" class="bg-teal-700 hover:bg-teal-600 text-white px-3 py-1.5 rounded text-xs border border-teal-500">
                            <i id="history-sync-run-icon" class="fa-solid fa-database"></i>
                            <span id="history-sync-run-label">增量同步</span>
                        </button>
                        <button id="history-sync-stop-btn" onclick="stopHistorySync()" class="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-xs border border-slate-500">
                            <i id="history-sync-stop-icon" class="fa-solid fa-stop"></i>
                            <span id="history-sync-stop-label">停止同步</span>
                        </button>
                        <button id="history-sync-scheduler-btn" onclick="toggleHistorySyncScheduler()" class="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-xs border border-slate-500">
                            <i id="history-sync-scheduler-icon" class="fa-solid fa-clock"></i>
                            <span id="history-sync-scheduler-label">定时同步关</span>
                        </button>
                        <button onclick="refreshHistorySyncStatus()" class="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded text-xs border border-slate-600">
                            <i class="fa-solid fa-rotate"></i>
                            <span>刷新状态</span>
                        </button>
                    </div>
                    <div class="text-[10px] text-slate-400">同步范围由 history_sync 配置项控制，可先 dry_run 预览。</div>
                `;
                body.appendChild(ops);
            } else if (String(title || '') === '基本面适配器') {
                const ops = document.createElement('div');
                ops.className = 'mt-2 border border-cyan-800/60 rounded p-3 bg-slate-950/50 space-y-2';
                ops.innerHTML = `
                    <div class="text-[11px] text-cyan-300 font-bold">落盘缓存查询台（人工核对）</div>
                    <div class="flex flex-wrap items-center gap-2">
                        <input id="fund-cache-stock" class="bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-100 w-36" placeholder="股票代码 600000 或 600000.SH" />
                        <select id="fund-cache-context" class="bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-100">
                            <option value="">全部场景</option>
                            <option value="backtest">backtest</option>
                            <option value="live">live</option>
                        </select>
                        <button id="fund-cache-refresh-btn" onclick="loadFundamentalCacheList()" class="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-xs border border-slate-500">
                            <i class="fa-solid fa-rotate"></i> 刷新缓存列表
                        </button>
                        <button id="fund-cache-fetch-btn" onclick="fetchAndRefreshFundamentalCache()" class="bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 rounded text-xs border border-indigo-500">
                            <i class="fa-solid fa-cloud-arrow-down"></i> 拉取并落盘
                        </button>
                        <button id="fund-detail-open-btn" onclick="openFundamentalDetailModal()" class="bg-cyan-700 hover:bg-cyan-600 text-white px-3 py-1.5 rounded text-xs border border-cyan-500">
                            <i class="fa-solid fa-circle-info"></i> 查看详情
                        </button>
                        <span id="fund-cache-status" class="text-[10px] text-slate-400">可按股票和场景查询落盘缓存，点击文件查看结构化详情。</span>
                    </div>
                    <div class="max-h-44 overflow-auto border border-slate-700 rounded">
                        <table class="w-full text-[11px] font-mono">
                            <thead class="bg-slate-800 text-slate-300">
                                <tr>
                                    <th class="px-2 py-1 text-left">文件</th>
                                    <th class="px-2 py-1 text-left">股票</th>
                                    <th class="px-2 py-1 text-left">场景</th>
                                    <th class="px-2 py-1 text-left">抓取时间</th>
                                </tr>
                            </thead>
                            <tbody id="fund-cache-table-body" class="divide-y divide-slate-700 text-slate-200">
                                <tr><td colspan="4" class="px-2 py-2 text-slate-500">暂无数据</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="text-[10px] text-slate-500">详情视图已迁移到独立弹窗，点击“查看详情”或直接点击文件行打开。</div>
                `;
                body.appendChild(ops);
            }
            block.appendChild(body);
            return block;
        }

        function renderStrategyParamsSection(cfg) {
            const block = document.createElement('div');
            block.className = 'border border-slate-700 rounded-lg overflow-hidden';
            const sectionBodyId = 'cfg-section-body-strategy-params';
            const head = document.createElement('div');
            head.className = 'px-3 py-2 bg-slate-800 flex items-center justify-between gap-2';
            head.innerHTML = `<div><div class="text-xs font-bold text-purple-300 uppercase tracking-widest">中书省策略研究中心</div><div class="text-[10px] text-slate-400 mt-0.5">分策略参数面板</div></div><button type="button" onclick="toggleConfigSectionBody('${sectionBodyId}')" class="text-[11px] text-slate-300 hover:text-white border border-slate-600 rounded px-2 py-1">折叠/展开</button>`;
            block.appendChild(head);
            const body = document.createElement('div');
            body.id = sectionBodyId;
            body.className = 'p-3 space-y-3 config-section-body';
            STRATEGY_FORM_GROUPS.forEach(group => {
                const g = document.createElement('div');
                g.className = 'border border-slate-700 rounded p-2 space-y-2';
                const title = document.createElement('div');
                title.className = 'text-[11px] text-cyan-300 font-bold';
                title.innerText = group.name;
                g.appendChild(title);
                group.fields.forEach(f => g.appendChild(createBusinessField(f, cfg)));
                body.appendChild(g);
            });
            block.appendChild(body);
            return block;
        }

        function renderConfigForm(cfg) {
            const container = document.getElementById('config-form-container');
            if (!container) return;
            container.innerHTML = '';
            BIZ_SECTIONS.forEach(section => {
                container.appendChild(renderSectionBlock(section.title, section.subtitle, section.fields, cfg, section));
            });
            container.appendChild(renderStrategyParamsSection(cfg));
        }

        function bindConfigRealtimePreview() {
            const container = document.getElementById('config-form-container');
            if (!container || container.dataset.previewBound === '1') return;
            const refresh = () => applyConfigToBoards(collectConfigFromForm());
            container.addEventListener('input', refresh);
            container.addEventListener('change', refresh);
            container.dataset.previewBound = '1';
        }

        function collectConfigFromForm() {
            const out = JSON.parse(JSON.stringify(configDraft || {}));
            const checklistMap = {};
            const mapValueMap = {};
            document.querySelectorAll('#config-form-container [data-path]').forEach(el => {
                const path = el.dataset.path;
                const kind = el.dataset.kind;
                if (!path || !kind) return;
                if (kind === 'value') {
                    const t = el.dataset.valueType;
                    if (t === 'boolean') {
                        setByPath(out, path, !!el.checked);
                    } else if (t === 'number') {
                        const num = Number(el.value);
                        setByPath(out, path, Number.isFinite(num) ? num : 0);
                    } else {
                        if (el.dataset.secret === '1') {
                            const text = String(el.value || '');
                            const mask = String(el.dataset.secretMask || '********');
                            if (text === mask) return;
                            setByPath(out, path, text);
                            return;
                        }
                        setByPath(out, path, String(el.value || ''));
                    }
                } else if (kind === 'lines') {
                    const itemType = el.dataset.itemType || 'string';
                    const lines = String(el.value || '').split('\n').map(v => v.trim()).filter(v => v.length > 0);
                    const arr = lines.map(v => itemType === 'number' ? (Number.isFinite(Number(v)) ? Number(v) : 0) : v);
                    setByPath(out, path, arr);
                } else if (kind === 'checkitem') {
                    const v = String(el.dataset.value || '').trim().toUpperCase();
                    if (!checklistMap[path]) checklistMap[path] = [];
                    if (!v) return;
                    if (el.checked) checklistMap[path].push(v);
                } else if (kind === 'mapitem') {
                    const key = String(el.dataset.value || '').trim();
                    if (!key) return;
                    if (!mapValueMap[path]) mapValueMap[path] = {};
                    mapValueMap[path][key] = !!el.checked;
                }
            });
            Object.keys(checklistMap).forEach(path => {
                const arr = Array.from(new Set((checklistMap[path] || []).map(x => String(x).trim().toUpperCase()).filter(Boolean)));
                setByPath(out, path, arr);
            });
            Object.keys(mapValueMap).forEach(path => {
                setByPath(out, path, mapValueMap[path]);
            });
            return out;
        }

        function openConfigCenter() {
            const modal = document.getElementById('config-modal');
            if (modal) modal.classList.remove('hidden');
            loadConfigCenter();
        }

        function closeConfigCenter() {
            const modal = document.getElementById('config-modal');
            if (modal) modal.classList.add('hidden');
        }

        const FUNDAMENTAL_DETAIL_SCROLL_KEY = 'jince-fund-detail-scroll-v1';

        function saveFundamentalDetailScroll() {
            try {
                const box = document.getElementById('fundamental-detail-scroll');
                if (!box) return;
                localStorage.setItem(FUNDAMENTAL_DETAIL_SCROLL_KEY, String(Math.max(0, Number(box.scrollTop || 0))));
            } catch (_) {}
        }

        function restoreFundamentalDetailScroll() {
            try {
                const box = document.getElementById('fundamental-detail-scroll');
                if (!box) return;
                const val = Number(localStorage.getItem(FUNDAMENTAL_DETAIL_SCROLL_KEY) || '0');
                box.scrollTop = Number.isFinite(val) ? Math.max(0, val) : 0;
            } catch (_) {}
        }

        function openFundamentalDetailModal() {
            const modal = document.getElementById('fundamental-detail-modal');
            if (modal) modal.classList.remove('hidden');
            requestAnimationFrame(() => restoreFundamentalDetailScroll());
        }

        function closeFundamentalDetailModal() {
            saveFundamentalDetailScroll();
            const modal = document.getElementById('fundamental-detail-modal');
            if (modal) modal.classList.add('hidden');
        }

        function openFundamentalModuleDetailModal() {
            const modal = document.getElementById('fundamental-module-detail-modal');
            if (modal) modal.classList.remove('hidden');
        }

        function closeFundamentalModuleDetailModal() {
            const modal = document.getElementById('fundamental-module-detail-modal');
            if (modal) modal.classList.add('hidden');
        }

        const OPS_HUB_PIN_KEY = 'jince-ops-hub-pin-v1';
        let opsHubPinned = false;

        function openOpsHubModal() {
            const drawer = document.getElementById('ops-hub-drawer');
            if (drawer) {
                drawer.classList.remove('translate-x-full', 'opacity-0', 'pointer-events-none');
                drawer.classList.add('translate-x-0', 'opacity-100');
            }
            syncOpsHubBackdrop();
        }

        function closeOpsHubModal() {
            if (opsHubPinned) setOpsHubPinned(false);
            const drawer = document.getElementById('ops-hub-drawer');
            if (drawer) {
                drawer.classList.remove('translate-x-0', 'opacity-100');
                drawer.classList.add('translate-x-full', 'opacity-0', 'pointer-events-none');
            }
            syncOpsHubBackdrop();
        }

        function openEvolutionBoardModal() {
            closeAllMajorFunctionModals('evolution-board-modal');
            closeOpsHubModal();
            evolutionSeedAllowTopFallback = true;
            const modal = document.getElementById('evolution-board-modal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
            switchEvolutionPlatformTab(evolutionPlatformTab || 'runtime');
            renderEvolutionSeedSourceUi();
            refreshEvolutionDashboard({ withHistory: true, withTop: true, withRuns: true, withFamilyStats: true, withProfileUpdates: true, withConcurrency: true });
            refreshEvolutionPlatformDashboard();
            setEvolutionStatusText('已打开策略进化看板', 'success');
            const startBtn = document.getElementById('evolution-start-btn');
            if (startBtn && typeof startBtn.focus === 'function') startBtn.focus();

            // 启动并发状态定时更新
            if (evolutionConcurrencyTimer) clearInterval(evolutionConcurrencyTimer);
            evolutionConcurrencyTimer = setInterval(() => {
                if (isEvolutionBoardModalOpen()) {
                    refreshEvolutionDashboard({ withConcurrency: true, withTimingLog: false });
                    refreshEvolutionPlatformDashboard();
                }
            }, 5000); // 每5秒更新一次并发状态
        }

        function closeEvolutionBoardModal() {
            const modal = document.getElementById('evolution-board-modal');
            if (!modal) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            
            // 清理并发状态定时器
            if (evolutionConcurrencyTimer) {
                clearInterval(evolutionConcurrencyTimer);
                evolutionConcurrencyTimer = null;
            }
        }

        function isEvolutionBoardModalOpen() {
            // Utility helper to avoid unnecessary dashboard API polling when modal is closed.
            const modal = document.getElementById('evolution-board-modal');
            return !!(modal && !modal.classList.contains('hidden'));
        }

        function toggleOpsHubSection(bodyId) {
            const el = document.getElementById(bodyId);
            if (!el) return;
            el.classList.toggle('hidden');
        }

        function toggleOpsHubPinned() {
            setOpsHubPinned(!opsHubPinned);
        }

        function setOpsHubPinned(pinned) {
            opsHubPinned = !!pinned;
            applyOpsHubPinState();
            try { localStorage.setItem(OPS_HUB_PIN_KEY, opsHubPinned ? '1' : '0'); } catch (_) {}
        }

        function loadOpsHubPinState() {
            try {
                opsHubPinned = String(localStorage.getItem(OPS_HUB_PIN_KEY) || '') === '1';
            } catch (_) {
                opsHubPinned = false;
            }
            applyOpsHubPinState();
        }

        function applyOpsHubPinState() {
            const drawer = document.getElementById('ops-hub-drawer');
            const backdrop = document.getElementById('ops-hub-backdrop');
            const pinBtn = document.getElementById('ops-hub-pin-btn');
            const entryBtn = document.getElementById('ops-hub-btn');
            if (pinBtn) {
                pinBtn.className = opsHubPinned ? 'text-fuchsia-300 hover:text-fuchsia-200' : 'text-slate-400 hover:text-white';
                pinBtn.title = opsHubPinned ? '取消固定右侧工具栏' : '固定右侧工具栏';
            }
            if (entryBtn) {
                entryBtn.classList.toggle('ring-2', opsHubPinned);
                entryBtn.classList.toggle('ring-fuchsia-300', opsHubPinned);
            }
            if (!drawer) return;
            drawer.style.width = opsHubPinned ? '320px' : '380px';
            if (opsHubPinned) {
                drawer.classList.remove('translate-x-full', 'opacity-0', 'pointer-events-none');
                drawer.classList.add('translate-x-0', 'opacity-100');
            }
            if (backdrop && opsHubPinned) {
                backdrop.classList.add('hidden');
            }
            syncOpsHubBackdrop();
        }

        function syncOpsHubBackdrop() {
            const drawer = document.getElementById('ops-hub-drawer');
            const backdrop = document.getElementById('ops-hub-backdrop');
            if (!drawer || !backdrop) return;
            const opened = drawer.classList.contains('translate-x-0') && !drawer.classList.contains('pointer-events-none');
            const shouldShow = opened && !opsHubPinned;
            backdrop.classList.toggle('hidden', !shouldShow);
        }

        function closeAllMajorFunctionModals(exceptId = '') {
            const keep = String(exceptId || '').trim();
            const ids = [
                'tdx-tools-modal',
                'blk-tools-modal',
                'batch-dashboard-modal',
                'batch-task-csv-picker-modal',
                'config-modal',
                'fundamental-detail-modal',
                'fundamental-module-detail-modal',
                'webhook-retry-modal',
                'pattern-picker-modal',
                'evolution-board-modal'
            ];
            ids.forEach(id => {
                if (id === keep) return;
                const el = document.getElementById(id);
                if (el) el.classList.add('hidden');
            });
        }

        function openFeatureFromHub(target) {
            const t = String(target || '').trim().toLowerCase();
            if (!t) return;
            if (t === 'tdx') {
                closeAllMajorFunctionModals('tdx-tools-modal');
                openTdxToolsModal();
                return;
            }
            if (t === 'blk') {
                closeAllMajorFunctionModals('blk-tools-modal');
                openBlkToolsModal();
                return;
            }
            if (t === 'batch') {
                closeAllMajorFunctionModals('batch-dashboard-modal');
                openBatchDashboardModal();
                return;
            }
            if (t === 'config') {
                closeAllMajorFunctionModals('config-modal');
                openConfigCenter();
                return;
            }
            if (t === 'webhook') {
                closeAllMajorFunctionModals('webhook-retry-modal');
                openWebhookRetryCenter();
                return;
            }
            if (t === 'pattern') {
                closeAllMajorFunctionModals('pattern-picker-modal');
                openPatternPicker();
                return;
            }
            if (t === 'evolution') {
                openEvolutionBoardModal();
                return;
            }
        }

        function openTdxToolsModal() {
            const modal = document.getElementById('tdx-tools-modal');
            if (modal) modal.classList.remove('hidden');
        }

        function closeTdxToolsModal() {
            const modal = document.getElementById('tdx-tools-modal');
            if (modal) modal.classList.add('hidden');
        }

        function openBlkToolsModal() {
            const modal = document.getElementById('blk-tools-modal');
            if (modal) modal.classList.remove('hidden');
            _applyBatchCsvDefaultsToUi();
            toggleBlkStrategySourceUi();
            loadBlkStrategyCatalog();
            loadBatchOverview();
            refreshBatchRunStatus();
        }

        function closeBlkToolsModal() {
            const modal = document.getElementById('blk-tools-modal');
            if (modal) modal.classList.add('hidden');
            if (batchRunPollTimer) {
                clearTimeout(batchRunPollTimer);
                batchRunPollTimer = null;
            }
        }

        function openBatchDashboardModal() {
            closeAllMajorFunctionModals('batch-dashboard-modal');
            const modal = document.getElementById('batch-dashboard-modal');
            if (modal) modal.classList.remove('hidden');
            _applyBatchCsvDefaultsToUi();
            toggleBatchStrategyScopeUi();
            applyBatchCombinationDefaultsFromCurrentStrategies(false);
            loadBatchOverview();
            refreshBatchRunStatus();
        }

        function closeBatchDashboardModal() {
            const modal = document.getElementById('batch-dashboard-modal');
            if (modal) modal.classList.add('hidden');
            closeBatchTaskCsvPicker();
            if (batchRunPollTimer) {
                clearTimeout(batchRunPollTimer);
                batchRunPollTimer = null;
            }
        }

        function _setTdxStatus(text, level = 'info') {
            const el = document.getElementById('tdx-tools-status');
            if (!el) return;
            const msg = String(text || '');
            el.innerText = msg;
            el.className = `text-xs ${level === 'error' ? 'text-rose-300' : (level === 'success' ? 'text-emerald-300' : 'text-slate-400')}`;
        }

        function _setBlkStatus(text, level = 'info') {
            const el = document.getElementById('blk-tools-status');
            if (!el) return;
            const msg = String(text || '');
            el.innerText = msg;
            el.className = `text-xs ${level === 'error' ? 'text-rose-300' : (level === 'success' ? 'text-emerald-300' : 'text-slate-400')}`;
        }

        function applyTdxPromptTemplate() {
            const key = String(document.getElementById('tdx-prompt-template')?.value || '').trim();
            if (!key) {
                _setTdxStatus('请先选择模板', 'error');
                return;
            }
            const klineType = String(document.getElementById('tdx-kline-type')?.value || '1min').trim() || '1min';
            const tfMap = { '1min': '1分钟', '5min': '5分钟', '15min': '15分钟', '30min': '30分钟', '60min': '60分钟', 'D': '日线' };
            const tfLabel = String(tfMap[klineType] || klineType);
            const templateMap = {
                ma_cross: `请基于${tfLabel}设计通达信选股公式：短周期均线上穿长周期均线触发信号，要求加入趋势过滤，避免震荡区反复触发。`,
                volume_breakout: `请基于${tfLabel}设计通达信选股公式：价格突破近20周期高点且当前成交量大于近5周期均量的1.8倍时触发信号。`,
                macd_divergence: `请基于${tfLabel}设计通达信选股公式：识别价格创新低但MACD柱体抬高的底背离形态，并在出现确认金叉时触发信号。`,
                rsi_reversal: `请基于${tfLabel}设计通达信选股公式：RSI先进入超卖区后重新上穿阈值，同时价格站回短期均线时触发信号。`
            };
            const prompt = String(templateMap[key] || '').trim();
            if (!prompt) {
                _setTdxStatus('模板内容为空', 'error');
                return;
            }
            const promptEl = document.getElementById('tdx-formula-prompt');
            if (promptEl) promptEl.value = prompt;
            _setTdxStatus(`已填充模板：${key}`, 'success');
        }

        async function generateTdxFormulaByLlm() {
            const prompt = String(document.getElementById('tdx-formula-prompt')?.value || '').trim();
            if (!prompt) {
                _setTdxStatus('请先输入公式需求描述', 'error');
                return;
            }
            const klineType = String(document.getElementById('tdx-kline-type')?.value || '1min').trim() || '1min';
            _setTdxStatus('大模型生成中...');
            try {
                const res = await fetch('/api/tdx/generate_formula', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt,
                        kline_type: klineType
                    })
                });
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    throw new Error(data.msg || '生成失败');
                }
                const formulaEl = document.getElementById('tdx-formula-text');
                if (formulaEl) formulaEl.value = String(data.formula_text || '').trim();
                _setTdxStatus(String(data.msg || '公式已生成'), 'success');
            } catch (e) {
                _setTdxStatus(`生成失败: ${e}`, 'error');
            }
        }

        async function compileTdxFormula() {
            const formulaText = String(document.getElementById('tdx-formula-text')?.value || '').trim();
            if (!formulaText) {
                _setTdxStatus('请先输入通达信公式', 'error');
                return;
            }
            const strategyId = String(document.getElementById('tdx-strategy-id')?.value || '').trim();
            const strategyName = String(document.getElementById('tdx-strategy-name')?.value || '').trim();
            const klineType = String(document.getElementById('tdx-kline-type')?.value || '1min').trim() || '1min';
            _setTdxStatus('编译中...');
            try {
                const res = await fetch('/api/tdx/compile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        formula_text: formulaText,
                        strategy_id: strategyId || null,
                        strategy_name: strategyName || null,
                        kline_type: klineType
                    })
                });
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    throw new Error(data.msg || '编译失败');
                }
                const meta = {
                    strategy_id: data.strategy_id,
                    strategy_name: data.strategy_name,
                    class_name: data.class_name,
                    kline_type: data.kline_type,
                    warmup_bars: data.warmup_bars,
                    used_functions: data.used_functions || []
                };
                const metaEl = document.getElementById('tdx-compile-meta');
                const codeEl = document.getElementById('tdx-compile-code');
                if (metaEl) metaEl.innerText = JSON.stringify(meta, null, 2);
                if (codeEl) codeEl.innerText = String(data.code || '--');
                if (!strategyId && data.strategy_id) {
                    const idEl = document.getElementById('tdx-strategy-id');
                    if (idEl) idEl.value = String(data.strategy_id);
                }
                _setTdxStatus('编译成功', 'success');
            } catch (e) {
                _setTdxStatus(`编译失败: ${e}`, 'error');
            }
        }

        async function importTdxFormulaStrategy() {
            const formulaText = String(document.getElementById('tdx-formula-text')?.value || '').trim();
            if (!formulaText) {
                _setTdxStatus('请先输入通达信公式', 'error');
                return;
            }
            const strategyId = String(document.getElementById('tdx-strategy-id')?.value || '').trim();
            const strategyName = String(document.getElementById('tdx-strategy-name')?.value || '').trim();
            const klineType = String(document.getElementById('tdx-kline-type')?.value || '1min').trim() || '1min';
            _setTdxStatus('导入中...');
            try {
                const res = await fetch('/api/tdx/import_strategy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        formula_text: formulaText,
                        strategy_id: strategyId || null,
                        strategy_name: strategyName || null,
                        kline_type: klineType
                    })
                });
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    throw new Error(data.msg || '导入失败');
                }
                const idEl = document.getElementById('tdx-strategy-id');
                if (idEl && data.strategy_id) idEl.value = String(data.strategy_id);
                _setTdxStatus(`导入成功: ${data.strategy_id || '--'}`, 'success');
                logMessage('SYSTEM', `TDX策略导入成功: ${data.strategy_id || '--'}`, 'success');
                await fetchGlobalStrategies();
            } catch (e) {
                _setTdxStatus(`导入失败: ${e}`, 'error');
            }
        }

        function _readLocalBlkFileAsText() {
            return new Promise((resolve, reject) => {
                const fileEl = document.getElementById('blk-file-input');
                const file = fileEl && fileEl.files && fileEl.files[0] ? fileEl.files[0] : null;
                if (!file) {
                    resolve('');
                    return;
                }
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(new Error('本地BLK文件读取失败'));
                reader.readAsText(file);
            });
        }

        async function _collectBlkSourcePayload() {
            const filePath = String(document.getElementById('blk-file-path')?.value || '').trim();
            const textAreaVal = String(document.getElementById('blk-content-text')?.value || '');
            const localText = await _readLocalBlkFileAsText();
            const content = localText || textAreaVal;
            if (!filePath && !content.trim()) {
                throw new Error('请提供BLK路径、上传文件或粘贴内容');
            }
            return { filePath, content };
        }

        function _validateBlkFormInputs(options = {}) {
            const forGenerate = !!options.forGenerate;
            const encodingEl = document.getElementById('blk-encoding');
            const encodingRaw = String(encodingEl?.value || 'auto').trim().toLowerCase();
            const encoding = encodingRaw || 'auto';
            const allowed = new Set(['auto', 'utf-8', 'utf8', 'gbk', 'gb2312']);
            if (!allowed.has(encoding)) {
                throw new Error('编码仅支持 auto/utf-8/utf8/gbk/gb2312');
            }
            if (encodingEl) encodingEl.value = encoding;
            const poolEl = document.getElementById('blk-stock-pool-csv');
            const stockPoolCsv = String(poolEl?.value || 'data/任务生成_标的池.csv').trim() || 'data/任务生成_标的池.csv';
            if (!stockPoolCsv.toLowerCase().endsWith('.csv') || stockPoolCsv.includes('..')) {
                throw new Error('标的池CSV路径不合法');
            }
            if (poolEl) poolEl.value = stockPoolCsv.replace(/\\/g, '/');
            const marketEl = document.getElementById('blk-market-tag');
            const industryEl = document.getElementById('blk-industry-tag');
            const sizeEl = document.getElementById('blk-size-tag');
            const marketTag = String(marketEl?.value || '主板').trim().slice(0, 32) || '主板';
            const industryTag = String(industryEl?.value || 'BLK导入').trim().slice(0, 32) || 'BLK导入';
            const sizeTag = String(sizeEl?.value || '未知').trim().slice(0, 32) || '未知';
            if (marketEl) marketEl.value = marketTag;
            if (industryEl) industryEl.value = industryTag;
            if (sizeEl) sizeEl.value = sizeTag;
            if (forGenerate) {
                const tasksEl = document.getElementById('blk-tasks-csv');
                const tasksCsv = _normalizeTaskCsvPath(String(tasksEl?.value || DEFAULT_TASKS_CSV).trim(), DEFAULT_TASKS_CSV);
                if (tasksEl) tasksEl.value = tasksCsv;
                const strategyCsvEl = document.getElementById('blk-strategies-csv');
                const strategiesCsv = String(strategyCsvEl?.value || 'data/任务生成_策略池.csv').trim() || 'data/任务生成_策略池.csv';
                if (!strategiesCsv.toLowerCase().endsWith('.csv') || strategiesCsv.includes('..')) {
                    throw new Error('策略池CSV路径不合法');
                }
                if (strategyCsvEl) strategyCsvEl.value = strategiesCsv.replace(/\\/g, '/');
                const prefixEl = document.getElementById('blk-task-file-prefix');
                const prefix = String(prefixEl?.value || '').trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40);
                if (prefixEl) prefixEl.value = prefix;
            }
        }

        async function parseBlkPreview() {
            _setBlkStatus('解析中...');
            try {
                _validateBlkFormInputs({ forGenerate: false });
                const source = await _collectBlkSourcePayload();
                const encoding = String(document.getElementById('blk-encoding')?.value || 'auto').trim() || 'auto';
                const normalizeSymbol = !!document.getElementById('blk-normalize-symbol')?.checked;
                const res = await fetch('/api/blk/parse', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        file_path: source.filePath || null,
                        content: source.content || null,
                        encoding,
                        normalize_symbol: normalizeSymbol
                    })
                });
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    throw new Error(data.msg || '解析失败');
                }
                const out = {
                    path: data.path || '',
                    count: data.count || 0,
                    sample_codes: Array.isArray(data.codes) ? data.codes.slice(0, 50) : [],
                    invalid_lines: data.invalid_lines || []
                };
                const resultEl = document.getElementById('blk-parse-result');
                if (resultEl) resultEl.innerText = JSON.stringify(out, null, 2);
                _setBlkStatus(`解析成功，共 ${Number(data.count || 0)} 只`, 'success');
            } catch (e) {
                _setBlkStatus(`解析失败: ${e}`, 'error');
            }
        }

        async function importBlkToStockPool() {
            _setBlkStatus('写入中...');
            try {
                _validateBlkFormInputs({ forGenerate: false });
                const source = await _collectBlkSourcePayload();
                const encoding = String(document.getElementById('blk-encoding')?.value || 'auto').trim() || 'auto';
                const normalizeSymbol = !!document.getElementById('blk-normalize-symbol')?.checked;
                const stockPoolCsv = String(document.getElementById('blk-stock-pool-csv')?.value || 'data/任务生成_标的池.csv').trim() || 'data/任务生成_标的池.csv';
                const importMode = String(document.getElementById('blk-import-mode')?.value || 'append').trim() || 'append';
                const marketTag = String(document.getElementById('blk-market-tag')?.value || '主板').trim() || '主板';
                const industryTag = String(document.getElementById('blk-industry-tag')?.value || 'BLK导入').trim() || 'BLK导入';
                const sizeTag = String(document.getElementById('blk-size-tag')?.value || '未知').trim() || '未知';
                const enabled = !!document.getElementById('blk-enabled')?.checked;
                const res = await fetch('/api/blk/import_stock_pool', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        file_path: source.filePath || null,
                        content: source.content || null,
                        encoding,
                        normalize_symbol: normalizeSymbol,
                        import_mode: importMode,
                        market_tag: marketTag,
                        industry_tag: industryTag,
                        size_tag: sizeTag,
                        enabled,
                        stock_pool_csv: stockPoolCsv
                    })
                });
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    throw new Error(data.msg || '写入失败');
                }
                const resultEl = document.getElementById('blk-parse-result');
                if (resultEl) resultEl.innerText = JSON.stringify(data, null, 2);
                const addedCount = Number(data.added_count || 0);
                const updatedCount = Number(data.updated_count || 0);
                _setBlkStatus(`写入成功: 新增${addedCount} 更新${updatedCount}（可点“一键生成任务”）`, 'success');
                logMessage('SYSTEM', `BLK导入完成: 新增${Number(data.added_count || 0)} 更新${Number(data.updated_count || 0)}`, 'success');
                const generateMode = String(document.getElementById('blk-generate-mode')?.value || 'append').trim() || 'append';
                const askText = `BLK导入成功（新增${addedCount}，更新${updatedCount}）。\n是否立即生成批量任务？\n当前任务模式：${generateMode}`;
                if (window.confirm(askText)) {
                    await generateBatchTasksQuick('auto_confirm');
                } else {
                    _setBlkStatus('已导入，可稍后手动点“一键生成任务”', 'success');
                }
            } catch (e) {
                _setBlkStatus(`写入失败: ${e}`, 'error');
            }
        }

        function buildAutoTaskCsvPath() {
            const d = new Date();
            const yyyy = String(d.getFullYear());
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            const ms = String(d.getMilliseconds()).padStart(3, '0');
            const rawPrefix = String(document.getElementById('blk-task-file-prefix')?.value || '').trim();
            const cleanPrefix = rawPrefix.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_');
            const prefix = cleanPrefix ? `${cleanPrefix}` : '';
            return `data/batch_tasks/${prefix}批量回测任务_${yyyy}${mm}${dd}_${hh}${mi}${ss}_${ms}.csv`;
        }

        function _normalizeTaskCsvPath(raw, fallback = DEFAULT_TASKS_CSV) {
            const text = String(raw || '').trim().replace(/\\/g, '/');
            const base = text || String(fallback || DEFAULT_TASKS_CSV);
            const withExt = base.toLowerCase().endsWith('.csv') ? base : `${base}.csv`;
            const cleaned = withExt.replace(/\/+/g, '/').replace(/^\.\//, '');
            if (!/^data\/batch_tasks\//.test(cleaned)) {
                throw new Error('任务CSV必须位于 data/batch_tasks/ 目录');
            }
            if (cleaned.includes('..')) {
                throw new Error('任务CSV路径不允许包含 ..');
            }
            return cleaned;
        }

        function _normalizeArchiveCsvPath(raw, fallback = DEFAULT_ARCHIVE_TASKS_CSV) {
            return _normalizeTaskCsvPath(raw, fallback);
        }

        function _normalizeBatchFilterText(raw) {
            return String(raw || '')
                .replace(/，/g, ',')
                .split(',')
                .map(x => String(x || '').trim())
                .filter(Boolean)
                .join(',');
        }

        function _readIntInput(id, { min = 0, max = 999999, fallback = 0 } = {}) {
            const el = document.getElementById(id);
            const raw = Number(el?.value);
            const value = Number.isFinite(raw) ? Math.floor(raw) : fallback;
            const safe = Math.max(min, Math.min(max, value));
            if (el) el.value = String(safe);
            return safe;
        }

        function _applyBatchCsvDefaultsToUi() {
            const blkTasks = document.getElementById('blk-tasks-csv');
            if (blkTasks && !String(blkTasks.value || '').trim()) blkTasks.value = DEFAULT_TASKS_CSV;
            const batchRunTasks = document.getElementById('batch-run-tasks-csv');
            if (batchRunTasks && !String(batchRunTasks.value || '').trim()) batchRunTasks.value = DEFAULT_TASKS_CSV;
            const bdmTasks = document.getElementById('bdm-tasks-csv');
            if (bdmTasks && !String(bdmTasks.value || '').trim()) bdmTasks.value = DEFAULT_TASKS_CSV;
            const bdmArchive = document.getElementById('bdm-archive-csv');
            if (bdmArchive && !String(bdmArchive.value || '').trim()) bdmArchive.value = DEFAULT_ARCHIVE_TASKS_CSV;
        }

        function _resolveBatchStrategyIdsFromUi() {
            const picked = Array.isArray(selectedStrategyIds) ? selectedStrategyIds.map(x => String(x || '').trim()).filter(Boolean) : [];
            if (picked.length) return picked;
            const all = Array.isArray(strategyCatalog) ? strategyCatalog.map(x => String(x?.id || '').trim()).filter(Boolean) : [];
            return all;
        }

        function _setBatchComboHelpStatus(text, level = 'info') {
            const el = document.getElementById('batch-combo-help-status');
            if (!el) return;
            el.innerText = String(text || '');
            el.className = `font-mono ${level === 'error' ? 'text-rose-300' : (level === 'success' ? 'text-emerald-300' : 'text-slate-400')}`;
        }

        function _parseComboWeightsText(weightsText) {
            const weights = {};
            const text = String(weightsText || '').trim();
            if (!text) return weights;
            text.split(/[,，;\n]+/).forEach(pair => {
                const p = String(pair || '').trim();
                if (!p) return;
                const m = p.match(/^([^:=\s]+)\s*[:=]\s*([-+]?[0-9]*\.?[0-9]+)$/);
                if (!m) return;
                const sid = String(m[1] || '').trim();
                const w = Number(m[2]);
                if (!sid || !Number.isFinite(w)) return;
                weights[sid] = w;
            });
            return weights;
        }

        function _serializeComboWeights(weightsObj, orderedIds = []) {
            const obj = (weightsObj && typeof weightsObj === 'object') ? weightsObj : {};
            const used = new Set();
            const rows = [];
            (Array.isArray(orderedIds) ? orderedIds : []).forEach(sidRaw => {
                const sid = String(sidRaw || '').trim();
                if (!sid || used.has(sid)) return;
                const w = Number(obj[sid]);
                if (!Number.isFinite(w)) return;
                used.add(sid);
                rows.push(`${sid}=${w}`);
            });
            Object.keys(obj).sort((a, b) => String(a).localeCompare(String(b))).forEach(sid => {
                if (used.has(sid)) return;
                const w = Number(obj[sid]);
                if (!Number.isFinite(w)) return;
                rows.push(`${sid}=${w}`);
            });
            return rows.join(',');
        }

        function _defaultBatchCombinationForStrategies(strategyIds) {
            const ids = Array.isArray(strategyIds) ? strategyIds.map(x => String(x || '').trim()).filter(Boolean) : [];
            const total = ids.length;
            const useVote = total >= 2;
            const mode = useVote ? 'vote' : 'or';
            const minAgree = useVote ? Math.max(1, Math.ceil(total * 0.6)) : 1;
            const tiePolicy = 'skip';
            const weights = {};
            ids.forEach(sid => { weights[sid] = 1; });
            return {
                enabled: true,
                mode,
                min_agree_count: minAgree,
                tie_policy: tiePolicy,
                weights
            };
        }

        function _readBatchCombinationConfigFromUi() {
            const mode = String(document.getElementById('batch-combo-mode')?.value || 'vote').trim().toLowerCase() || 'vote';
            const minAgreeRaw = Number(document.getElementById('batch-combo-min-agree')?.value || 1);
            const minAgree = Number.isFinite(minAgreeRaw) && minAgreeRaw >= 1 ? Math.floor(minAgreeRaw) : 1;
            const tiePolicy = String(document.getElementById('batch-combo-tie-policy')?.value || 'skip').trim().toLowerCase() || 'skip';
            const weightsText = String(document.getElementById('batch-combo-weights')?.value || '').trim();
            return {
                enabled: true,
                mode,
                min_agree_count: minAgree,
                tie_policy: tiePolicy,
                weights: _parseComboWeightsText(weightsText)
            };
        }

        function _applyBatchCombinationConfigToUi(config, strategyIds = []) {
            const cfg = (config && typeof config === 'object') ? config : {};
            const mode = String(cfg.mode || 'vote').trim().toLowerCase() || 'vote';
            const tiePolicy = String(cfg.tie_policy || 'skip').trim().toLowerCase() || 'skip';
            const minAgreeRaw = Number(cfg.min_agree_count || 1);
            const minAgree = Number.isFinite(minAgreeRaw) && minAgreeRaw >= 1 ? Math.floor(minAgreeRaw) : 1;
            const modeEl = document.getElementById('batch-combo-mode');
            const minEl = document.getElementById('batch-combo-min-agree');
            const tieEl = document.getElementById('batch-combo-tie-policy');
            const weightsEl = document.getElementById('batch-combo-weights');
            if (modeEl) modeEl.value = mode;
            if (minEl) minEl.value = String(minAgree);
            if (tieEl) tieEl.value = tiePolicy;
            if (weightsEl) weightsEl.value = _serializeComboWeights(cfg.weights || {}, strategyIds);
        }

        function _getManualPickedBatchStrategyIds() {
            const wrap = document.getElementById('batch-manual-strategy-select');
            if (!wrap) return [];
            return Array.from(wrap.querySelectorAll('input[type="checkbox"][data-strategy-id]:checked') || [])
                .map(el => String(el.getAttribute('data-strategy-id') || '').trim())
                .filter(Boolean);
        }

        function _resolveBatchStrategyIdsForScope() {
            const mode = String(document.getElementById('batch-strategy-scope-mode')?.value || 'selected').trim();
            if (mode === 'manual_pick') {
                const manual = _getManualPickedBatchStrategyIds();
                if (manual.length) return manual;
                return [];
            }
            if (mode === 'all_enabled') {
                return (Array.isArray(strategyCatalog) ? strategyCatalog : [])
                    .map(x => String(x?.id || '').trim())
                    .filter(Boolean);
            }
            return _resolveBatchStrategyIdsFromUi();
        }

        function _refreshBatchStrategyRangeSummary() {
            const el = document.getElementById('batch-strategy-range-summary');
            if (!el) return;
            const mode = String(document.getElementById('batch-strategy-scope-mode')?.value || 'selected').trim();
            const ids = _resolveBatchStrategyIdsForScope();
            const modeLabel = mode === 'all_enabled' ? '全部启用策略' : (mode === 'manual_pick' ? '手动勾选策略' : '主界面已选策略');
            if (!ids.length) {
                el.innerText = `策略范围：${modeLabel}（0个）`;
                return;
            }
            const brief = ids.slice(0, 8).join(',');
            const tail = ids.length > 8 ? ` ... +${ids.length - 8}` : '';
            el.innerText = `策略范围：${modeLabel}（${ids.length}个） ${brief}${tail}`;
        }

        async function loadBatchStrategyCatalog() {
            try {
                if (!Array.isArray(strategyCatalog) || !strategyCatalog.length) {
                    const res = await fetch('/api/strategies');
                    const data = await res.json();
                    if (res.ok && Array.isArray(data.strategies)) {
                        strategyCatalog = data.strategies.map(item => ({
                            id: String(item?.id || '').trim(),
                            name: String(item?.name || '').trim(),
                        })).filter(x => x.id);
                    }
                }
            } catch (_) {}
            const wrap = document.getElementById('batch-manual-strategy-select');
            if (!wrap) return;
            const existing = new Set(_getManualPickedBatchStrategyIds());
            const rows = (Array.isArray(strategyCatalog) ? strategyCatalog : []).filter(x => String(x?.id || '').trim());
            if (!rows.length) {
                wrap.innerHTML = '<div class="text-slate-500">暂无策略</div>';
                return;
            }
            wrap.innerHTML = rows.map(r => {
                const sid = String(r.id);
                const checked = existing.has(sid) ? 'checked' : '';
                return `<label class="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-slate-700/50"><input type="checkbox" data-strategy-id="${sid}" ${checked} onchange="_refreshBatchStrategyRangeSummary()" /><span>${sid}${r.name ? ` | ${String(r.name)}` : ''}</span></label>`;
            }).join('');
            _refreshBatchStrategyRangeSummary();
        }

        function selectAllBatchManualStrategies(checked) {
            const wrap = document.getElementById('batch-manual-strategy-select');
            if (!wrap) return;
            Array.from(wrap.querySelectorAll('input[type="checkbox"][data-strategy-id]') || []).forEach(el => {
                el.checked = !!checked;
            });
            _refreshBatchStrategyRangeSummary();
        }

        function toggleBatchStrategyScopeUi() {
            const mode = String(document.getElementById('batch-strategy-scope-mode')?.value || 'selected').trim();
            const wrap = document.getElementById('batch-manual-strategy-wrap');
            if (wrap) {
                if (mode === 'manual_pick') wrap.classList.remove('hidden');
                else wrap.classList.add('hidden');
            }
            if (mode === 'manual_pick') {
                loadBatchStrategyCatalog();
            }
            _refreshBatchStrategyRangeSummary();
        }

        function applyBatchCombinationDefaultsFromCurrentStrategies(showNotice = true) {
            const strategyIds = _resolveBatchStrategyIdsForScope();
            if (!strategyIds.length) {
                _setBatchComboHelpStatus('未找到策略范围，请先选择策略', 'error');
                const adviceEl = document.getElementById('batch-combo-ai-advice');
                if (adviceEl) adviceEl.innerText = '--';
                return;
            }
            const cfg = _defaultBatchCombinationForStrategies(strategyIds);
            _applyBatchCombinationConfigToUi(cfg, strategyIds);
            if (showNotice) _setBatchComboHelpStatus(`默认组合参数已回填（${strategyIds.length}个策略）`, 'success');
            _refreshBatchStrategyRangeSummary();
        }

        function syncBatchComboConfigToBacktestOps() {
            const cfg = _readBatchCombinationConfigFromUi();
            const modeEl = document.getElementById('bt-combo-mode');
            const minEl = document.getElementById('bt-combo-min-agree');
            const tieEl = document.getElementById('bt-combo-tie-policy');
            const weightsEl = document.getElementById('bt-combo-weights');
            if (modeEl) modeEl.value = String(cfg.mode || 'or');
            if (minEl) minEl.value = String(cfg.min_agree_count || 1);
            if (tieEl) tieEl.value = String(cfg.tie_policy || 'skip');
            if (weightsEl) weightsEl.value = _serializeComboWeights(cfg.weights || {}, _resolveBatchStrategyIdsForScope());
            _setBatchComboHelpStatus('已同步到“回测组合参数”面板', 'success');
        }

        async function recommendBatchCombinationByAI() {
            if (batchComboRecommendPending) return;
            const strategyIds = _resolveBatchStrategyIdsForScope();
            if (!strategyIds.length) {
                _setBatchComboHelpStatus('请先选择策略范围', 'error');
                return;
            }
            const adviceEl = document.getElementById('batch-combo-ai-advice');
            batchComboRecommendPending = true;
            _setBatchComboHelpStatus('AI分析中...', 'info');
            try {
                const profiles = strategyIds.map(sid => {
                    const meta = (Array.isArray(strategyCatalog) ? strategyCatalog : []).find(x => String(x?.id || '') === String(sid));
                    return {
                        strategy_id: sid,
                        strategy_name: String(meta?.name || ''),
                        score_hint: Number(latestStrategyScores?.[sid])
                    };
                });
                const res = await fetch('/api/batch/combination/recommend', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        strategy_ids: strategyIds,
                        strategy_profiles: profiles
                    })
                });
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    throw new Error(data.msg || 'AI推荐失败');
                }
                const cfg = data.recommendation && typeof data.recommendation === 'object' ? data.recommendation : {};
                _applyBatchCombinationConfigToUi(cfg, strategyIds);
                const analysisText = String(data.analysis || '').trim();
                if (adviceEl) adviceEl.innerText = analysisText || JSON.stringify(cfg, null, 2);
                const sourceText = String(data.source || '').trim();
                _setBatchComboHelpStatus(`AI推荐已回填${sourceText ? `（${sourceText}）` : ''}`, 'success');
            } catch (e) {
                _setBatchComboHelpStatus(`AI推荐失败: ${e}`, 'error');
                if (adviceEl) adviceEl.innerText = String(e || '');
            } finally {
                batchComboRecommendPending = false;
            }
        }

        function toggleBlkStrategySourceUi() {
            const mode = String(document.getElementById('blk-strategy-source-mode')?.value || 'selected').trim();
            const wrap = document.getElementById('blk-manual-strategy-wrap');
            if (!wrap) return;
            if (mode === 'manual_pick') {
                wrap.classList.remove('hidden');
            } else {
                wrap.classList.add('hidden');
            }
        }

        async function loadBlkStrategyCatalog() {
            try {
                if (!Array.isArray(strategyCatalog) || !strategyCatalog.length) {
                    const res = await fetch('/api/strategies');
                    const data = await res.json();
                    if (res.ok && Array.isArray(data.strategies)) {
                        strategyCatalog = data.strategies.map(item => ({
                            id: String(item?.id || '').trim(),
                            name: String(item?.name || '').trim(),
                        })).filter(x => x.id);
                    }
                }
            } catch (_) {}
            const wrap = document.getElementById('blk-manual-strategy-select');
            if (!wrap) return;
            const existing = new Set(
                Array.from(wrap.querySelectorAll('input[type="checkbox"][data-strategy-id]:checked') || [])
                    .map(el => String(el.getAttribute('data-strategy-id') || '').trim())
                    .filter(Boolean)
            );
            const rows = (Array.isArray(strategyCatalog) ? strategyCatalog : []).filter(x => String(x?.id || '').trim());
            wrap.innerHTML = rows.map(r => {
                const sid = String(r.id);
                const checked = existing.has(sid) ? 'checked' : '';
                return `<label class="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-slate-700/50"><input type="checkbox" data-strategy-id="${sid}" ${checked} /><span>${sid}${r.name ? ` | ${String(r.name)}` : ''}</span></label>`;
            }).join('');
        }

        function _getManualPickedStrategyIds() {
            const wrap = document.getElementById('blk-manual-strategy-select');
            if (!wrap) return [];
            return Array.from(wrap.querySelectorAll('input[type="checkbox"][data-strategy-id]:checked') || [])
                .map(el => String(el.getAttribute('data-strategy-id') || '').trim())
                .filter(Boolean);
        }

        function selectAllBlkManualStrategies(checked) {
            const wrap = document.getElementById('blk-manual-strategy-select');
            if (!wrap) return;
            Array.from(wrap.querySelectorAll('input[type="checkbox"][data-strategy-id]') || []).forEach(el => {
                el.checked = !!checked;
            });
        }

        async function syncBatchStrategyPoolFromUi() {
            _setBlkStatus('策略池同步中...');
            try {
                _validateBlkFormInputs({ forGenerate: true });
                const strategyPoolCsv = String(document.getElementById('blk-strategies-csv')?.value || 'data/任务生成_策略池.csv').trim() || 'data/任务生成_策略池.csv';
                const sourceMode = String(document.getElementById('blk-strategy-source-mode')?.value || 'selected').trim();
                const useAllEnabled = sourceMode === 'all_enabled';
                const manualPick = sourceMode === 'manual_pick';
                if (manualPick) {
                    await loadBlkStrategyCatalog();
                }
                const strategyIds = useAllEnabled ? [] : (manualPick ? _getManualPickedStrategyIds() : _resolveBatchStrategyIdsFromUi());
                if (!useAllEnabled && !strategyIds.length) {
                    throw new Error(manualPick ? '请先在“手动勾选策略”里至少选择一个策略' : '当前主界面未选策略，请先选择或改为“全部启用策略/手动勾选策略”');
                }
                const res = await fetch('/api/batch/strategy_pool/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        strategy_pool_csv: strategyPoolCsv,
                        strategy_ids: strategyIds,
                        use_all_enabled: useAllEnabled,
                        mode: 'replace'
                    })
                });
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    throw new Error(data.msg || '同步失败');
                }
                const resultEl = document.getElementById('blk-parse-result');
                if (resultEl) resultEl.innerText = JSON.stringify(data, null, 2);
                _setBlkStatus(`策略池同步完成：${Number(data.total_count || 0)} 条`, 'success');
                return data;
            } catch (e) {
                _setBlkStatus(`策略池同步失败: ${e}`, 'error');
                throw e;
            }
        }

        async function generateBatchTasksQuick(triggerSource = 'manual') {
            _setBlkStatus(triggerSource === 'auto_confirm' ? '已确认，任务生成中...' : '任务生成中...');
            try {
                _validateBlkFormInputs({ forGenerate: true });
                const generateMode = String(document.getElementById('blk-generate-mode')?.value || 'append').trim() || 'append';
                const maxTasks = _readIntInput('blk-generate-max-tasks', { min: 0, max: 200000, fallback: 0 });
                const autoNewTaskFile = !!document.getElementById('blk-auto-new-task-file')?.checked;
                let tasksCsv = String(document.getElementById('blk-tasks-csv')?.value || DEFAULT_TASKS_CSV).trim() || DEFAULT_TASKS_CSV;
                if (autoNewTaskFile) {
                    tasksCsv = buildAutoTaskCsvPath();
                    const tasksInput = document.getElementById('blk-tasks-csv');
                    if (tasksInput) tasksInput.value = tasksCsv;
                }
                tasksCsv = _normalizeTaskCsvPath(tasksCsv, DEFAULT_TASKS_CSV);
                const tasksInput = document.getElementById('blk-tasks-csv');
                if (tasksInput) tasksInput.value = tasksCsv;
                const stocksCsv = String(document.getElementById('blk-stock-pool-csv')?.value || 'data/任务生成_标的池.csv').trim() || 'data/任务生成_标的池.csv';
                const strategiesCsv = String(document.getElementById('blk-strategies-csv')?.value || 'data/任务生成_策略池.csv').trim() || 'data/任务生成_策略池.csv';
                await syncBatchStrategyPoolFromUi();
                const res = await fetch('/api/batch/generate_tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        generate_mode: generateMode,
                        generate_max_tasks: maxTasks,
                        tasks_csv: tasksCsv,
                        generator_stocks_csv: stocksCsv,
                        generator_strategies_csv: strategiesCsv,
                        generator_windows_csv: 'data/任务生成_区间池.csv',
                        generator_scenarios_csv: 'data/任务生成_场景池.csv'
                    })
                });
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    const outputTail = Array.isArray(data.output_tail) ? data.output_tail : [];
                    const firstErrorLine = String(outputTail.find(x => String(x || '').trim()) || '').trim();
                    const detailMsg = firstErrorLine ? `；详情: ${firstErrorLine}` : '';
                    const rcMsg = Number.isFinite(Number(data.returncode)) ? `（exit=${Number(data.returncode)}）` : '';
                    throw new Error(`${data.msg || '任务生成失败'}${rcMsg}${detailMsg}`);
                }
                const resultEl = document.getElementById('blk-parse-result');
                if (resultEl) resultEl.innerText = JSON.stringify(data, null, 2);
                _setBlkStatus(`任务生成完成：${tasksCsv}（仅生成任务，不会触发单票回测）`, 'success');
                logMessage('SYSTEM', `批量任务生成完成：${tasksCsv}`, 'success');
                loadBatchOverview();
            } catch (e) {
                _setBlkStatus(`任务生成失败: ${e}`, 'error');
            }
        }

        function _fmtPct(v, digits = 2) {
            const n = Number(v);
            if (!Number.isFinite(n)) return '--';
            return `${(n * 100).toFixed(digits)}%`;
        }

        function _fmtNum(v, digits = 2) {
            const n = Number(v);
            if (!Number.isFinite(n)) return '--';
            return n.toFixed(digits);
        }

        function _setBatchOverviewStatus(text, level = 'info') {
            const el = document.getElementById('batch-overview-status');
            if (!el) return;
            el.innerText = String(text || '');
            el.className = `text-[11px] font-mono ${level === 'error' ? 'text-rose-300' : (level === 'success' ? 'text-emerald-300' : 'text-slate-400')}`;
        }

        async function loadBatchOverview() {
            _setBatchOverviewStatus('看板加载中...');
            try {
                const tasksCsv = _normalizeTaskCsvPath(String(document.getElementById('batch-run-tasks-csv')?.value || document.getElementById('blk-tasks-csv')?.value || DEFAULT_TASKS_CSV).trim(), DEFAULT_TASKS_CSV);
                const tasksInput = document.getElementById('batch-run-tasks-csv') || document.getElementById('blk-tasks-csv');
                if (tasksInput) tasksInput.value = tasksCsv;
                const params = new URLSearchParams({
                    tasks_csv: tasksCsv,
                    results_csv: 'data/批量回测结果.csv',
                    summary_csv: 'data/策略汇总评分.csv',
                    limit: '300'
                });
                const res = await fetch(`/api/batch/overview?${params.toString()}`);
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    throw new Error(data.msg || '加载失败');
                }
                batchOverviewPayload = data;
                renderBatchOverview();
                _setBatchOverviewStatus(`已加载：任务${Number(data?.meta?.task_count || 0)} 结果${Number(data?.meta?.result_count || 0)} 汇总${Number(data?.meta?.summary_count || 0)}`, 'success');
            } catch (e) {
                _setBatchOverviewStatus(`加载失败: ${e}`, 'error');
            }
        }

        function openBatchTaskCsvPicker() {
            const modal = document.getElementById('batch-task-csv-picker-modal');
            if (modal) modal.classList.remove('hidden');
            loadBatchTaskCsvList();
        }

        function closeBatchTaskCsvPicker() {
            const modal = document.getElementById('batch-task-csv-picker-modal');
            if (modal) modal.classList.add('hidden');
        }

        async function loadBatchTaskCsvList() {
            const statusEl = document.getElementById('batch-task-csv-list-status');
            const body = document.getElementById('batch-task-csv-list-body');
            if (statusEl) statusEl.innerText = '加载中...';
            if (body) body.innerHTML = '';
            try {
                const includeArchive = !!document.getElementById('batch-task-csv-include-archive')?.checked;
                const params = new URLSearchParams({
                    limit: '500',
                    include_archive: includeArchive ? '1' : '0',
                });
                const res = await fetch(`/api/batch/tasks_csv/list?${params.toString()}`);
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    throw new Error(data.msg || '加载失败');
                }
                batchTaskCsvListRows = Array.isArray(data.files) ? data.files : [];
                if (!batchTaskCsvListRows.length) {
                    if (body) body.innerHTML = '<tr><td colspan="4" class="px-2 py-3 text-center text-slate-500">目录中暂无任务CSV</td></tr>';
                } else if (body) {
                    body.innerHTML = '';
                    batchTaskCsvListRows.forEach(item => {
                        const tr = document.createElement('tr');
                        tr.className = 'cursor-pointer hover:bg-slate-800/70';
                        tr.onclick = () => applySelectedBatchTaskCsv(String(item.path || DEFAULT_TASKS_CSV));
                        tr.innerHTML = `
                            <td class="px-2 py-1 text-cyan-300 break-all">${String(item.path || '--')}</td>
                            <td class="px-2 py-1 text-slate-300">${String(item.mtime || '--')}</td>
                            <td class="px-2 py-1 text-right text-slate-300">${Number(item.size || 0)}</td>
                            <td class="px-2 py-1 text-slate-300">${item.is_archive ? 'archive' : 'task'}</td>
                        `;
                        body.appendChild(tr);
                    });
                }
                if (statusEl) statusEl.innerText = `已加载 ${batchTaskCsvListRows.length} 个文件`;
            } catch (e) {
                if (statusEl) statusEl.innerText = `加载失败: ${e}`;
            }
        }

        async function createBatchTaskCsvTemplate() {
            const statusEl = document.getElementById('batch-task-csv-list-status');
            if (statusEl) statusEl.innerText = '创建中...';
            try {
                const prefixEl = document.getElementById('batch-task-csv-new-prefix');
                const overwrite = !!document.getElementById('batch-task-csv-new-overwrite')?.checked;
                const rawPrefix = String(prefixEl?.value || '').trim();
                const cleanPrefix = rawPrefix.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 48);
                if (prefixEl) prefixEl.value = cleanPrefix;
                const res = await fetch('/api/batch/tasks_csv/create_template', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prefix: cleanPrefix,
                        overwrite
                    })
                });
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    throw new Error(data.msg || '创建失败');
                }
                const newPath = _normalizeTaskCsvPath(String(data.path || DEFAULT_TASKS_CSV), DEFAULT_TASKS_CSV);
                const bdmInput = document.getElementById('bdm-tasks-csv');
                const blkInput = document.getElementById('blk-tasks-csv');
                if (bdmInput) bdmInput.value = newPath;
                if (blkInput) blkInput.value = newPath;
                if (statusEl) statusEl.innerText = `创建成功：${newPath}`;
                await loadBatchTaskCsvList();
                await loadBatchTaskPreview();
            } catch (e) {
                if (statusEl) statusEl.innerText = `创建失败: ${e}`;
            }
        }

        function applySelectedBatchTaskCsv(path) {
            try {
                const normalized = _normalizeTaskCsvPath(path, DEFAULT_TASKS_CSV);
                const runInput = document.getElementById('batch-run-tasks-csv');
                const bdmInput = document.getElementById('bdm-tasks-csv');
                const blkInput = document.getElementById('blk-tasks-csv');
                if (runInput) runInput.value = normalized;
                if (bdmInput) bdmInput.value = normalized;
                if (blkInput) blkInput.value = normalized;
                const statusEl = document.getElementById('bdm-task-preview-status');
                if (statusEl) statusEl.innerText = `已选择任务文件：${normalized}`;
                closeBatchTaskCsvPicker();
                loadBatchOverview();
                refreshBatchRunStatus();
            } catch (e) {
                const statusEl = document.getElementById('batch-task-csv-list-status');
                if (statusEl) statusEl.innerText = `路径不合法: ${e}`;
            }
        }

        async function loadBatchTaskPreview() {
            const statusEl = document.getElementById('bdm-task-preview-status');
            if (statusEl) statusEl.innerText = '任务预览加载中...';
            try {
                const tasksCsv = _normalizeTaskCsvPath(String(document.getElementById('bdm-tasks-csv')?.value || DEFAULT_TASKS_CSV).trim(), DEFAULT_TASKS_CSV);
                const tasksInput = document.getElementById('bdm-tasks-csv');
                if (tasksInput) tasksInput.value = tasksCsv;
                const batchFilter = _normalizeBatchFilterText(String(document.getElementById('bdm-batch-filter')?.value || '').trim());
                const batchFilterInput = document.getElementById('bdm-batch-filter');
                if (batchFilterInput) batchFilterInput.value = batchFilter;
                const statusFilter = String(document.getElementById('bdm-status-filter')?.value || '').trim();
                const limit = _readIntInput('bdm-preview-limit', { min: 20, max: 3000, fallback: 500 });
                const params = new URLSearchParams({
                    tasks_csv: tasksCsv,
                    batch_no_filter: batchFilter,
                    status_filter: statusFilter,
                    limit: String(limit),
                });
                const res = await fetch(`/api/batch/tasks_preview?${params.toString()}`);
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    throw new Error(data.msg || '加载失败');
                }
                batchDashboardTaskRows = Array.isArray(data.rows) ? data.rows : [];
                const pickedExists = batchDashboardTaskRows.some(x => String(x.task_id || '') === String(batchDashboardTaskSelectedId || ''));
                if ((!batchDashboardTaskSelectedId || !pickedExists) && batchDashboardTaskRows.length) {
                    batchDashboardTaskSelectedId = String(batchDashboardTaskRows[0].task_id || '');
                }
                renderBatchTaskPreviewTable();
                const shown = batchDashboardTaskRows.length;
                const total = Number(data.total || shown);
                if (statusEl) statusEl.innerText = `任务预览已加载：显示 ${shown} / 匹配 ${total} | ${data.path || tasksCsv}`;
            } catch (e) {
                if (statusEl) statusEl.innerText = `任务预览加载失败: ${e}`;
            }
        }

        function renderBatchTaskPreviewTable() {
            const body = document.getElementById('bdm-task-preview-body');
            if (!body) return;
            body.innerHTML = '';
            if (!Array.isArray(batchDashboardTaskRows) || !batchDashboardTaskRows.length) {
                body.innerHTML = '<tr><td colspan="6" class="px-2 py-3 text-center text-slate-500">暂无任务</td></tr>';
                renderBatchTaskDetailById('');
                return;
            }
            batchDashboardTaskRows.forEach(row => {
                const tid = String(row.task_id || '');
                const active = tid && tid === batchDashboardTaskSelectedId;
                const tr = document.createElement('tr');
                tr.className = `cursor-pointer hover:bg-slate-800/70 ${active ? 'bg-slate-800/80' : ''}`;
                tr.onclick = () => {
                    batchDashboardTaskSelectedId = tid;
                    renderBatchTaskPreviewTable();
                };
                tr.innerHTML = `
                    <td class="px-2 py-1 text-slate-300">${tid || '--'}</td>
                    <td class="px-2 py-1 text-slate-300">${row.batch_no || '--'}</td>
                    <td class="px-2 py-1 text-cyan-300">${row.stock_code || '--'}</td>
                    <td class="px-2 py-1 text-white">${row.strategy_id || '--'}</td>
                    <td class="px-2 py-1 text-slate-300">${row.start_date || '--'} ~ ${row.end_date || '--'}</td>
                    <td class="px-2 py-1 text-slate-300">${row.status || '--'}</td>
                `;
                body.appendChild(tr);
            });
            renderBatchTaskDetailById(batchDashboardTaskSelectedId);
        }

        function renderBatchTaskDetailById(taskId) {
            const body = document.getElementById('bdm-task-detail-body');
            if (!body) return;
            body.innerHTML = '';
            const row = (Array.isArray(batchDashboardTaskRows) ? batchDashboardTaskRows : []).find(x => String(x.task_id || '') === String(taskId || ''));
            if (!row) {
                body.innerHTML = '<tr><td class="px-2 py-3 text-center text-slate-500">请先选择一条任务</td></tr>';
                return;
            }
            const entries = [
                ['任务ID', row.task_id], ['批次号', row.batch_no], ['优先级', row.priority], ['是否启用', row.enabled],
                ['股票代码', row.stock_code], ['策略ID', row.strategy_id], ['开始日期', row.start_date], ['结束日期', row.end_date],
                ['初始资金', row.capital], ['K线周期', row.kline_type], ['数据源', row.data_source], ['场景标签', row.scenario_tag],
                ['成本档位', row.cost_profile], ['滑点BP', row.slippage_bp], ['佣金费率', row.commission_rate], ['印花税率', row.stamp_tax_rate],
                ['最小手数', row.min_lot], ['是否T1', row.enforce_t1], ['最大重试', row.max_retry], ['任务状态', row.status],
                ['报告ID', row.report_id], ['错误信息', row.error_msg], ['创建时间', row.created_at], ['更新时间', row.updated_at]
            ];
            entries.forEach(([k, v]) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td class="px-2 py-1 text-slate-400 w-28">${k}</td><td class="px-2 py-1 text-slate-200 break-all">${String(v || '--')}</td>`;
                body.appendChild(tr);
            });
        }

        function _collectBatchRunPayloadFromDashboard() {
            const tasksCsv = _normalizeTaskCsvPath(String(document.getElementById('bdm-tasks-csv')?.value || DEFAULT_TASKS_CSV).trim(), DEFAULT_TASKS_CSV);
            const tasksInput = document.getElementById('bdm-tasks-csv');
            if (tasksInput) tasksInput.value = tasksCsv;
            const batchNoFilter = _normalizeBatchFilterText(String(document.getElementById('bdm-batch-filter')?.value || '').trim());
            const batchFilterInput = document.getElementById('bdm-batch-filter');
            if (batchFilterInput) batchFilterInput.value = batchNoFilter;
            const maxTasks = _readIntInput('bdm-max-tasks', { min: 0, max: 500000, fallback: 0 });
            const parallelWorkers = _readIntInput('bdm-workers', { min: 1, max: 64, fallback: 1 });
            const archiveCompleted = !!document.getElementById('bdm-archive-completed')?.checked;
            const archiveTasksCsv = _normalizeArchiveCsvPath(String(document.getElementById('bdm-archive-csv')?.value || DEFAULT_ARCHIVE_TASKS_CSV).trim(), DEFAULT_ARCHIVE_TASKS_CSV);
            const archiveInput = document.getElementById('bdm-archive-csv');
            if (archiveInput) archiveInput.value = archiveTasksCsv;
            const aiSystemPrompt = String(document.getElementById('bdm-ai-system-prompt')?.value || '').trim();
            const aiUserPrompt = String(document.getElementById('bdm-ai-user-prompt')?.value || '').trim();
            return {
                tasks_csv: tasksCsv,
                results_csv: 'data/批量回测结果.csv',
                summary_csv: 'data/策略汇总评分.csv',
                batch_no_filter: batchNoFilter,
                archive_completed: archiveCompleted,
                archive_tasks_csv: archiveTasksCsv,
                max_tasks: maxTasks,
                parallel_workers: parallelWorkers,
                base_url: 'http://127.0.0.1:8000',
                base_urls: '',
                rate_limit_interval_seconds: 0,
                poll_seconds: 3,
                status_log_seconds: 90,
                max_wait_seconds: 7200,
                retry_sleep_seconds: 3,
                ai_analyze: false,
                ai_analyze_only: false,
                ai_analysis_system_prompt: aiSystemPrompt,
                ai_analysis_prompt: aiUserPrompt,
                ai_analysis_output_md: 'data/批量回测AI分析.md'
            };
        }

        function _renderBatchRunStatusForDashboard(data) {
            const running = !!data?.running;
            const p = data?.progress || {};
            const total = Number(p.total || 0);
            const done = Number(p.success || 0) + Number(p.failed || 0);
            const pct = total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : 0;
            const bar = document.getElementById('bdm-run-progress-bar');
            if (bar) bar.style.width = `${pct.toFixed(1)}%`;
            const progressText = document.getElementById('bdm-run-progress-text');
            if (progressText) progressText.innerText = `进度 ${pct.toFixed(1)}% | total ${total} | pending ${Number(p.pending || 0)} | running ${Number(p.running || 0)} | success ${Number(p.success || 0)} | failed ${Number(p.failed || 0)}`;
            const statusEl = document.getElementById('bdm-run-status');
            if (statusEl) {
                if (running) statusEl.innerText = `运行中 pid=${data?.pid || '--'}`;
                else if (Number.isFinite(Number(data?.returncode)) && Number(data?.returncode) === 0) statusEl.innerText = '已完成 exit=0';
                else if (Number.isFinite(Number(data?.returncode))) statusEl.innerText = `已结束 exit=${Number(data.returncode)}`;
                else statusEl.innerText = '未启动';
            }
            const startBtn = document.getElementById('bdm-start-btn');
            const aiBtn = document.getElementById('bdm-ai-analyze-btn');
            const stopBtn = document.getElementById('bdm-stop-btn');
            if (startBtn) startBtn.disabled = running;
            if (aiBtn) aiBtn.disabled = running;
            if (stopBtn) stopBtn.disabled = !running;
            const logEl = document.getElementById('bdm-run-log-tail');
            const logs = Array.isArray(data?.log_tail) ? data.log_tail : [];
            if (logEl) logEl.innerText = logs.length ? logs.join('\n') : '--';
        }

        async function refreshBatchRunStatusForDashboard() {
            try {
                const payload = _collectBatchRunPayloadFromDashboard();
                const params = new URLSearchParams({
                    tasks_csv: payload.tasks_csv,
                    batch_no_filter: payload.batch_no_filter || '',
                    log_limit: '120'
                });
                const res = await fetch(`/api/batch/run/status?${params.toString()}`);
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    throw new Error(data.msg || '状态读取失败');
                }
                _renderBatchRunStatusForDashboard(data);
                if (data.running) {
                    if (batchRunPollTimer) clearTimeout(batchRunPollTimer);
                    batchRunPollTimer = setTimeout(refreshBatchRunStatusForDashboard, 2500);
                } else {
                    loadBatchTaskPreview();
                }
            } catch (e) {
                const statusEl = document.getElementById('bdm-run-status');
                if (statusEl) statusEl.innerText = `状态失败: ${e}`;
            }
        }

        async function startBatchRunFromDashboard() {
            if (batchStartPendingDashboard) return;
            const statusEl = document.getElementById('bdm-run-status');
            const startBtn = document.getElementById('bdm-start-btn');
            const aiBtn = document.getElementById('bdm-ai-analyze-btn');
            const stopBtn = document.getElementById('bdm-stop-btn');
            batchStartPendingDashboard = true;
            if (startBtn) startBtn.disabled = true;
            if (aiBtn) aiBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = false;
            if (statusEl) statusEl.innerText = '提交启动中...';
            try {
                await loadBatchTaskPreview();
                const payload = _collectBatchRunPayloadFromDashboard();
                const res = await fetch('/api/batch/run/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    throw new Error(data.msg || '启动失败');
                }
                if (statusEl) statusEl.innerText = `已启动 pid=${data.pid || '--'}`;
                refreshBatchRunStatusForDashboard();
            } catch (e) {
                if (statusEl) statusEl.innerText = `启动失败: ${e}`;
                if (startBtn) startBtn.disabled = false;
                if (aiBtn) aiBtn.disabled = false;
            } finally {
                batchStartPendingDashboard = false;
            }
        }

        async function startBatchAiAnalyzeFromDashboard() {
            if (batchStartPendingDashboard) return;
            const statusEl = document.getElementById('bdm-run-status');
            const startBtn = document.getElementById('bdm-start-btn');
            const aiBtn = document.getElementById('bdm-ai-analyze-btn');
            const stopBtn = document.getElementById('bdm-stop-btn');
            batchStartPendingDashboard = true;
            if (startBtn) startBtn.disabled = true;
            if (aiBtn) aiBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = false;
            if (statusEl) statusEl.innerText = '提交AI分析中...';
            try {
                const payload = _collectBatchRunPayloadFromDashboard();
                payload.ai_analyze_only = true;
                payload.ai_analyze = true;
                const res = await fetch('/api/batch/run/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    throw new Error(data.msg || 'AI分析启动失败');
                }
                if (statusEl) statusEl.innerText = `AI分析已启动 pid=${data.pid || '--'}`;
                refreshBatchRunStatusForDashboard();
            } catch (e) {
                if (statusEl) statusEl.innerText = `AI分析启动失败: ${e}`;
                if (startBtn) startBtn.disabled = false;
                if (aiBtn) aiBtn.disabled = false;
            } finally {
                batchStartPendingDashboard = false;
            }
        }

        async function stopBatchRunFromDashboard() {
            const statusEl = document.getElementById('bdm-run-status');
            if (statusEl) statusEl.innerText = '停止中...';
            try {
                const res = await fetch('/api/batch/run/stop', { method: 'POST' });
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    throw new Error(data.msg || '停止失败');
                }
                if (statusEl) statusEl.innerText = data.msg || '已停止';
                if (batchRunPollTimer) {
                    clearTimeout(batchRunPollTimer);
                    batchRunPollTimer = null;
                }
                refreshBatchRunStatusForDashboard();
            } catch (e) {
                if (statusEl) statusEl.innerText = `停止失败: ${e}`;
            }
        }

        function _collectBatchRunPayload() {
            const tasksCsv = _normalizeTaskCsvPath(String(document.getElementById('batch-run-tasks-csv')?.value || document.getElementById('blk-tasks-csv')?.value || DEFAULT_TASKS_CSV).trim(), DEFAULT_TASKS_CSV);
            const tasksInput = document.getElementById('batch-run-tasks-csv') || document.getElementById('blk-tasks-csv');
            if (tasksInput) tasksInput.value = tasksCsv;
            const batchNoFilter = _normalizeBatchFilterText(String(document.getElementById('batch-run-batch-filter')?.value || '').trim());
            const batchFilterInput = document.getElementById('batch-run-batch-filter');
            if (batchFilterInput) batchFilterInput.value = batchNoFilter;
            const maxTasks = _readIntInput('batch-run-max-tasks', { min: 0, max: 500000, fallback: 0 });
            const parallelWorkers = _readIntInput('batch-run-workers', { min: 1, max: 64, fallback: 1 });
            const archiveCompleted = !!document.getElementById('batch-run-archive-completed')?.checked;
            const archiveTasksCsv = DEFAULT_ARCHIVE_TASKS_CSV;
            const aiSystemPrompt = String(document.getElementById('batch-ai-system-prompt')?.value || '').trim();
            const aiUserPrompt = String(document.getElementById('batch-ai-user-prompt')?.value || '').trim();
            const strategyScopeMode = String(document.getElementById('batch-strategy-scope-mode')?.value || 'selected').trim();
            const comboStrategyIds = _resolveBatchStrategyIdsForScope();
            const combinationConfig = _readBatchCombinationConfigFromUi();
            return {
                tasks_csv: tasksCsv,
                results_csv: 'data/批量回测结果.csv',
                summary_csv: 'data/策略汇总评分.csv',
                batch_no_filter: batchNoFilter,
                archive_completed: archiveCompleted,
                archive_tasks_csv: archiveTasksCsv,
                max_tasks: maxTasks,
                parallel_workers: parallelWorkers,
                base_url: 'http://127.0.0.1:8000',
                base_urls: '',
                rate_limit_interval_seconds: 0,
                poll_seconds: 3,
                status_log_seconds: 90,
                max_wait_seconds: 7200,
                retry_sleep_seconds: 3,
                ai_analyze: false,
                ai_analyze_only: false,
                ai_analysis_system_prompt: aiSystemPrompt,
                ai_analysis_prompt: aiUserPrompt,
                ai_analysis_output_md: 'data/批量回测AI分析.md',
                strategy_scope_mode: strategyScopeMode,
                strategy_ids: comboStrategyIds,
                combination_config: combinationConfig
            };
        }

        function _setBatchRunStatusText(text, level = 'info') {
            const el = document.getElementById('batch-run-status');
            if (!el) return;
            el.innerText = String(text || '');
            el.className = `text-[11px] font-mono ${level === 'error' ? 'text-rose-300' : (level === 'success' ? 'text-emerald-300' : 'text-slate-400')}`;
        }

        function _renderBatchRunStatus(data) {
            batchRunStatusPayload = data || {};
            const running = !!data?.running;
            const p = data?.progress || {};
            const total = Number(p.total || 0);
            const done = Number(p.success || 0) + Number(p.failed || 0);
            const pct = total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : 0;
            const bar = document.getElementById('batch-run-progress-bar');
            if (bar) bar.style.width = `${pct.toFixed(1)}%`;
            const progressText = document.getElementById('batch-run-progress-text');
            if (progressText) {
                progressText.innerText = `进度 ${pct.toFixed(1)}% | total ${total} | pending ${Number(p.pending || 0)} | running ${Number(p.running || 0)} | success ${Number(p.success || 0)} | failed ${Number(p.failed || 0)}`;
            }
            if (running) {
                _setBatchRunStatusText(`运行中 pid=${data?.pid || '--'}`, 'success');
            } else if (Number.isFinite(Number(data?.returncode)) && Number(data?.returncode) !== 0) {
                _setBatchRunStatusText(`已结束 exit=${Number(data.returncode)}`, 'error');
            } else if (Number.isFinite(Number(data?.returncode)) && Number(data?.returncode) === 0) {
                _setBatchRunStatusText('已完成 exit=0', 'success');
            } else {
                _setBatchRunStatusText('未启动', 'info');
            }
            const startBtn = document.getElementById('batch-run-start-btn');
            const aiBtn = document.getElementById('batch-ai-analyze-btn');
            const stopBtn = document.getElementById('batch-run-stop-btn');
            if (startBtn) startBtn.disabled = running;
            if (aiBtn) aiBtn.disabled = running;
            if (stopBtn) stopBtn.disabled = !running;
            const logEl = document.getElementById('batch-run-log-tail');
            const logs = Array.isArray(data?.log_tail) ? data.log_tail : [];
            if (logEl) logEl.innerText = logs.length ? logs.join('\n') : '--';
        }

        function _scheduleBatchRunStatusPoll() {
            if (batchRunPollTimer) clearTimeout(batchRunPollTimer);
            batchRunPollTimer = setTimeout(refreshBatchRunStatus, 2500);
        }

        async function refreshBatchRunStatus() {
            try {
                const payload = _collectBatchRunPayload();
                const params = new URLSearchParams({
                    tasks_csv: payload.tasks_csv,
                    batch_no_filter: payload.batch_no_filter || '',
                    log_limit: '120'
                });
                const res = await fetch(`/api/batch/run/status?${params.toString()}`);
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    throw new Error(data.msg || '状态读取失败');
                }
                _renderBatchRunStatus(data);
                if (data.running) {
                    _scheduleBatchRunStatusPoll();
                } else {
                    loadBatchOverview();
                }
            } catch (e) {
                _setBatchRunStatusText(`状态失败: ${e}`, 'error');
            }
        }

        async function startBatchRunFromUi() {
            if (batchStartPendingUi) return;
            const startBtn = document.getElementById('batch-run-start-btn');
            const aiBtn = document.getElementById('batch-ai-analyze-btn');
            const stopBtn = document.getElementById('batch-run-stop-btn');
            batchStartPendingUi = true;
            if (startBtn) startBtn.disabled = true;
            if (aiBtn) aiBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = false;
            _setBatchRunStatusText('提交启动中...');
            try {
                const payload = _collectBatchRunPayload();
                const res = await fetch('/api/batch/run/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    throw new Error(data.msg || '启动失败');
                }
                _setBatchRunStatusText(`已启动 pid=${data.pid || '--'}`, 'success');
                logMessage('SYSTEM', `批量执行已启动 pid=${data.pid || '--'}`, 'warning');
                refreshBatchRunStatus();
            } catch (e) {
                _setBatchRunStatusText(`启动失败: ${e}`, 'error');
                if (startBtn) startBtn.disabled = false;
                if (aiBtn) aiBtn.disabled = false;
            } finally {
                batchStartPendingUi = false;
            }
        }

        async function startBatchAiAnalyzeFromUi() {
            if (batchStartPendingUi) return;
            const startBtn = document.getElementById('batch-run-start-btn');
            const aiBtn = document.getElementById('batch-ai-analyze-btn');
            const stopBtn = document.getElementById('batch-run-stop-btn');
            batchStartPendingUi = true;
            if (startBtn) startBtn.disabled = true;
            if (aiBtn) aiBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = false;
            _setBatchRunStatusText('提交AI分析中...');
            try {
                const payload = _collectBatchRunPayload();
                payload.ai_analyze_only = true;
                payload.ai_analyze = true;
                const res = await fetch('/api/batch/run/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    throw new Error(data.msg || 'AI分析启动失败');
                }
                _setBatchRunStatusText(`AI分析已启动 pid=${data.pid || '--'}`, 'success');
                logMessage('SYSTEM', `批量AI分析已启动 pid=${data.pid || '--'}`, 'warning');
                refreshBatchRunStatus();
            } catch (e) {
                _setBatchRunStatusText(`AI分析启动失败: ${e}`, 'error');
                if (startBtn) startBtn.disabled = false;
                if (aiBtn) aiBtn.disabled = false;
            } finally {
                batchStartPendingUi = false;
            }
        }

        async function stopBatchRunFromUi() {
            _setBatchRunStatusText('停止中...');
            try {
                const res = await fetch('/api/batch/run/stop', { method: 'POST' });
                const data = await res.json();
                if (!res.ok || String(data.status || '').toLowerCase() !== 'success') {
                    throw new Error(data.msg || '停止失败');
                }
                _setBatchRunStatusText(data.msg || '已停止', 'success');
                logMessage('SYSTEM', data.msg || '批量执行已停止', 'warning');
                if (batchRunPollTimer) {
                    clearTimeout(batchRunPollTimer);
                    batchRunPollTimer = null;
                }
                refreshBatchRunStatus();
            } catch (e) {
                _setBatchRunStatusText(`停止失败: ${e}`, 'error');
            }
        }

        function renderBatchOverview() {
            const payload = batchOverviewPayload || {};
            const chips = document.getElementById('batch-overview-chips');
            const batchWrap = document.getElementById('batch-overview-batches');
            const stratWrap = document.getElementById('batch-overview-strategies');
            if (!chips || !batchWrap || !stratWrap) return;
            const statusMap = payload.task_status && typeof payload.task_status === 'object' ? payload.task_status : {};
            const total = Number(payload?.meta?.task_count || 0);
            const pending = Number(statusMap.pending || 0);
            const running = Number(statusMap.running || 0);
            const retry = Number(statusMap.retry || 0);
            const success = Number(statusMap.success || 0);
            const failed = Number(statusMap.failed || 0);
            chips.innerHTML = `
                <span class="px-2 py-1 rounded border border-slate-600 text-slate-200 bg-slate-900">任务总数 ${total}</span>
                <span class="px-2 py-1 rounded border border-amber-600 text-amber-300 bg-amber-900/20">待执行 ${pending + retry}</span>
                <span class="px-2 py-1 rounded border border-cyan-600 text-cyan-300 bg-cyan-900/20">运行中 ${running}</span>
                <span class="px-2 py-1 rounded border border-emerald-600 text-emerald-300 bg-emerald-900/20">成功 ${success}</span>
                <span class="px-2 py-1 rounded border border-rose-600 text-rose-300 bg-rose-900/20">失败 ${failed}</span>
            `;
            const batches = Array.isArray(payload.batch_stats) ? payload.batch_stats : [];
            batchWrap.innerHTML = '';
            if (!batches.length) {
                batchWrap.innerHTML = '<div class="text-[11px] text-slate-500">暂无批次数据</div>';
            } else {
                batches.forEach(item => {
                    const totalCount = Math.max(1, Number(item.total || 0));
                    const doneCount = Number(item.success || 0) + Number(item.failed || 0);
                    const donePct = Math.max(0, Math.min(100, (doneCount / totalCount) * 100));
                    const row = document.createElement('div');
                    row.className = 'bg-slate-900 border border-slate-700 rounded px-2 py-1.5';
                    row.innerHTML = `
                        <div class="flex items-center justify-between text-[11px] mb-1">
                            <span class="text-white font-semibold">${item.batch_no || 'GEN'}</span>
                            <span class="text-slate-400">${doneCount}/${totalCount}</span>
                        </div>
                        <div class="w-full h-1.5 bg-slate-800 rounded overflow-hidden">
                            <div class="h-full bg-emerald-500" style="width:${donePct.toFixed(1)}%"></div>
                        </div>
                        <div class="mt-1 text-[10px] text-slate-400">pending ${Number(item.pending || 0)} | running ${Number(item.running || 0)} | success ${Number(item.success || 0)} | failed ${Number(item.failed || 0)}</div>
                    `;
                    batchWrap.appendChild(row);
                });
            }
            const topStrategies = (Array.isArray(payload.strategy_board) ? payload.strategy_board : []).slice(0, 10);
            stratWrap.innerHTML = '';
            if (!topStrategies.length) {
                stratWrap.innerHTML = '<div class="text-[11px] text-slate-500">暂无策略汇总</div>';
            } else {
                topStrategies.forEach((s, idx) => {
                    const row = document.createElement('div');
                    row.className = 'bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-[11px]';
                    row.innerHTML = `
                        <div class="flex items-center justify-between">
                            <span class="text-white">#${idx + 1} ${s.strategy_id || '--'}</span>
                            <span class="text-cyan-300">score ${_fmtNum(s.median_score_final, 2)}</span>
                        </div>
                        <div class="text-slate-400">年化 ${_fmtPct(s.median_annualized_return, 2)} | 回撤 ${_fmtPct(s.median_max_drawdown, 2)} | 胜率 ${_fmtPct(s.median_win_rate, 1)}</div>
                    `;
                    stratWrap.appendChild(row);
                });
            }
            renderBatchOverviewDetailTable();
        }

        function renderBatchOverviewDetailTable() {
            const body = document.getElementById('batch-overview-table-body');
            if (!body) return;
            const payload = batchOverviewPayload || {};
            const q = String(document.getElementById('batch-overview-filter')?.value || '').trim().toLowerCase();
            const rows = Array.isArray(payload.recent_results) ? payload.recent_results : [];
            const filtered = q
                ? rows.filter(r => {
                    const text = `${r.task_id || ''}|${r.batch_no || ''}|${r.stock_code || ''}|${r.strategy_id || ''}|${r.report_id || ''}`.toLowerCase();
                    return text.includes(q);
                })
                : rows;
            body.innerHTML = '';
            if (!filtered.length) {
                body.innerHTML = '<tr><td colspan="9" class="px-2 py-3 text-center text-slate-500">暂无数据</td></tr>';
                return;
            }
            filtered.slice(0, 300).forEach(r => {
                const annualCls = Number(r.annualized_return || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300';
                const scoreCls = Number(r.score_final || 0) >= 70 ? 'text-emerald-300' : (Number(r.score_final || 0) >= 50 ? 'text-amber-300' : 'text-rose-300');
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-800/60';
                tr.innerHTML = `
                    <td class="px-2 py-1 text-slate-300">${r.task_id || '--'}</td>
                    <td class="px-2 py-1 text-slate-300">${r.batch_no || '--'}</td>
                    <td class="px-2 py-1 text-cyan-300">${r.stock_code || '--'}</td>
                    <td class="px-2 py-1 text-white">${r.strategy_id || '--'}</td>
                    <td class="px-2 py-1 ${annualCls}">${_fmtPct(r.annualized_return, 2)}</td>
                    <td class="px-2 py-1 text-rose-300">${_fmtPct(r.max_drawdown, 2)}</td>
                    <td class="px-2 py-1 text-slate-200">${_fmtPct(r.win_rate, 1)}</td>
                    <td class="px-2 py-1 ${scoreCls}">${_fmtNum(r.score_final, 2)}</td>
                    <td class="px-2 py-1 text-slate-400">${r.report_id || '--'}</td>
                `;
                body.appendChild(tr);
            });
        }

        function buildBacktestCombinationConfig() {
            const mode = String(document.getElementById('bt-combo-mode')?.value || 'or').trim().toLowerCase() || 'or';
            const minAgreeRaw = Number(document.getElementById('bt-combo-min-agree')?.value || 1);
            const minAgree = Number.isFinite(minAgreeRaw) && minAgreeRaw >= 1 ? Math.floor(minAgreeRaw) : 1;
            const tiePolicy = String(document.getElementById('bt-combo-tie-policy')?.value || 'skip').trim().toLowerCase() || 'skip';
            const weightsText = String(document.getElementById('bt-combo-weights')?.value || '').trim();
            const weights = {};
            if (weightsText) {
                weightsText.split(',').forEach(pair => {
                    const p = String(pair || '').trim();
                    if (!p || !p.includes('=')) return;
                    const [sidRaw, wRaw] = p.split('=');
                    const sid = String(sidRaw || '').trim();
                    const w = Number(String(wRaw || '').trim());
                    if (!sid || !Number.isFinite(w)) return;
                    weights[sid] = w;
                });
            }
            return {
                enabled: true,
                mode,
                min_agree_count: minAgree,
                tie_policy: tiePolicy,
                weights
            };
        }

        function toggleLiveParamsDrawer(forceOpen = null) {
            const drawer = document.getElementById('live-params-drawer');
            if (!drawer) return;
            syncRuntimeParamsUI();
            const opening = forceOpen === null ? drawer.classList.contains('pointer-events-none') : !!forceOpen;
            if (opening) {
                drawer.classList.remove('translate-x-[110%]', 'opacity-0', 'pointer-events-none');
                drawer.classList.add('translate-x-0', 'opacity-100');
            } else {
                drawer.classList.remove('translate-x-0', 'opacity-100');
                drawer.classList.add('translate-x-[110%]', 'opacity-0', 'pointer-events-none');
            }
        }

        function updateWebhookRetryStatus(text) {
            const el = document.getElementById('webhook-retry-status');
            if (el) el.innerText = text;
        }

        function formatWebhookErrorText(text) {
            const s = String(text || '').trim();
            if (!s) return '--';
            return s.length > 64 ? `${s.slice(0, 64)}...` : s;
        }

        function renderWebhookFailedTable() {
            const body = document.getElementById('webhook-failed-tbody');
            if (!body) return;
            if (!Array.isArray(webhookFailedEvents) || !webhookFailedEvents.length) {
                body.innerHTML = '<tr><td colspan="8" class="px-3 py-4 text-center text-slate-500">当前没有失败推送记录</td></tr>';
                updateWebhookRetryStatus('失败队列为空');
                return;
            }
            const esc = (txt) => String(txt || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
            body.innerHTML = webhookFailedEvents.map(item => {
                const id = String(item.event_id || '');
                const checked = webhookFailedSelectedIds.has(id) ? 'checked' : '';
                const createdAt = esc(item.created_at || '--');
                const eventType = esc(item.event_type || '--');
                const stockCode = esc(item.stock_code || '--');
                const channel = esc(item.channel_type || '--');
                const retries = Number(item.retries || 0);
                const err = esc(formatWebhookErrorText(item.last_error || '--'));
                return `
                    <tr>
                        <td class="px-2 py-2"><input type="checkbox" ${checked} onchange="toggleWebhookEventSelection('${id}', this.checked)" /></td>
                        <td class="px-2 py-2 text-slate-300">${createdAt}</td>
                        <td class="px-2 py-2 text-amber-300 font-mono">${eventType}</td>
                        <td class="px-2 py-2 text-cyan-300 font-mono">${stockCode}</td>
                        <td class="px-2 py-2 text-slate-300">${channel}</td>
                        <td class="px-2 py-2 text-slate-200 font-mono">${retries}</td>
                        <td class="px-2 py-2 text-rose-300" title="${esc(item.last_error || '--')}">${err}</td>
                        <td class="px-2 py-2">
                            <button onclick="retryOneWebhookEvent('${id}')" class="bg-emerald-700 hover:bg-emerald-600 text-white px-2 py-1 rounded text-[11px] border border-emerald-500">重推</button>
                        </td>
                    </tr>
                `;
            }).join('');
            updateWebhookRetryStatus(`失败队列 ${webhookFailedEvents.length} 条，已勾选 ${webhookFailedSelectedIds.size} 条`);
        }

        function toggleWebhookEventSelection(eventId, checked) {
            const id = String(eventId || '');
            if (!id) return;
            if (checked) webhookFailedSelectedIds.add(id);
            else webhookFailedSelectedIds.delete(id);
            renderWebhookFailedTable();
        }

        function toggleWebhookFailedSelectAll(checked) {
            webhookFailedSelectedIds.clear();
            if (checked) {
                (webhookFailedEvents || []).forEach(item => {
                    const id = String(item.event_id || '');
                    if (id) webhookFailedSelectedIds.add(id);
                });
            }
            renderWebhookFailedTable();
        }

        async function reloadWebhookFailedEvents() {
            updateWebhookRetryStatus('加载失败队列中...');
            try {
                const res = await fetch('/api/webhook/failed?limit=200');
                const data = await res.json();
                if (!res.ok || data.status !== 'success') throw new Error(data.msg || '加载失败');
                webhookFailedEvents = Array.isArray(data.events) ? data.events : [];
                const available = new Set(webhookFailedEvents.map(x => String(x.event_id || '')));
                webhookFailedSelectedIds = new Set(Array.from(webhookFailedSelectedIds).filter(x => available.has(x)));
                renderWebhookFailedTable();
            } catch (e) {
                updateWebhookRetryStatus(`加载失败: ${e}`);
                logMessage('SYSTEM', `读取失败推送队列失败: ${e}`, 'danger');
            }
        }

        async function retryOneWebhookEvent(eventId) {
            const id = String(eventId || '').trim();
            if (!id) return;
            try {
                updateWebhookRetryStatus('正在重推选中事件...');
                const res = await fetch('/api/webhook/failed/retry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event_ids: [id], limit: 1 })
                });
                const data = await res.json();
                if (!res.ok || data.status !== 'success') throw new Error(data.msg || '重推失败');
                webhookFailedEvents = Array.isArray(data.events) ? data.events : [];
                webhookFailedSelectedIds.delete(id);
                renderWebhookFailedTable();
                const result = data.result || {};
                logMessage('SYSTEM', `重推完成：成功${Number(result.success || 0)}，失败${Number(result.failed || 0)}`, Number(result.failed || 0) > 0 ? 'warning' : 'success');
            } catch (e) {
                updateWebhookRetryStatus(`重推失败: ${e}`);
                logMessage('SYSTEM', `重推失败: ${e}`, 'danger');
            }
        }

        async function retrySelectedWebhookEvents() {
            const ids = Array.from(webhookFailedSelectedIds);
            if (!ids.length) {
                logMessage('SYSTEM', '请先勾选要重推的失败记录', 'warning');
                return;
            }
            try {
                updateWebhookRetryStatus('正在重推选中记录...');
                const res = await fetch('/api/webhook/failed/retry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event_ids: ids, limit: ids.length })
                });
                const data = await res.json();
                if (!res.ok || data.status !== 'success') throw new Error(data.msg || '重推失败');
                webhookFailedEvents = Array.isArray(data.events) ? data.events : [];
                webhookFailedSelectedIds.clear();
                renderWebhookFailedTable();
                const result = data.result || {};
                logMessage('SYSTEM', `批量重推完成：重推${Number(result.retried || 0)}条，成功${Number(result.success || 0)}条，失败${Number(result.failed || 0)}条`, Number(result.failed || 0) > 0 ? 'warning' : 'success');
            } catch (e) {
                updateWebhookRetryStatus(`重推失败: ${e}`);
                logMessage('SYSTEM', `批量重推失败: ${e}`, 'danger');
            }
        }

        async function retryAllWebhookEvents() {
            try {
                updateWebhookRetryStatus('正在重推前20条失败记录...');
                const res = await fetch('/api/webhook/failed/retry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ limit: 20 })
                });
                const data = await res.json();
                if (!res.ok || data.status !== 'success') throw new Error(data.msg || '重推失败');
                webhookFailedEvents = Array.isArray(data.events) ? data.events : [];
                webhookFailedSelectedIds.clear();
                renderWebhookFailedTable();
                const result = data.result || {};
                logMessage('SYSTEM', `自动重推完成：重推${Number(result.retried || 0)}条，成功${Number(result.success || 0)}条，失败${Number(result.failed || 0)}条`, Number(result.failed || 0) > 0 ? 'warning' : 'success');
            } catch (e) {
                updateWebhookRetryStatus(`重推失败: ${e}`);
                logMessage('SYSTEM', `自动重推失败: ${e}`, 'danger');
            }
        }

        async function repushLatestDailySummary() {
            try {
                updateWebhookRetryStatus('正在手动重复推送最近日终汇总...');
                const res = await fetch('/api/webhook/daily_summary/repush', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });
                const data = await res.json();
                if (!res.ok || data.status !== 'success') throw new Error(data.msg || '重复推送失败');
                const dayText = String(data.date || '--');
                const stockCount = Number(data.stock_count || 0);
                updateWebhookRetryStatus(`已完成手动重复推送：${dayText}（${stockCount}只标的）`);
                logMessage('SYSTEM', `日终汇总已手动重复推送：${dayText}（${stockCount}只标的）`, 'success');
            } catch (e) {
                updateWebhookRetryStatus(`重复推送失败: ${e}`);
                logMessage('SYSTEM', `手动重复推送日终汇总失败: ${e}`, 'danger');
            }
        }

        async function clearSelectedWebhookEvents() {
            const ids = Array.from(webhookFailedSelectedIds);
            if (!ids.length) {
                logMessage('SYSTEM', '请先勾选要清理的失败记录', 'warning');
                return;
            }
            try {
                const res = await fetch('/api/webhook/failed/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event_ids: ids })
                });
                const data = await res.json();
                if (!res.ok || data.status !== 'success') throw new Error(data.msg || '清理失败');
                webhookFailedEvents = Array.isArray(data.events) ? data.events : [];
                webhookFailedSelectedIds.clear();
                renderWebhookFailedTable();
                logMessage('SYSTEM', `已清理失败记录 ${Number((data.result || {}).deleted_count || 0)} 条`, 'warning');
            } catch (e) {
                updateWebhookRetryStatus(`清理失败: ${e}`);
                logMessage('SYSTEM', `清理失败记录失败: ${e}`, 'danger');
            }
        }

        async function clearAllWebhookEvents() {
            try {
                const res = await fetch('/api/webhook/failed/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });
                const data = await res.json();
                if (!res.ok || data.status !== 'success') throw new Error(data.msg || '清空失败');
                webhookFailedEvents = [];
                webhookFailedSelectedIds.clear();
                renderWebhookFailedTable();
                logMessage('SYSTEM', `失败队列已清空 ${Number((data.result || {}).deleted_count || 0)} 条`, 'warning');
            } catch (e) {
                updateWebhookRetryStatus(`清空失败: ${e}`);
                logMessage('SYSTEM', `清空失败队列失败: ${e}`, 'danger');
            }
        }

        function openWebhookRetryCenter() {
            if (!liveEnabled) {
                logMessage('SYSTEM', '当前为回测模式，推送补偿仅在实盘模式可用', 'warning');
                return;
            }
            const modal = document.getElementById('webhook-retry-modal');
            if (modal) modal.classList.remove('hidden');
            reloadWebhookFailedEvents();
        }

        function closeWebhookRetryCenter() {
            const modal = document.getElementById('webhook-retry-modal');
            if (modal) modal.classList.add('hidden');
        }

        async function loadConfigCenter() {
            const status = document.getElementById('config-save-status');
            try {
                if (status) status.innerText = '加载中...理财有风险，投资需谨慎';
                const res = await fetch('/api/config');
                const data = await res.json();
                if (data.status !== 'success') throw new Error(data.msg || '读取配置失败');
                if (Array.isArray(data.webhook_category_options) && data.webhook_category_options.length) {
                    webhookCategoryOptions = data.webhook_category_options;
                } else {
                    webhookCategoryOptions = WEBHOOK_CATEGORY_OPTIONS_DEFAULT.slice();
                }
                try {
                    const fr = await fetch('/api/fundamental/catalog');
                    const fd = await fr.json();
                    if (fd && fd.status === 'success') {
                        fundamentalInterfaceOptions = normalizeFundamentalInterfaceOptions(fd.catalog || {});
                    } else {
                        fundamentalInterfaceOptions = [];
                    }
                } catch (_) {
                    fundamentalInterfaceOptions = [];
                }
                configDraft = data.config || {};
                renderConfigForm(configDraft);
                await refreshHistorySyncStatus();
                await loadFundamentalCacheList();
                bindConfigRealtimePreview();
                applyConfigToBoards(configDraft);
                if (status) status.innerText = '已加载';
            } catch (e) {
                if (status) status.innerText = `读取失败: ${e}`;
            }
        }

        async function saveConfigCenter() {
            const status = document.getElementById('config-save-status');
            try {
                if (status) status.innerText = '保存中...';
                const parsed = collectConfigFromForm();
                const res = await fetch('/api/config/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ config: parsed })
                });
                const data = await res.json();
                if (data.status !== 'success') throw new Error(data.msg || '保存失败');
                configDraft = parsed;
                applyConfigToBoards(configDraft);
                const savedMode = String(data.mode || getByPath(configDraft, 'system.mode', 'backtest'));
                const liveReady = data.live_enabled === true;
                if (status) status.innerText = `保存成功，已生效（模式=${savedMode}，实盘生效=${liveReady ? '是' : '否'}）`;
                await syncStatus();
                logMessage('SYSTEM', `配置保存成功并已生效（模式=${savedMode}，实盘生效=${liveReady ? '是' : '否'}）`, 'success');
            } catch (e) {
                if (status) status.innerText = `保存失败: ${e}`;
            }
        }

        async function testTushareConnectivity() {
            const btn = document.getElementById('config-tushare-test-btn');
            const icon = document.getElementById('config-tushare-test-icon');
            const label = document.getElementById('config-tushare-test-label');
            const status = document.getElementById('config-tushare-test-status');
            const setStatus = (text, level = 'info') => {
                if (!status) return;
                status.innerText = String(text || '');
                status.className = `text-[10px] ${level === 'ok' ? 'text-emerald-300' : (level === 'error' ? 'text-rose-300' : 'text-slate-400')}`;
            };
            try {
                if (btn) btn.disabled = true;
                if (icon) icon.className = 'fa-solid fa-spinner fa-spin';
                if (label) label.innerText = '连通性校验中...';
                setStatus('正在测试连接，请稍候...', 'info');
                const parsed = collectConfigFromForm();
                const apiUrl = String(getByPath(parsed, 'data_provider.tushare_api_url', '') || '').trim();
                const token = String(getByPath(parsed, 'data_provider.tushare_token', '') || '').trim();
                const targets = Array.isArray(getByPath(parsed, 'targets', [])) ? getByPath(parsed, 'targets', []) : [];
                const stockCode = String((targets[0] || '000001.SZ')).trim().toUpperCase();
                if (!apiUrl) throw new Error('请先填写 Tushare 接口地址');
                const payload = {
                    api_url: apiUrl,
                    stock_code: stockCode || '000001.SZ'
                };
                // Secret fields may be masked in UI; let backend read merged config (private > public).
                if (token && token !== '********') {
                    payload.token = token;
                }
                const res = await fetch('/api/config/test_tushare_connectivity', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok || data.status !== 'success') {
                    throw new Error(data.msg || '连通性校验失败');
                }
                const okMsg = `连通成功：${String(data.stock_code || stockCode)} @ ${String(data.api_url || apiUrl)}`;
                setStatus(okMsg, 'ok');
                logMessage('SYSTEM', okMsg, 'success');
            } catch (e) {
                const errMsg = `连通失败：${String(e)}`;
                setStatus(errMsg, 'error');
                logMessage('SYSTEM', errMsg, 'danger');
            } finally {
                if (btn) btn.disabled = false;
                if (icon) icon.className = 'fa-solid fa-plug-circle-check';
                if (label) label.innerText = '测试Tushare连通性';
            }
        }

        async function testTdxConnectivity() {
            const btn = document.getElementById('config-tdx-test-btn');
            const icon = document.getElementById('config-tdx-test-icon');
            const label = document.getElementById('config-tdx-test-label');
            const status = document.getElementById('config-tdx-test-status');
            const setStatus = (text, level = 'info') => {
                if (!status) return;
                status.innerText = String(text || '');
                status.className = `text-[10px] ${level === 'ok' ? 'text-emerald-300' : (level === 'error' ? 'text-rose-300' : 'text-slate-400')}`;
            };
            try {
                if (btn) btn.disabled = true;
                if (icon) icon.className = 'fa-solid fa-spinner fa-spin';
                if (label) label.innerText = '探测并校验中...';
                setStatus('正在自动探测 TDX 目录并校验连通性...', 'info');
                const parsed = collectConfigFromForm();
                const tdxdir = String(getByPath(parsed, 'data_provider.tdxdir', '') || '').trim();
                const targets = Array.isArray(getByPath(parsed, 'targets', [])) ? getByPath(parsed, 'targets', []) : [];
                const stockCode = String((targets[0] || '000001.SZ')).trim().toUpperCase();
                const payload = {
                    tdxdir: tdxdir,
                    stock_code: stockCode || '000001.SZ',
                    auto_detect: true
                };
                const res = await fetch('/api/config/test_tdx_connectivity', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok || data.status !== 'success') {
                    throw new Error(data.msg || 'TDX 连通性校验失败');
                }
                const usedPath = String(data.tdxdir_used || '').trim();
                if (usedPath) {
                    const input = document.querySelector('input[data-path="data_provider.tdxdir"]');
                    if (input) input.value = usedPath;
                }
                const suffix = data.autodetected ? '（已自动探测目录）' : '';
                const okMsg = `连通成功：${String(data.stock_code || stockCode)} @ ${usedPath}${suffix}`;
                setStatus(okMsg, 'ok');
                logMessage('SYSTEM', okMsg, 'success');
            } catch (e) {
                const errMsg = `TDX连通失败：${String(e)}`;
                setStatus(errMsg, 'error');
                logMessage('SYSTEM', errMsg, 'danger');
            } finally {
                if (btn) btn.disabled = false;
                if (icon) icon.className = 'fa-solid fa-magnifying-glass';
                if (label) label.innerText = '自动探测TDX并测试';
            }
        }

        function fundamentalEsc(txt) {
            return String(txt || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function setFundamentalCacheStatus(text, level = 'info') {
            const el = document.getElementById('fund-cache-status');
            if (!el) return;
            el.innerText = String(text || '');
            el.className = `text-[10px] ${level === 'ok' ? 'text-emerald-300' : (level === 'error' ? 'text-rose-300' : 'text-slate-400')}`;
        }

        function renderFundamentalKvBody(bodyId, obj) {
            const body = document.getElementById(bodyId);
            if (!body) return;
            const data = obj && typeof obj === 'object' ? obj : {};
            const entries = Object.entries(data);
            if (!entries.length) {
                body.innerHTML = '<tr><td class="px-2 py-1 text-slate-500">--</td><td class="px-2 py-1 text-slate-500">--</td></tr>';
                return;
            }
            body.innerHTML = entries.map(([k, v]) => `
                <tr class="border-b border-slate-800">
                    <td class="px-2 py-1 text-slate-400 w-32">${fundamentalEsc(k)}</td>
                    <td class="px-2 py-1 text-slate-200 break-all">${fundamentalEsc(v === null || v === undefined || v === '' ? '--' : String(v))}</td>
                </tr>
            `).join('');
        }

        function showFundamentalModuleDetail(interfaceKey) {
            const key = String(interfaceKey || '').trim();
            if (!key) return;
            const payload = fundamentalDetailPayload && typeof fundamentalDetailPayload === 'object' ? fundamentalDetailPayload : {};
            const modules = payload.modules && typeof payload.modules === 'object' ? payload.modules : {};
            const detail = modules[key] && typeof modules[key] === 'object' ? modules[key] : {};
            const records = Array.isArray(detail.records) ? detail.records : [];

            const titleEl = document.getElementById('fund-module-detail-title');
            const metaEl = document.getElementById('fund-module-detail-meta');
            const thead = document.getElementById('fund-module-detail-thead');
            const tbody = document.getElementById('fund-module-detail-tbody');
            if (!thead || !tbody) return;

            fundamentalModuleDetailKey = key;
            if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-table-list mr-2 text-cyan-300"></i>接口明细：${fundamentalEsc(key)}`;
            if (metaEl) metaEl.innerText = `行数=${records.length} | 股票=${String(payload.ts_code || payload.stock_code || '--')} | 时间=${String(payload.fetched_at || '--')}`;

            if (!records.length) {
                thead.innerHTML = '<tr><th class="px-2 py-1 text-left text-slate-400">提示</th></tr>';
                tbody.innerHTML = '<tr><td class="px-2 py-2 text-slate-500">无明细数据（可能行数为0，或接口未返回记录）</td></tr>';
                openFundamentalModuleDetailModal();
                return;
            }

            const colSet = new Set();
            records.forEach((row) => {
                if (row && typeof row === 'object') {
                    Object.keys(row).forEach((k) => colSet.add(String(k)));
                }
            });
            const cols = Array.from(colSet);
            thead.innerHTML = `<tr>${cols.map((c) => `<th class="px-2 py-1 text-left">${fundamentalEsc(c)}</th>`).join('')}</tr>`;
            tbody.innerHTML = records.map((row) => {
                const r = row && typeof row === 'object' ? row : {};
                return `<tr>${cols.map((c) => `<td class="px-2 py-1 break-all">${fundamentalEsc(r[c] === null || r[c] === undefined || r[c] === '' ? '--' : String(r[c]))}</td>`).join('')}</tr>`;
            }).join('');
            openFundamentalModuleDetailModal();
        }

        function renderFundamentalDetailView(payload, readable, sourceLabel = '') {
            const r = readable && typeof readable === 'object' ? readable : {};
            const p = payload && typeof payload === 'object' ? payload : {};
            fundamentalDetailPayload = p;
            const overview = r['概览'] && typeof r['概览'] === 'object' ? r['概览'] : {};
            const company = r['公司画像'] && typeof r['公司画像'] === 'object' ? r['公司画像'] : {};
            const valuation = r['估值指标'] && typeof r['估值指标'] === 'object' ? r['估值指标'] : {};
            const quality = r['财务质量'] && typeof r['财务质量'] === 'object' ? r['财务质量'] : {};
            const modules = Array.isArray(r['接口执行']) ? r['接口执行'] : [];
            const warnings = Array.isArray(r['告警']) ? r['告警'] : [];
            const meta = document.getElementById('fund-detail-meta');
            if (meta) {
                const tsCode = String(p.ts_code || p.stock_code || overview['股票'] || '--');
                const fetchedAt = String(p.fetched_at || overview['抓取时间'] || '--');
                const status = String(p.status || overview['状态'] || '--');
                const source = sourceLabel ? ` | 来源=${sourceLabel}` : '';
                meta.innerText = `股票=${tsCode} | 时间=${fetchedAt} | 状态=${status}${source}`;
            }
            renderFundamentalKvBody('fund-detail-overview-body', overview);
            renderFundamentalKvBody('fund-detail-company-body', company);
            renderFundamentalKvBody('fund-detail-valuation-body', valuation);
            renderFundamentalKvBody('fund-detail-quality-body', quality);

            const modulesBody = document.getElementById('fund-detail-modules-body');
            if (modulesBody) {
                if (!modules.length) {
                    modulesBody.innerHTML = '<tr><td colspan="5" class="px-2 py-2 text-slate-500">--</td></tr>';
                } else {
                    const moduleMap = p.modules && typeof p.modules === 'object' ? p.modules : {};
                    modulesBody.innerHTML = modules.map((m) => {
                        const rawKey = String(m?.interface_key || '').trim();
                        const key = fundamentalEsc(rawKey || '--');
                        const label = fundamentalEsc(m?.interface_label || '--');
                        const status = fundamentalEsc(m?.status || '--');
                        const rows = fundamentalEsc(String(m?.rows ?? '--'));
                        const reason = fundamentalEsc(m?.reason_type || '');
                        const rawErr = fundamentalEsc(m?.raw_error || '');
                        const userErr = fundamentalEsc(m?.error_msg || '--');
                        const err = rawErr || userErr;
                        const reasonTag = reason ? `<span class="text-slate-500">[${reason}]</span> ` : '';
                        const one = moduleMap[rawKey] && typeof moduleMap[rawKey] === 'object' ? moduleMap[rawKey] : {};
                        const recs = Array.isArray(one.records) ? one.records : [];
                        const canOpen = recs.length > 0;
                        const encodedKey = encodeURIComponent(rawKey);
                        const actionBtn = canOpen
                            ? `<button onclick="showFundamentalModuleDetail(decodeURIComponent('${encodedKey}'))" class="bg-cyan-700 hover:bg-cyan-600 text-white px-2 py-0.5 rounded text-[10px] border border-cyan-500">查看${recs.length}行</button>`
                            : '<span class="text-slate-500">--</span>';
                        return `
                            <tr>
                                <td class="px-2 py-1 text-cyan-300">${label}<span class="text-slate-500"> (${key})</span></td>
                                <td class="px-2 py-1 text-slate-200">${status}</td>
                                <td class="px-2 py-1 text-slate-200">${rows}</td>
                                <td class="px-2 py-1 text-rose-300 break-all">${reasonTag}${err}</td>
                                <td class="px-2 py-1 text-slate-200">${actionBtn}</td>
                            </tr>
                        `;
                    }).join('');
                }
            }

            const warningEl = document.getElementById('fund-detail-warnings');
            if (warningEl) {
                if (!warnings.length) {
                    warningEl.className = 'text-[11px] text-slate-400';
                    warningEl.innerText = '--';
                } else {
                    warningEl.className = 'text-[11px] text-amber-300 whitespace-pre-wrap break-all';
                    warningEl.innerText = warnings.map((x, i) => `${i + 1}. ${String(x || '--')}`).join('\n');
                }
            }
        }

        function renderFundamentalCacheTable() {
            const body = document.getElementById('fund-cache-table-body');
            if (!body) return;
            if (!Array.isArray(fundamentalCacheRows) || !fundamentalCacheRows.length) {
                body.innerHTML = '<tr><td colspan="4" class="px-2 py-2 text-slate-500">暂无落盘缓存（请先开启落盘并触发一次拉取）</td></tr>';
                return;
            }
            body.innerHTML = fundamentalCacheRows.map((row) => {
                const fn = fundamentalEsc(row?.file_name || '--');
                const ts = fundamentalEsc(row?.ts_code || row?.stock_code || '--');
                const ctx = fundamentalEsc(row?.context || '--');
                const ft = fundamentalEsc(row?.fetched_at || '--');
                return `
                    <tr class="hover:bg-slate-800/60 cursor-pointer" onclick="openFundamentalCacheFile('${fn}')">
                        <td class="px-2 py-1 text-cyan-300 truncate max-w-[220px]" title="${fn}">${fn}</td>
                        <td class="px-2 py-1 text-amber-300">${ts}</td>
                        <td class="px-2 py-1 text-slate-300">${ctx}</td>
                        <td class="px-2 py-1 text-slate-300">${ft}</td>
                    </tr>
                `;
            }).join('');
        }

        async function loadFundamentalCacheList() {
            const body = document.getElementById('fund-cache-table-body');
            if (!body) return;
            const stock = String(document.getElementById('fund-cache-stock')?.value || '').trim();
            const context = String(document.getElementById('fund-cache-context')?.value || '').trim();
            try {
                setFundamentalCacheStatus('正在读取落盘缓存列表...');
                const q = new URLSearchParams();
                if (stock) q.set('stock_code', stock);
                if (context) q.set('context', context);
                q.set('limit', '80');
                const res = await fetch(`/api/fundamental/cache_list?${q.toString()}`);
                const data = await res.json();
                if (!res.ok || data.status !== 'success') throw new Error(data.msg || '读取失败');
                fundamentalCacheRows = Array.isArray(data.items) ? data.items : [];
                renderFundamentalCacheTable();
                setFundamentalCacheStatus(`已加载 ${fundamentalCacheRows.length} 条缓存，目录：${String(data.cache_dir || '--')}`, 'ok');
            } catch (e) {
                fundamentalCacheRows = [];
                renderFundamentalCacheTable();
                setFundamentalCacheStatus(`读取失败: ${e}`, 'error');
            }
        }

        async function openFundamentalCacheFile(fileName) {
            const name = String(fileName || '').trim();
            if (!name) return;
            try {
                setFundamentalCacheStatus(`正在读取 ${name}...`);
                const q = new URLSearchParams({ file_name: name });
                const res = await fetch(`/api/fundamental/cache_file?${q.toString()}`);
                const data = await res.json();
                if (!res.ok || data.status !== 'success') throw new Error(data.msg || '读取详情失败');
                renderFundamentalDetailView(data.payload || {}, data.readable || {}, name);
                openFundamentalDetailModal();
                setFundamentalCacheStatus(`已打开 ${name}`, 'ok');
            } catch (e) {
                renderFundamentalDetailView({}, {}, '');
                setFundamentalCacheStatus(`读取详情失败: ${e}`, 'error');
            }
        }

        async function fetchAndRefreshFundamentalCache() {
            const stock = String(document.getElementById('fund-cache-stock')?.value || '').trim();
            const context = String(document.getElementById('fund-cache-context')?.value || 'backtest').trim() || 'backtest';
            if (!stock) {
                setFundamentalCacheStatus('请先填写股票代码', 'error');
                return;
            }
            try {
                setFundamentalCacheStatus(`正在拉取 ${stock} (${context})...`);
                const res = await fetch('/api/fundamental/profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        stock_code: stock,
                        context,
                        force: true,
                        allow_network: true
                    })
                });
                const rawText = await res.text();
                let data = null;
                try {
                    data = rawText ? JSON.parse(rawText) : {};
                } catch (_) {
                    throw new Error(`服务端返回非JSON（HTTP ${res.status}）：${String(rawText || '').slice(0, 180)}`);
                }
                if (!res.ok || data.status !== 'success') throw new Error(data.msg || '拉取失败');
                const profile = data.profile || {};
                renderFundamentalDetailView(profile, profile.readable || {}, '实时拉取');
                openFundamentalDetailModal();
                setFundamentalCacheStatus(`拉取完成（status=${String(profile.status || '--')}），正在刷新列表...`, 'ok');
                await loadFundamentalCacheList();
            } catch (e) {
                renderFundamentalDetailView({}, {}, '');
                setFundamentalCacheStatus(`拉取失败: ${e}`, 'error');
            }
        }

        function tryAutoOpenConfigFromQuery() {
            try {
                const params = new URLSearchParams(window.location.search || '');
                const open = String(params.get('open') || '').trim().toLowerCase();
                if (open !== 'config') return;
                openConfigCenter();
                params.delete('open');
                const next = params.toString();
                const base = window.location.pathname || '/';
                const target = next ? `${base}?${next}` : base;
                window.history.replaceState({}, '', target);
            } catch (_) {}
        }

        function openStrategyManager() {
            const modal = document.getElementById('strategy-manager-modal');
            if (modal) modal.classList.remove('hidden');
            loadStrategyManager();
        }

        function closeStrategyManager() {
            const modal = document.getElementById('strategy-manager-modal');
            if (modal) modal.classList.add('hidden');
        }

        function updateStrategyManagerSortIndicator() {
            const el = document.getElementById('strategy-manager-pos-sort-indicator');
            if (!el) return;
            if (!strategyManagerSortByPosition) {
                el.innerText = '--';
                el.className = 'text-[10px] text-slate-500';
                return;
            }
            if (strategyManagerSortDirection === 'desc') {
                el.innerText = '↓';
                el.className = 'text-[10px] text-emerald-400';
                return;
            }
            el.innerText = '↑';
            el.className = 'text-[10px] text-emerald-400';
        }

        function toggleStrategyManagerPositionSort() {
            if (!strategyManagerSortByPosition) {
                strategyManagerSortByPosition = true;
                strategyManagerSortDirection = 'desc';
            } else if (strategyManagerSortDirection === 'desc') {
                strategyManagerSortDirection = 'asc';
            } else {
                strategyManagerSortByPosition = false;
                strategyManagerSortDirection = 'desc';
            }
            updateStrategyManagerSortIndicator();
            renderStrategyManagerList(strategyManagerRows);
        }

        function updateStrategyManagerPageInfo(totalRows = 0) {
            const info = document.getElementById('strategy-manager-page-info');
            if (!info) return;
            const pageSize = Math.max(1, Number(strategyManagerPageSize) || 20);
            const pages = totalRows > 0 ? Math.ceil(totalRows / pageSize) : 1;
            const page = Math.min(Math.max(1, Number(strategyManagerPage) || 1), pages);
            info.innerText = `第 ${page} / ${pages} 页`;
        }

        async function setStrategyManagerPageSize(value) {
            const pageSize = Math.max(1, Number(value) || 20);
            strategyManagerPageSize = pageSize;
            strategyManagerPage = 1;
            await loadStrategyManager(1);
        }

        async function changeStrategyManagerPage(delta) {
            const pageSize = Math.max(1, Number(strategyManagerPageSize) || 20);
            const total = Math.max(0, Number(strategyManagerTotal) || 0);
            const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
            const next = Math.min(totalPages, Math.max(1, (Number(strategyManagerPage) || 1) + Number(delta || 0)));
            if (next === strategyManagerPage) return;
            strategyManagerPage = next;
            await loadStrategyManager(strategyManagerPage);
        }

        function suggestStrategyIdFromRows(rows) {
            const used = new Set((Array.isArray(rows) ? rows : []).map(x => String(x?.id || '').trim()).filter(Boolean));
            let i = 0;
            while (i < 10000) {
                const sid = i < 100 ? String(i).padStart(2, '0') : String(i);
                if (!used.has(sid)) return sid;
                i += 1;
            }
            return `C${Date.now().toString().slice(-6)}`;
        }

        function renderStrategyManagerList(rows) {
            const body = document.getElementById('strategy-manager-list');
            if (!body) return;
            updateStrategyManagerSortIndicator();
            if (!rows.length) {
                body.innerHTML = '<tr><td colspan="10" class="px-3 py-4 text-center text-slate-500">暂无策略</td></tr>';
                updateStrategyManagerPageInfo(strategyManagerTotal);
                return;
            }
            const esc = (txt) => String(txt || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
            const shortText = (txt, limit = 28) => {
                const s = String(txt || '').replace(/\s+/g, ' ').trim();
                if (!s) return '<span class="text-slate-500">--</span>';
                return s.length > limit ? `${s.slice(0, limit)}...` : s;
            };
            const listDependents = (sid) => {
                const target = String(sid || '');
                return rows
                    .filter(x => Array.isArray(x.depends_on) && x.depends_on.map(y => String(y)).includes(target))
                    .map(x => String(x.id || ''))
                    .filter(x => !!x);
            };
            const posFromRegime = (regimeLabel) => {
                if (regimeLabel === '强势趋势') return { pos: '1.0x', cls: 'text-emerald-300', tag: '进攻' };
                if (regimeLabel === '震荡整理') return { pos: '≤0.3x', cls: 'text-amber-300', tag: '防守' };
                if (regimeLabel === '弱趋势') return { pos: '0.5x~0.7x', cls: 'text-sky-300', tag: '平衡' };
                return { pos: '--', cls: 'text-slate-400', tag: '--' };
            };
            const regimeLabel = String(strategyRegimeSnapshot?.result?.label || '');
            const regimePos = posFromRegime(regimeLabel);
            const posPriority = regimePos.tag === '进攻' ? 3 : (regimePos.tag === '平衡' ? 2 : (regimePos.tag === '防守' ? 1 : 0));
            const sortedRows = [...rows];
            if (strategyManagerSortByPosition) {
                sortedRows.sort((a, b) => {
                    const aid = String(a?.id || '');
                    const bid = String(b?.id || '');
                    const ap = posPriority + (aid === '34R1' ? 0.1 : 0);
                    const bp = posPriority + (bid === '34R1' ? 0.1 : 0);
                    if (ap !== bp) return strategyManagerSortDirection === 'desc' ? (bp - ap) : (ap - bp);
                    return aid.localeCompare(bid);
                });
            }
            updateStrategyManagerPageInfo(strategyManagerTotal);
            body.innerHTML = sortedRows.map(r => {
                const sid = String(r.id || '');
                const enabled = !!r.enabled;
                const statusCls = enabled ? 'text-emerald-300' : 'text-slate-400';
                const statusTxt = enabled ? '启用中' : '已停用';
                const toggleTxt = enabled ? '停用' : '启用';
                const toggleCls = enabled ? 'bg-amber-700 hover:bg-amber-600 border-amber-500' : 'bg-emerald-700 hover:bg-emerald-600 border-emerald-500';
                const protectLevel = String(r.protect_level || '').toLowerCase();
                const immutable = !!r.immutable;
                const protectedFlag = immutable || ['baseline', 'protected', 'builtin'].includes(protectLevel);
                const deps = Array.isArray(r.depends_on) ? r.depends_on.map(x => String(x || '').trim()).filter(x => !!x) : [];
                const dependents = listDependents(sid);
                const protectedBadge = protectedFlag ? `<span class="ml-1 px-1.5 py-0.5 rounded text-[10px] border border-amber-500 text-amber-300">受保护</span>` : '';
                const depBadge = deps.length ? `<span class="ml-1 px-1.5 py-0.5 rounded text-[10px] border border-cyan-600 text-cyan-300" title="依赖：${esc(deps.join(', '))}">依赖${deps.length}</span>` : '';
                const refBadge = dependents.length ? `<span class="ml-1 px-1.5 py-0.5 rounded text-[10px] border border-rose-700 text-rose-300" title="被依赖：${esc(dependents.join(', '))}">被依赖${dependents.length}</span>` : '';
                const delBtn = r.deletable ? `<button onclick="openDeleteStrategyRiskModal('${sid}')" class="text-white px-2 py-1 rounded text-[11px] border bg-rose-700 hover:bg-rose-600 border-rose-500">删除</button>` : '';
                const detailBtn = `<button onclick="openStrategyDetailModal('${sid}')" class="text-white px-2 py-1 rounded text-[11px] border bg-sky-700 hover:bg-sky-600 border-sky-500">详情</button>`;
                const editBtn = r.editable && !protectedFlag ? `<button onclick="openStrategyEditModal('${sid}')" class="text-white px-2 py-1 rounded text-[11px] border bg-amber-700 hover:bg-amber-600 border-amber-500">编辑</button>` : '';
                const copyBtn = r.editable ? `<button onclick="openStrategyCopyModal('${sid}')" class="text-white px-2 py-1 rounded text-[11px] border bg-indigo-700 hover:bg-indigo-600 border-indigo-500">复制</button>` : '';
                const sourceLabel = String(r.source_label || (r.source === 'market' ? '行情驱动' : (r.source === 'human' ? '用户输入' : '--')));
                const klineType = String(r.kline_type || '--');
                const rawTitle = String(r.raw_requirement_title || '原始需求');
                const usageNotice = String(r.usage_notice || '').trim();
                const isBuiltin = !!r.builtin || String(r.source || '').toLowerCase() === 'builtin';
                const usageHtml = isBuiltin
                    ? `<span class="inline-flex items-center px-2 py-0.5 rounded border border-rose-500 bg-rose-900/40 text-rose-300 text-[11px] font-semibold">⚠ 内置策略提醒</span><div class="mt-1 text-rose-200">${shortText(usageNotice || '当前为内置策略，仅供测试研究使用，非投资建议，不构成买卖依据。')}</div>`
                    : `<span class="text-slate-500">--</span>`;
                const scoreRaw = r.score_total;
                const scoreText = (scoreRaw === null || scoreRaw === undefined || !Number.isFinite(Number(scoreRaw))) ? '--' : Number(scoreRaw).toFixed(1);
                const ratingText = String(r.rating || '').trim();
                const applies34R1 = sid === '34R1';
                const posText = applies34R1 ? regimePos.pos : `${regimePos.pos} 参考`;
                const regimeTag = regimeLabel ? regimePos.tag : '--';
                const toggleBtn = (protectedFlag && enabled)
                    ? `<button class="text-slate-500 px-2 py-1 rounded text-[11px] border border-slate-700 bg-slate-800 cursor-not-allowed" title="受保护策略不可停用">停用</button>`
                    : `<button onclick="toggleStrategyManaged('${sid}', ${enabled ? 'false' : 'true'})" class="text-white px-2 py-1 rounded text-[11px] border ${toggleCls}">${toggleTxt}</button>`;
                return `
                    <tr class="hover:bg-slate-800/40">
                        <td class="px-3 py-2 text-slate-200 font-mono">${sid}</td>
                        <td class="px-3 py-2 text-slate-200">${String(r.name || sid)}${protectedBadge}${depBadge}${refBadge}</td>
                        <td class="px-3 py-2 text-slate-300 font-mono">${klineType}<span class="ml-1 text-[11px] text-slate-500">(${sourceLabel})</span></td>
                        <td class="px-3 py-2 text-slate-300">${shortText(r.analysis_text || '')}</td>
                        <td class="px-3 py-2 text-cyan-300 font-mono">${shortText(r.code || '')}</td>
                        <td class="px-3 py-2 text-slate-300"><span class="text-slate-500">${rawTitle}：</span>${shortText(r.raw_requirement || '')}</td>
                        <td class="px-3 py-2">${usageHtml}</td>
                        <td class="px-3 py-2 text-yellow-300 font-mono">${scoreText}${ratingText ? `<span class="ml-1 text-slate-400">${ratingText}</span>` : ''}</td>
                        <td class="px-3 py-2 ${regimePos.cls}">${posText}<span class="ml-1 text-[10px] text-slate-500">(${regimeTag})</span></td>
                        <td class="px-3 py-2 ${statusCls}">${statusTxt}</td>
                        <td class="px-3 py-2 text-right">
                            <div class="inline-flex gap-1">
                                ${detailBtn}
                                ${editBtn}
                                ${copyBtn}
                                ${toggleBtn}
                                ${delBtn}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        async function loadStrategyManager(targetPage = strategyManagerPage) {
            const status = document.getElementById('strategy-manager-status');
            try {
                if (status) status.innerText = '加载中...理财有风险，投资需谨慎';
                const page = Math.max(1, Number(targetPage) || 1);
                const pageSize = Math.max(1, Number(strategyManagerPageSize) || 20);
                const res = await fetch(`/api/strategy_manager/list?page=${page}&page_size=${pageSize}`);
                const data = await res.json();
                if (data.status !== 'success') throw new Error(data.msg || '读取失败');
                strategyManagerRows = Array.isArray(data.strategies) ? data.strategies : [];
                strategyManagerTotal = Math.max(0, Number(data.total) || strategyManagerRows.length);
                strategyManagerPage = Math.max(1, Number(data.page) || page);
                renderStrategyManagerList(strategyManagerRows);
                updateStrategyQuick(selectedStrategyIds.length === 1 ? String(selectedStrategyIds[0]) : 'all');
                if (status) status.innerText = `共 ${strategyManagerTotal} 个策略`;
            } catch (e) {
                if (status) status.innerText = `加载失败: ${e}`;
            }
        }

        async function toggleStrategyManaged(strategyId, enabled) {
            try {
                const res = await fetch('/api/strategy_manager/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ strategy_id: String(strategyId), enabled: !!enabled })
                });
                const data = await res.json();
                if (data.status !== 'success') throw new Error(data.msg || '操作失败');
                logMessage('SYSTEM', `策略 ${strategyId} 已${enabled ? '启用' : '停用'}`, 'success');
                await loadStrategyManager();
                await fetchGlobalStrategies();
            } catch (e) {
                logMessage('SYSTEM', `策略状态更新失败: ${e}`, 'danger');
            }
        }

        function openDeleteStrategyRiskModal(strategyId) {
            const sid = String(strategyId || '').trim();
            if (!sid) return;
            const row = strategyManagerRows.find(x => String(x.id || '') === sid);
            if (!row) return;
            const dependents = strategyManagerRows
                .filter(x => Array.isArray(x.depends_on) && x.depends_on.map(y => String(y)).includes(sid))
                .map(x => String(x.id || ''))
                .filter(x => !!x);
            const deps = Array.isArray(row.depends_on) ? row.depends_on.map(x => String(x || '').trim()).filter(x => !!x) : [];
            const protectedFlag = !!row.immutable || ['baseline', 'protected', 'builtin'].includes(String(row.protect_level || '').toLowerCase());
            const lines = [
                `策略ID: ${sid}`,
                `策略名称: ${String(row.name || sid)}`,
                `当前状态: ${row.enabled ? '启用中' : '已停用'}`,
                `保护级别: ${protectedFlag ? '受保护' : '普通'}`,
                `依赖上游: ${deps.length ? deps.join(', ') : '无'}`,
                `下游依赖: ${dependents.length ? dependents.join(', ') : '无'}`
            ];
            const title = document.getElementById('strategy-delete-risk-title');
            const body = document.getElementById('strategy-delete-risk-body');
            const force = document.getElementById('strategy-delete-force');
            if (title) title.innerText = `确认删除策略 [${sid}] ?`;
            if (body) body.innerText = `${lines.join('\n')}\n\n风险提示：删除后该策略代码与说明会从策略库移除。`;
            if (force) force.checked = false;
            strategyDeletePendingId = sid;
            const modal = document.getElementById('strategy-delete-risk-modal');
            if (modal) modal.classList.remove('hidden');
        }

        function closeStrategyDeleteRiskModal() {
            const modal = document.getElementById('strategy-delete-risk-modal');
            if (modal) modal.classList.add('hidden');
            strategyDeletePendingId = null;
        }

        async function confirmDeleteStrategyManaged() {
            const sid = String(strategyDeletePendingId || '').trim();
            if (!sid) return;
            const force = !!document.getElementById('strategy-delete-force')?.checked;
            if (!force) {
                logMessage('SYSTEM', '请先勾选“已确认风险，强制删除（必选）”后再删除策略', 'warning');
                return;
            }
            try {
                const res = await fetch('/api/strategy_manager/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ strategy_id: sid, force })
                });
                const data = await res.json();
                if (data.status !== 'success') throw new Error(data.msg || '删除失败');
                logMessage('SYSTEM', `策略 ${sid} 已删除`, 'warning');
                closeStrategyDeleteRiskModal();
                await loadStrategyManager();
                await fetchGlobalStrategies();
            } catch (e) {
                logMessage('SYSTEM', `删除策略失败: ${e}`, 'danger');
            }
        }

        function renderMarkdownReadonly(mdText) {
            const src = String(mdText || '');
            const escaped = src
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            let html = escaped;
            html = html.replace(/^###\s+(.*)$/gm, '<h3 class="text-slate-100 font-semibold mt-2 mb-1">$1</h3>');
            html = html.replace(/^##\s+(.*)$/gm, '<h2 class="text-slate-100 font-semibold mt-2 mb-1">$1</h2>');
            html = html.replace(/^#\s+(.*)$/gm, '<h1 class="text-slate-100 font-semibold mt-2 mb-1">$1</h1>');
            html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
            html = html.replace(/`([^`]+)`/g, '<code class="bg-slate-800 px-1 rounded text-cyan-200">$1</code>');
            html = html.replace(/^\s*[-*]\s+(.*)$/gm, '<li class="ml-4 list-disc">$1</li>');
            html = html.replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, '<a class="text-sky-300 underline" href="$2" target="_blank">$1</a>');
            html = html.replace(/\n/g, '<br>');
            return html;
        }

        function openStrategyDetailModal(strategyId) {
            const sid = String(strategyId || '');
            const row = strategyManagerRows.find(x => String(x.id || '') === sid);
            if (!row) return;
            strategyManagerDetailId = sid;
            const modal = document.getElementById('strategy-detail-modal');
            if (modal) modal.classList.remove('hidden');
            const idInput = document.getElementById('strategy-detail-id');
            const nameInput = document.getElementById('strategy-detail-name');
            const sourceInput = document.getElementById('strategy-detail-source');
            const analysisWrap = document.getElementById('strategy-detail-analysis');
            const codeWrap = document.getElementById('strategy-detail-code');
            const rawWrap = document.getElementById('strategy-detail-raw');
            const rawTitleLabel = document.getElementById('strategy-detail-raw-title-label');
            const sourceLabel = String(row.source_label || (row.source === 'market' ? '行情驱动' : (row.source === 'human' ? '用户输入' : '--')));
            if (idInput) idInput.value = sid;
            if (nameInput) nameInput.value = String(row.name || sid);
            if (sourceInput) sourceInput.value = sourceLabel;
            if (analysisWrap) analysisWrap.innerHTML = renderMarkdownReadonly(row.analysis_text || '');
            if (codeWrap) codeWrap.textContent = String(row.code || '');
            if (rawWrap) rawWrap.innerHTML = renderMarkdownReadonly(row.raw_requirement || '');
            if (rawTitleLabel) rawTitleLabel.innerText = String(row.raw_requirement_title || '原始需求');
        }

        function closeStrategyDetailModal() {
            const modal = document.getElementById('strategy-detail-modal');
            if (modal) modal.classList.add('hidden');
            strategyManagerDetailId = null;
        }

        function renderStrategyEditRawTitle() {
            const source = String(document.getElementById('strategy-edit-source')?.value || 'human');
            const label = document.getElementById('strategy-edit-raw-title-label');
            if (label) label.innerText = source === 'market' ? '原始需求（行情状态）' : '原始需求（策略模板）';
        }

        function parseTriggerTimeframeFromCode(codeText) {
            const code = String(codeText || '');
            const m = code.match(/trigger_timeframe\s*=\s*['"]([^'"]+)['"]/);
            return m ? String(m[1]).trim() : '';
        }

        function syncEditCodeTriggerTimeframe() {
            const select = document.getElementById('strategy-edit-kline-type');
            const codeInput = document.getElementById('strategy-edit-code');
            if (!select || !codeInput) return;
            const kline = String(select.value || '').trim();
            if (!kline) return;
            const code = String(codeInput.value || '');
            if (!code) return;
            if (/trigger_timeframe\s*=/.test(code)) {
                codeInput.value = code.replace(/trigger_timeframe\s*=\s*['"][^'"]+['"]/, `trigger_timeframe='${kline}'`);
            }
        }

        function openStrategyEditModal(strategyId) {
            const sid = String(strategyId || '');
            const row = strategyManagerRows.find(x => String(x.id || '') === sid);
            if (!row || !row.editable) return;
            strategyEditMode = 'edit';
            strategyManagerEditingId = sid;
            const modal = document.getElementById('strategy-edit-modal');
            if (modal) modal.classList.remove('hidden');
            const source = String(row.source || '').trim().toLowerCase() === 'market' ? 'market' : 'human';
            const idInput = document.getElementById('strategy-edit-id');
            const nameInput = document.getElementById('strategy-edit-name');
            const sourceInput = document.getElementById('strategy-edit-source');
            const klineInput = document.getElementById('strategy-edit-kline-type');
            const analysisInput = document.getElementById('strategy-edit-analysis');
            const codeInput = document.getElementById('strategy-edit-code');
            const rawInput = document.getElementById('strategy-edit-raw');
            const status = document.getElementById('strategy-edit-status');
            const title = document.getElementById('strategy-edit-title');
            const saveBtn = document.getElementById('strategy-edit-save-btn');
            const copyIdWrap = document.getElementById('strategy-copy-id-wrap');
            const newIdInput = document.getElementById('strategy-edit-new-id');
            if (idInput) idInput.value = sid;
            if (nameInput) nameInput.value = String(row.name || sid);
            if (sourceInput) sourceInput.value = source;
            if (klineInput) klineInput.value = String(row.kline_type || parseTriggerTimeframeFromCode(row.code) || '1min');
            if (analysisInput) analysisInput.value = String(row.analysis_text || '');
            if (codeInput) codeInput.value = String(row.code || '');
            if (rawInput) rawInput.value = String(row.raw_requirement || '');
            if (copyIdWrap) copyIdWrap.classList.add('hidden');
            if (newIdInput) newIdInput.value = '';
            if (title) title.innerHTML = '<i class="fa-solid fa-pen-to-square mr-2 text-amber-300"></i>策略编辑';
            if (saveBtn) saveBtn.innerText = '保存生效';
            if (status) status.innerText = '进入编辑模式';
            if (sourceInput) sourceInput.onchange = renderStrategyEditRawTitle;
            if (klineInput) klineInput.onchange = syncEditCodeTriggerTimeframe;
            renderStrategyEditRawTitle();
        }

        function openStrategyCopyModal(strategyId) {
            const sid = String(strategyId || '');
            const row = strategyManagerRows.find(x => String(x.id || '') === sid);
            if (!row || !row.editable) return;
            strategyEditMode = 'copy';
            strategyManagerEditingId = sid;
            const modal = document.getElementById('strategy-edit-modal');
            if (modal) modal.classList.remove('hidden');
            const source = String(row.source || '').trim().toLowerCase() === 'market' ? 'market' : 'human';
            const idInput = document.getElementById('strategy-edit-id');
            const nameInput = document.getElementById('strategy-edit-name');
            const sourceInput = document.getElementById('strategy-edit-source');
            const klineInput = document.getElementById('strategy-edit-kline-type');
            const analysisInput = document.getElementById('strategy-edit-analysis');
            const codeInput = document.getElementById('strategy-edit-code');
            const rawInput = document.getElementById('strategy-edit-raw');
            const status = document.getElementById('strategy-edit-status');
            const title = document.getElementById('strategy-edit-title');
            const saveBtn = document.getElementById('strategy-edit-save-btn');
            const copyIdWrap = document.getElementById('strategy-copy-id-wrap');
            const newIdInput = document.getElementById('strategy-edit-new-id');
            const suggestedId = `${sid}_COPY_${Date.now().toString().slice(-4)}`;
            if (idInput) idInput.value = sid;
            if (nameInput) nameInput.value = `${String(row.name || sid)}-副本`;
            if (sourceInput) sourceInput.value = source;
            if (klineInput) klineInput.value = String(row.kline_type || parseTriggerTimeframeFromCode(row.code) || '1min');
            if (analysisInput) analysisInput.value = String(row.analysis_text || '');
            if (codeInput) codeInput.value = String(row.code || '');
            if (rawInput) rawInput.value = String(row.raw_requirement || '');
            if (copyIdWrap) copyIdWrap.classList.remove('hidden');
            if (newIdInput) newIdInput.value = suggestedId;
            if (title) title.innerHTML = '<i class="fa-solid fa-copy mr-2 text-indigo-300"></i>复制策略并另存';
            if (saveBtn) saveBtn.innerText = '复制保存';
            if (status) status.innerText = `复制自 ${sid}，可修改后另存为新策略`;
            if (sourceInput) sourceInput.onchange = renderStrategyEditRawTitle;
            if (klineInput) klineInput.onchange = syncEditCodeTriggerTimeframe;
            renderStrategyEditRawTitle();
        }

        function closeStrategyEditModal() {
            const modal = document.getElementById('strategy-edit-modal');
            if (modal) modal.classList.add('hidden');
            strategyManagerEditingId = null;
            strategyEditMode = 'edit';
        }

        async function saveStrategyEditModal() {
            const status = document.getElementById('strategy-edit-status');
            const sid = String(strategyManagerEditingId || '');
            if (!sid) return;
            const nameText = String(document.getElementById('strategy-edit-name')?.value || '').trim();
            const source = String(document.getElementById('strategy-edit-source')?.value || 'human');
            const klineType = String(document.getElementById('strategy-edit-kline-type')?.value || '1min');
            const analysisText = String(document.getElementById('strategy-edit-analysis')?.value || '').trim();
            const codeText = String(document.getElementById('strategy-edit-code')?.value || '').trim();
            const rawRequirement = String(document.getElementById('strategy-edit-raw')?.value || '').trim();
            const newId = String(document.getElementById('strategy-edit-new-id')?.value || '').trim();
            const rawTitle = source === 'market' ? '行情状态' : '策略模板';
            if (!nameText) {
                if (status) status.innerText = '策略名称不能为空';
                return;
            }
            if (!codeText) {
                if (status) status.innerText = '策略代码不能为空';
                return;
            }
            if (strategyEditMode === 'copy' && !newId) {
                if (status) status.innerText = '复制模式下新策略ID不能为空';
                return;
            }
            try {
                if (status) status.innerText = '保存中...';
                const endpoint = strategyEditMode === 'copy' ? '/api/strategy_manager/add' : '/api/strategy_manager/update';
                const payload = strategyEditMode === 'copy'
                    ? {
                        strategy_id: newId,
                        strategy_name: nameText,
                        source: source,
                        kline_type: klineType,
                        analysis_text: analysisText,
                        code: codeText,
                        raw_requirement_title: rawTitle,
                        raw_requirement: rawRequirement
                    }
                    : {
                        strategy_id: sid,
                        strategy_name: nameText,
                        source: source,
                        kline_type: klineType,
                        analysis_text: analysisText,
                        code: codeText,
                        raw_requirement_title: rawTitle,
                        raw_requirement: rawRequirement
                    };
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.status !== 'success') throw new Error(data.msg || '保存失败');
                await fetch('/api/control/reload_strategies', { method: 'POST' });
                if (status) status.innerText = '保存成功，已生效';
                if (strategyEditMode === 'copy') {
                    logMessage('SYSTEM', `策略 ${sid} 已复制为 ${newId}`, 'success');
                } else {
                    logMessage('SYSTEM', `策略 ${sid} 已更新`, 'success');
                }
                closeStrategyEditModal();
                await loadStrategyManager();
                await fetchGlobalStrategies();
            } catch (e) {
                if (status) status.innerText = `保存失败: ${e}`;
            }
        }

        async function openStrategyCreateModal() {
            pendingGeneratedStrategy = null;
            const modal = document.getElementById('strategy-create-modal');
            if (modal) modal.classList.remove('hidden');
            const status = document.getElementById('strategy-create-status');
            if (status) status.innerText = '输入策略要素后点击智能分析';
            const idInput = document.getElementById('strategy-create-id');
            if (idInput) idInput.value = suggestStrategyIdFromRows(strategyManagerRows);
            try {
                const res = await fetch('/api/strategy_manager/next_id');
                const data = await res.json();
                if (data.status === 'success' && idInput) idInput.value = String(data.strategy_id || '').trim() || idInput.value;
            } catch (_) {}
            const analysis = document.getElementById('strategy-analysis-output');
            if (analysis) analysis.innerText = '';
            const code = document.getElementById('strategy-code-output');
            if (code) code.value = '';
            const codeTpl = document.getElementById('strategy-code-template-input');
            if (codeTpl && !String(codeTpl.value || '').trim()) codeTpl.value = STRATEGY_CODE_TEMPLATE_DEFAULT;
            const nameInput = document.getElementById('strategy-create-name');
            if (nameInput && !nameInput.value) nameInput.value = `智能策略${Date.now().toString().slice(-4)}`;
            const sourceSelect = document.getElementById('strategy-intent-source');
            if (sourceSelect && !sourceSelect.value) sourceSelect.value = 'human';
            const klineTypeSelect = document.getElementById('strategy-kline-type');
            if (klineTypeSelect && !klineTypeSelect.value) klineTypeSelect.value = '1min';
            setStrategyIntentSourceUI();
        }

        function closeStrategyCreateModal() {
            const modal = document.getElementById('strategy-create-modal');
            if (modal) modal.classList.add('hidden');
        }

        function setStrategyIntentSourceUI() {
            const source = String(document.getElementById('strategy-intent-source')?.value || 'human');
            const marketPanel = document.getElementById('strategy-market-state-panel');
            const templateInput = document.getElementById('strategy-template-input');
            const status = document.getElementById('strategy-create-status');
            if (marketPanel) marketPanel.classList.toggle('hidden', source !== 'market');
            if (templateInput) {
                templateInput.placeholder = source === 'market'
                    ? '可选：补充市场驱动策略意图说明（例如行业主线、风格偏好）'
                    : '请粘贴或输入你的策略思路、入场条件、离场条件、风控规则';
            }
            if (status && !pendingGeneratedStrategy) {
                status.innerText = source === 'market' ? '填写 market_state 后点击智能分析' : '输入策略模版后点击智能分析';
            }
        }

        function collectMarketStateFromForm() {
            const trend = String(document.getElementById('market-trend-input')?.value || 'sideways');
            const volatility = String(document.getElementById('market-volatility-input')?.value || 'medium');
            const momentum = String(document.getElementById('market-momentum-input')?.value || 'neutral');
            const summary = String(document.getElementById('market-summary-input')?.value || '').trim();
            return {
                trend,
                volatility,
                momentum,
                summary
            };
        }

        function marketStateToZhText(state) {
            const s = state || {};
            const trendMap = { up: '上行', down: '下行', sideways: '震荡' };
            const volMap = { low: '低波动', medium: '中波动', high: '高波动' };
            const momMap = { weak: '弱', neutral: '中', strong: '强' };
            const trend = trendMap[String(s.trend || '')] || String(s.trend || '--');
            const vol = volMap[String(s.volatility || '')] || String(s.volatility || '--');
            const momentum = momMap[String(s.momentum || '')] || String(s.momentum || '--');
            const summary = String(s.summary || '').trim();
            return `趋势：${trend}\n波动：${vol}\n动量：${momentum}${summary ? `\n补充：${summary}` : ''}`;
        }

        async function analyzeStrategyTemplate() {
            const tplInput = document.getElementById('strategy-template-input');
            const codeTplInput = document.getElementById('strategy-code-template-input');
            const nameInput = document.getElementById('strategy-create-name');
            const sourceSelect = document.getElementById('strategy-intent-source');
            const klineTypeSelect = document.getElementById('strategy-kline-type');
            const status = document.getElementById('strategy-create-status');
            const source = String(sourceSelect?.value || 'human');
            const klineType = String(klineTypeSelect?.value || '1min');
            const templateText = String(tplInput?.value || '').trim();
            const codeTemplateText = String(codeTplInput?.value || '').trim();
            const strategyName = String(nameInput?.value || '').trim();
            if (source === 'human' && !templateText) {
                if (status) status.innerText = '请先输入策略模版';
                return;
            }
            try {
                if (status) status.innerText = '智能分析中...';
                const marketState = source === 'market' ? collectMarketStateFromForm() : null;
                const endpoint = source === 'market' ? '/api/strategy_manager/analyze_market' : '/api/strategy_manager/analyze';
                const payload = source === 'market'
                    ? {
                        market_state: marketState,
                        strategy_name: strategyName || null,
                        code_template: codeTemplateText || STRATEGY_CODE_TEMPLATE_DEFAULT,
                        kline_type: klineType
                    }
                    : {
                        template_text: templateText,
                        strategy_name: strategyName || null,
                        code_template: codeTemplateText || STRATEGY_CODE_TEMPLATE_DEFAULT,
                        kline_type: klineType
                    };
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.status !== 'success') throw new Error(data.msg || '智能分析失败');
                pendingGeneratedStrategy = {
                    strategy_id: String(data.strategy_id || ''),
                    strategy_name: String(data.strategy_name || strategyName || ''),
                    class_name: String(data.class_name || ''),
                    analysis_text: String(data.analysis_text || ''),
                    template_text: templateText,
                    source: source,
                    kline_type: klineType,
                    strategy_intent: data.strategy_intent || {},
                    intent_explain: String(data.intent_explain || ''),
                    raw_requirement_title: source === 'market' ? '行情状态' : '策略模板',
                    raw_requirement: source === 'market' ? marketStateToZhText(marketState) : templateText
                };
                const analysis = document.getElementById('strategy-analysis-output');
                if (analysis) {
                    const explainPart = pendingGeneratedStrategy.intent_explain ? `Intent解释：${pendingGeneratedStrategy.intent_explain}\n\n` : '';
                    analysis.innerText = `${explainPart}${pendingGeneratedStrategy.analysis_text || '已完成分析'}`;
                }
                const code = document.getElementById('strategy-code-output');
                if (code) code.value = String(data.code || '');
                const idInput = document.getElementById('strategy-create-id');
                if (idInput) idInput.value = pendingGeneratedStrategy.strategy_id;
                if (status) status.innerText = `已生成策略 ${pendingGeneratedStrategy.strategy_id}（${source === 'market' ? 'market' : 'human'}）`;
            } catch (e) {
                if (status) status.innerText = `智能分析失败: ${e}`;
            }
        }

        function cancelGeneratedStrategy() {
            pendingGeneratedStrategy = null;
            closeStrategyCreateModal();
        }

        async function confirmAddGeneratedStrategy() {
            const status = document.getElementById('strategy-create-status');
            const strategyId = String(document.getElementById('strategy-create-id')?.value || '').trim();
            const codeText = String(document.getElementById('strategy-code-output')?.value || '').trim();
            const nameInput = document.getElementById('strategy-create-name');
            const nameText = String(nameInput?.value || '').trim();
            const source = String(document.getElementById('strategy-intent-source')?.value || 'human');
            const klineType = String(document.getElementById('strategy-kline-type')?.value || '1min');
            const templateText = String(document.getElementById('strategy-template-input')?.value || '').trim();
            const analysisText = String(document.getElementById('strategy-analysis-output')?.innerText || '').trim();
            const rawRequirement = source === 'market' ? marketStateToZhText(collectMarketStateFromForm()) : templateText;
            const rawTitle = source === 'market' ? '行情状态' : '策略模板';
            if (!strategyId) {
                if (status) status.innerText = '策略ID不能为空';
                return;
            }
            if (!codeText) {
                if (status) status.innerText = '策略代码不能为空';
                return;
            }
            if (!nameText) {
                if (status) status.innerText = '策略名称不能为空';
                return;
            }
            try {
                if (status) status.innerText = '保存中...';
                const intentPayload = pendingGeneratedStrategy?.strategy_intent && String(pendingGeneratedStrategy?.source || source) === source
                    ? pendingGeneratedStrategy.strategy_intent
                    : null;
                const res = await fetch('/api/strategy_manager/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        strategy_id: strategyId,
                        strategy_name: nameText,
                        class_name: pendingGeneratedStrategy?.class_name || null,
                        code: codeText,
                        template_text: templateText,
                        analysis_text: analysisText,
                        strategy_intent: intentPayload,
                        source: source,
                        kline_type: klineType,
                        raw_requirement_title: rawTitle,
                        raw_requirement: rawRequirement
                    })
                });
                const data = await res.json();
                if (data.status !== 'success') throw new Error(data.msg || '保存失败');
                await fetch('/api/control/reload_strategies', { method: 'POST' });
                if (status) status.innerText = '保存成功';
                logMessage('SYSTEM', `策略 ${strategyId} 已新增`, 'success');
                closeStrategyCreateModal();
                await loadStrategyManager();
                await fetchGlobalStrategies();
            } catch (e) {
                if (status) status.innerText = `保存失败: ${e}`;
            }
        }

        async function syncStatus() {
            if (statusSyncInFlight) return;
            statusSyncInFlight = true;
            try {
                const res = await fetch('/api/status/light');
                const data = await res.json();
                const nextBootId = String(data.server_boot_id || '').trim();
                if (nextBootId) currentServerBootId = nextBootId;
                liveEnabled = data.live_enabled !== false;
                const runningCodes = Array.isArray(data.live_running_codes) ? data.live_running_codes : [];
                const liveStrategyProfiles = (data.live_strategy_profiles && typeof data.live_strategy_profiles === 'object')
                    ? data.live_strategy_profiles
                    : {};
                const liveRunningByStatus = Boolean(data.live_running || runningCodes.length > 0);
                const liveByCabinet = Boolean(data.is_running && String(data.active_cabinet_type || '').toLowerCase().includes('live'));
                liveRunning = (liveRunningByStatus || liveByCabinet);
                if (liveRunning) {
                    applyLiveStrategyProfiles(liveStrategyProfiles, runningCodes);
                }
                if (liveRunning) liveActionPending = false;
                const reportStatus = String(data.current_report_status || '').toLowerCase();
                const statusReportId = String(data.current_report_id || '').trim();
                const reportError = data.current_report_error;
                liveLastError = (data.live_last_error && typeof data.live_last_error === 'object') ? data.live_last_error : null;
                const progressVal = Number((data.progress || {}).progress || 0);
                const isBacktestRunning = Boolean(data.is_running && String(data.active_cabinet_type || '').toLowerCase().includes('backtest'));
                const successLike = ['success', 'succeeded', 'completed', 'done'].includes(reportStatus);
                const stoppedLike = (!isBacktestRunning && progressVal >= 100) || (!data.is_running && reportStatus && reportStatus !== 'running');
                if (backtestBtnState === BACKTEST_BTN_STATE.running) {
                    const reportTracked = currentBacktestReportId
                        ? statusReportId === currentBacktestReportId
                        : !backtestStartInFlight;
                    if (reportTracked) {
                        if (reportStatus === 'failed' || reportError) {
                            handleBacktestFailure(reportError || '回测任务异常终止');
                        } else if (successLike || stoppedLike) {
                            setBacktestButtonState(BACKTEST_BTN_STATE.idle);
                        }
                    }
                }
                const sourceSel = document.getElementById('source-select');
                if (data.provider_source) currentSource = data.provider_source;
                if (sourceSel && data.provider_source) sourceSel.value = data.provider_source;
                const poolMap = (data.live_fund_pools && typeof data.live_fund_pools === 'object') ? data.live_fund_pools : {};
                Object.keys(poolMap).forEach(code => ingestFundPoolSnapshot(poolMap[code], code, false));
                if (!liveFundPoolSelectedCode) {
                    updateFundPoolStockSelect();
                }
                if (liveFundPoolSelectedCode && (Date.now() - Number(liveFundLastFetchAt || 0) > 15000)) {
                    refreshFundPoolPanel(liveFundPoolSelectedCode);
                }
                applyLiveVisibility();
                renderLiveStatus();
                renderLiveExceptionPanel();
                await Promise.allSettled([
                    refreshHistorySyncStatus(),
                    syncBoardConfig()
                ]);
            } catch (_) {
            } finally {
                statusSyncInFlight = false;
            }
        }

        function renderHistorySyncButtons() {
            const runBtn = document.getElementById('history-sync-run-btn');
            const runIcon = document.getElementById('history-sync-run-icon');
            const runLabel = document.getElementById('history-sync-run-label');
            const stopBtn = document.getElementById('history-sync-stop-btn');
            const stopIcon = document.getElementById('history-sync-stop-icon');
            const stopLabel = document.getElementById('history-sync-stop-label');
            const schedulerBtn = document.getElementById('history-sync-scheduler-btn');
            const schedulerIcon = document.getElementById('history-sync-scheduler-icon');
            const schedulerLabel = document.getElementById('history-sync-scheduler-label');
            if (runBtn && runIcon && runLabel) {
                if (historySyncRunning) {
                    runBtn.className = 'bg-amber-700 hover:bg-amber-600 text-white px-4 py-2 rounded font-bold text-sm transition-all border border-amber-500 min-w-[128px]';
                    runIcon.className = 'fa-solid fa-spinner';
                    runLabel.innerText = historySyncStopRequested ? '停止中' : '同步进行中';
                } else {
                    runBtn.className = 'bg-teal-700 hover:bg-teal-600 text-white px-4 py-2 rounded font-bold text-sm transition-all border border-teal-500 min-w-[128px]';
                    runIcon.className = 'fa-solid fa-database';
                    runLabel.innerText = '增量同步';
                }
            }
            if (stopBtn && stopIcon && stopLabel) {
                if (historySyncRunning) {
                    stopBtn.className = 'bg-rose-700 hover:bg-rose-600 text-white px-4 py-2 rounded font-bold text-sm transition-all border border-rose-500 min-w-[128px]';
                    stopIcon.className = historySyncStopRequested ? 'fa-solid fa-spinner' : 'fa-solid fa-stop';
                    stopLabel.innerText = historySyncStopRequested ? '停止中' : '停止同步';
                    stopBtn.disabled = !!historySyncStopRequested;
                } else {
                    stopBtn.className = 'bg-slate-700 text-slate-300 px-4 py-2 rounded font-bold text-sm transition-all border border-slate-500 min-w-[128px] opacity-60 cursor-not-allowed';
                    stopIcon.className = 'fa-solid fa-stop';
                    stopLabel.innerText = '停止同步';
                    stopBtn.disabled = true;
                }
            }
            if (schedulerBtn && schedulerIcon && schedulerLabel) {
                if (historySyncSchedulerRunning) {
                    schedulerBtn.className = 'bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded font-bold text-sm transition-all border border-emerald-500 min-w-[128px]';
                    schedulerIcon.className = 'fa-solid fa-clock-rotate-left';
                    schedulerLabel.innerText = '定时同步开';
                } else {
                    schedulerBtn.className = 'bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded font-bold text-sm transition-all border border-slate-500 min-w-[128px]';
                    schedulerIcon.className = 'fa-solid fa-clock';
                    schedulerLabel.innerText = '定时同步关';
                }
            }
        }

        async function refreshHistorySyncStatus() {
            try {
                const res = await fetch('/api/history_sync/status');
                if (!res.ok) return;
                const data = await res.json();
                historySyncRunning = Boolean(data?.service?.is_running);
                historySyncStopRequested = Boolean(data?.service?.stop_requested);
                historySyncSchedulerRunning = Boolean(data?.scheduler_running);
                renderHistorySyncButtons();
            } catch (_) {}
        }

        async function runHistorySync() {
            if (historySyncRunning) {
                logMessage('SYSTEM', '增量同步任务已在运行中，请点击“停止同步”按钮中断', 'warning');
                return;
            }
            historySyncRunning = true;
            historySyncStopRequested = false;
            renderHistorySyncButtons();
            try {
                const cfg = configDraft || {};
                const writeMode = String(getByPath(cfg, 'history_sync.write_mode', 'api') || 'api');
                const directDbSource = String(getByPath(cfg, 'history_sync.direct_db_source', 'mysql') || 'mysql');
                const timeMode = String(getByPath(cfg, 'history_sync.time_mode', 'lookback') || 'lookback');
                const customStartTime = String(getByPath(cfg, 'history_sync.custom_start_time', '') || '').trim();
                const customEndTime = String(getByPath(cfg, 'history_sync.custom_end_time', '') || '').trim();
                const sessionOnly = Boolean(getByPath(cfg, 'history_sync.session_only', true));
                const intradayMode = Boolean(getByPath(cfg, 'history_sync.intraday_mode', false));
                const lookbackDays = Number(getByPath(cfg, 'history_sync.lookback_days', 10) || 10);
                const maxCodes = Number(getByPath(cfg, 'history_sync.max_codes', 10000) || 10000);
                const batchSize = Number(getByPath(cfg, 'history_sync.batch_size', 500) || 500);
                const dryRun = Boolean(getByPath(cfg, 'history_sync.dry_run', false));
                const tablesCfg = getByPath(cfg, 'history_sync.tables', ['dat_1mins', 'dat_5mins', 'dat_10mins', 'dat_15mins', 'dat_30mins', 'dat_60mins', 'dat_days']);
                const tables = Array.isArray(tablesCfg) && tablesCfg.length ? tablesCfg : ['dat_1mins', 'dat_5mins', 'dat_10mins', 'dat_15mins', 'dat_30mins', 'dat_60mins', 'dat_days'];
                const payload = {
                    lookback_days: Math.max(1, Math.floor(lookbackDays)),
                    max_codes: Math.max(1, Math.floor(maxCodes)),
                    batch_size: Math.max(1, Math.floor(batchSize)),
                    tables,
                    dry_run: dryRun,
                    time_mode: timeMode,
                    custom_start_time: customStartTime,
                    custom_end_time: customEndTime,
                    session_only: sessionOnly,
                    intraday_mode: intradayMode,
                    on_duplicate: 'ignore',
                    write_mode: writeMode,
                    direct_db_source: directDbSource,
                    async_run: false
                };
                const res = await fetch('/api/history_sync/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok || data.status === 'error') {
                    throw new Error(data.msg || '触发失败');
                }
                const report = data.report || {};
                const missing = Number(report.total_missing_rows || 0);
                const written = Number(report.total_written_rows || 0);
                if (dryRun) {
                    logMessage('SYSTEM', `增量同步预演完成：缺失${missing}条，预计写入${missing}条（未落库）`, 'warning');
                } else {
                    logMessage('SYSTEM', `增量同步完成：缺失${missing}条，写入${written}条`, 'success');
                }
                if (data.record && data.record.run_id) {
                    logMessage('SYSTEM', `同步记录已生成：${data.record.run_id}`, 'info');
                }
            } catch (e) {
                logMessage('SYSTEM', `增量同步失败: ${e}`, 'danger');
            } finally {
                await refreshHistorySyncStatus();
            }
        }

        async function stopHistorySync() {
            try {
                const res = await fetch('/api/history_sync/stop', { method: 'POST' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.msg || '停止失败');
                historySyncStopRequested = true;
                renderHistorySyncButtons();
                logMessage('SYSTEM', `增量同步停止请求已发送：${data.msg || 'ok'}，等待当前批次结束后中断`, 'warning');
            } catch (e) {
                logMessage('SYSTEM', `停止增量同步失败: ${e}`, 'danger');
            } finally {
                await refreshHistorySyncStatus();
            }
        }

        async function toggleHistorySyncScheduler() {
            const nextOn = !historySyncSchedulerRunning;
            try {
                if (nextOn) {
                    const cfg = configDraft || {};
                    const writeMode = String(getByPath(cfg, 'history_sync.write_mode', 'api') || 'api');
                    const directDbSource = String(getByPath(cfg, 'history_sync.direct_db_source', 'mysql') || 'mysql');
                    const timeMode = String(getByPath(cfg, 'history_sync.time_mode', 'lookback') || 'lookback');
                    const customStartTime = String(getByPath(cfg, 'history_sync.custom_start_time', '') || '').trim();
                    const customEndTime = String(getByPath(cfg, 'history_sync.custom_end_time', '') || '').trim();
                    const sessionOnly = Boolean(getByPath(cfg, 'history_sync.session_only', true));
                    const intradayMode = Boolean(getByPath(cfg, 'history_sync.intraday_mode', false));
                    const lookbackDays = Number(getByPath(cfg, 'history_sync.lookback_days', 10) || 10);
                    const maxCodes = Number(getByPath(cfg, 'history_sync.max_codes', 10000) || 10000);
                    const batchSize = Number(getByPath(cfg, 'history_sync.batch_size', 500) || 500);
                    const dryRun = Boolean(getByPath(cfg, 'history_sync.dry_run', false));
                    const intervalMinutes = Number(getByPath(cfg, 'history_sync.interval_minutes', 60) || 60);
                    const tablesCfg = getByPath(cfg, 'history_sync.tables', ['dat_1mins', 'dat_5mins', 'dat_10mins', 'dat_15mins', 'dat_30mins', 'dat_60mins', 'dat_days']);
                    const tables = Array.isArray(tablesCfg) && tablesCfg.length ? tablesCfg : ['dat_1mins', 'dat_5mins', 'dat_10mins', 'dat_15mins', 'dat_30mins', 'dat_60mins', 'dat_days'];
                    const res = await fetch('/api/history_sync/scheduler/start', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            interval_minutes: Math.max(1, Math.floor(intervalMinutes)),
                            lookback_days: Math.max(1, Math.floor(lookbackDays)),
                            max_codes: Math.max(1, Math.floor(maxCodes)),
                            batch_size: Math.max(1, Math.floor(batchSize)),
                            tables,
                            dry_run: dryRun,
                            time_mode: timeMode,
                            custom_start_time: customStartTime,
                            custom_end_time: customEndTime,
                            session_only: sessionOnly,
                            intraday_mode: intradayMode,
                            on_duplicate: 'ignore',
                            write_mode: writeMode,
                            direct_db_source: directDbSource
                        })
                    });
                    const data = await res.json();
                    if (!res.ok || data.status !== 'success') throw new Error(data.msg || '启动失败');
                    logMessage('SYSTEM', '定时增量同步已开启（每60分钟）', 'success');
                } else {
                    const res = await fetch('/api/history_sync/scheduler/stop', { method: 'POST' });
                    const data = await res.json();
                    if (!res.ok || data.status !== 'success') throw new Error(data.msg || '停止失败');
                    logMessage('SYSTEM', '定时增量同步已关闭', 'warning');
                }
            } catch (e) {
                logMessage('SYSTEM', `定时同步切换失败: ${e}`, 'danger');
            } finally {
                await refreshHistorySyncStatus();
            }
        }

        async function fetchGlobalStrategies() {
            const preserveSelection = Array.isArray(strategyCatalog) && strategyCatalog.length > 0;
            try {
                const res = await fetch('/api/strategy_manager/list?all=true');
                const data = await res.json();
                if (data && data.status === 'success' && Array.isArray(data.strategies) && data.strategies.length) {
                    const scoreMap = {};
                    const strategies = data.strategies
                        .filter(row => row && row.enabled !== false)
                        .map(row => {
                            const sid = String(row.id || '').trim();
                            const sname = String(row.name || sid);
                            const score = Number(row.score_total);
                            if (sid && Number.isFinite(score)) scoreMap[sid] = score;
                            return { id: sid, name: sname };
                        })
                        .filter(row => String(row.id || '').trim());
                    latestStrategyScores = scoreMap;
                    updateStrategyList(strategies, preserveSelection);
                    if (pendingLiveStrategyProfiles) {
                        applyLiveStrategyProfiles(pendingLiveStrategyProfiles.profiles, pendingLiveStrategyProfiles.runningCodes);
                    }
                    return;
                }
            } catch (_) {}
            try {
                const res = await fetch('/api/strategies');
                const data = await res.json();
                if (data && data.status === 'success' && Array.isArray(data.strategies) && data.strategies.length) {
                    updateStrategyList(data.strategies, preserveSelection);
                    if (pendingLiveStrategyProfiles) {
                        applyLiveStrategyProfiles(pendingLiveStrategyProfiles.profiles, pendingLiveStrategyProfiles.runningCodes);
                    }
                    return;
                }
            } catch (_) {}
            if (!strategyCatalog.length) {
                updateStrategyList(STRATEGY_FALLBACK);
            }
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !resultsBox.contains(e.target)) {
                resultsBox.classList.add('hidden');
            }
            const strategyBtn = document.getElementById('strategy-multi-btn');
            const strategyPanel = document.getElementById('strategy-multi-panel');
            if (strategyBtn && strategyPanel && !strategyBtn.contains(e.target) && !strategyPanel.contains(e.target)) {
                strategyPanel.classList.add('hidden');
            }
            const moreBtn = document.getElementById('action-more-btn');
            const moreMenu = document.getElementById('action-more-menu');
            if (moreBtn && moreMenu && !moreBtn.contains(e.target) && !moreMenu.contains(e.target)) {
                moreMenu.classList.add('hidden');
            }
            const drawer = document.getElementById('live-params-drawer');
            const drawerBtn = document.getElementById('live-params-btn');
            const drawerFab = document.getElementById('live-params-fab');
            if (
                drawer
                && (!drawer.classList.contains('pointer-events-none'))
                && (!drawer.contains(e.target))
                && (!drawerBtn || !drawerBtn.contains(e.target))
                && (!drawerFab || !drawerFab.contains(e.target))
            ) {
                toggleLiveParamsDrawer(false);
            }
        });

        function switchStrategy(val) {
            const steps = [
                "正在断开当前策略信号...",
                "正在加载目标策略参数...",
                "正在初始化指标缓存...",
                "正在重连风控与执行链路...",
                "策略切换完成"
            ];
            playOverlaySteps(steps, () => {
                const msg = Array.isArray(val) ? (val.length ? `策略切换完成: ${val.join(',')}` : '策略切换完成: 全部策略') : `策略切换完成: ${val}`;
                logMessage('SYSTEM', msg, 'success');
            });
            if (Array.isArray(val)) {
                sendWsCommand({ type: 'switch_strategy', ids: val });
                updateStrategyQuick(val.length === 1 ? String(val[0]) : 'all');
            } else {
                sendWsCommand({ type: 'switch_strategy', id: val });
                updateStrategyQuick(val);
            }
        }

        function playOverlaySteps(steps, onDone) {
            const overlay = document.getElementById('strategy-overlay');
            const text = document.getElementById('overlay-text');
            if (!overlay || !text) return;
            overlay.classList.add('active');
            let i = 0;
            const interval = setInterval(() => {
                if (i < steps.length) {
                    text.innerText = steps[i];
                    i++;
                } else {
                    clearInterval(interval);
                    setTimeout(() => {
                        overlay.classList.remove('active');
                        if (onDone) onDone();
                    }, 450);
                }
            }, 300);
        }

        async function applySourceSwitch(source) {
            const sourceSel = document.getElementById('source-select');
            if (!sourceSel) return;
            const steps = [
                "正在准备数据源热切换...",
                `目标数据源：${source}`,
                "正在重启实时运行上下文...",
                "正在校验数据源可用性...",
                "数据源切换完成"
            ];
            playOverlaySteps(steps, () => {
                logMessage('SYSTEM', `数据源切换生效: ${source}`, 'success');
            });
            try {
                const res = await fetch('/api/control/set_source', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ source })
                });
                if (res.status === 404) {
                    logMessage('SYSTEM', '切换失败：请重启服务以加载新路由 /api/control/set_source', 'danger');
                    await syncStatus();
                    return;
                }
                const data = await res.json();
                if (data.status !== 'success') {
                    logMessage('SYSTEM', data.msg || '数据源切换失败', 'danger');
                } else {
                    currentSource = source;
                    await syncStatus();
                }
            } catch (e) {
                logMessage('SYSTEM', `数据源切换异常: ${e}`, 'danger');
            } finally {
                if (sourceSel) sourceSel.value = currentSource;
            }
        }

        function onSourceSelectChange(value) {
            const next = String(value || '').trim().toLowerCase();
            if (!next || next === currentSource) return;
            applySourceSwitch(next);
        }

        // --- Backtest Logic ---
        function setBacktestButtonState(state) {
            const btn = document.getElementById('backtest-trigger-btn');
            const icon = document.getElementById('backtest-trigger-icon');
            const label = document.getElementById('backtest-trigger-label');
            if (!btn || !icon || !label) return;
            if (state === BACKTEST_BTN_STATE.error) {
                state = BACKTEST_BTN_STATE.idle;
            }
            backtestBtnState = state;
            if (backtestStatusMonitorTimer) {
                clearTimeout(backtestStatusMonitorTimer);
                backtestStatusMonitorTimer = null;
            }
            if (state === BACKTEST_BTN_STATE.running) {
                btn.className = 'bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded font-bold text-sm transition-all border border-rose-500 min-w-[128px]';
                icon.className = 'fa-solid fa-stop';
                label.innerText = '终止回测';
                btn.disabled = false;
                backtestMonitorErrorCount = 0;
                backtestNoRunningTicks = 0;
                backtestStopInFlight = false;
                monitorBacktestTaskStatus();
                return;
            }
            btn.disabled = false;
            backtestStartInFlight = false;
            backtestStopInFlight = false;
            currentBacktestReportId = '';
            backtestNoRunningTicks = 0;
            btn.className = 'bg-trading-blue hover:bg-blue-600 text-white px-4 py-2 rounded font-bold text-sm transition-all shadow-[0_0_10px_rgba(59,130,246,0.3)] border border-blue-500 min-w-[128px]';
            icon.className = 'fa-solid fa-play';
            label.innerText = '单票回测';
        }

        function handleBacktestFailure(message) {
            const msg = String(message || '回测失败');
            closeBacktestStream();
            renderBacktestFlow({ module: '工部', level: 'danger', msg });
            logMessage('回测', msg, 'danger');
            setBacktestButtonState(BACKTEST_BTN_STATE.idle);
        }

        function setBacktestStopPending(pending) {
            const btn = document.getElementById('backtest-trigger-btn');
            const icon = document.getElementById('backtest-trigger-icon');
            const label = document.getElementById('backtest-trigger-label');
            if (!btn || !icon || !label) return;
            if (backtestBtnState !== BACKTEST_BTN_STATE.running) return;
            backtestStopInFlight = !!pending;
            if (pending) {
                btn.disabled = true;
                btn.className = 'bg-amber-700 hover:bg-amber-600 text-white px-4 py-2 rounded font-bold text-sm transition-all border border-amber-500 min-w-[128px]';
                icon.className = 'fa-solid fa-spinner fa-spin';
                label.innerText = '终止中...';
                return;
            }
            btn.disabled = false;
            btn.className = 'bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded font-bold text-sm transition-all border border-rose-500 min-w-[128px]';
            icon.className = 'fa-solid fa-stop';
            label.innerText = '终止回测';
        }

        async function monitorBacktestTaskStatus() {
            if (backtestBtnState !== BACKTEST_BTN_STATE.running) return;
            try {
                const res = await fetch('/api/status');
                if (!res.ok) throw new Error(`status ${res.status}`);
                const data = await res.json();
                const reportStatus = String(data.current_report_status || '').toLowerCase();
                const statusReportId = String(data.current_report_id || '').trim();
                const reportError = data.current_report_error;
                const progressObj = (data.progress && typeof data.progress === 'object') ? data.progress : {};
                const progressVal = Number(progressObj.progress || 0);
                const progressDate = String(progressObj.current_date || '--');
                const activeType = String(data.active_cabinet_type || '').toLowerCase();
                const reportTracked = currentBacktestReportId
                    ? statusReportId === currentBacktestReportId
                    : !backtestStartInFlight;
                const isBacktestRunning = Boolean(
                    reportTracked && data.is_running && (
                        activeType.includes('backtest')
                        || reportStatus === 'running'
                        || progressVal > 0
                        || Boolean(statusReportId)
                    )
                );
                if (isBacktestRunning) {
                    backtestNoRunningTicks = 0;
                    updateBacktestProgress({ progress: progressVal, current_date: progressDate });
                } else {
                    backtestNoRunningTicks += 1;
                }
                if (reportTracked && (reportStatus === 'failed' || reportError)) {
                    handleBacktestFailure(reportError || '回测任务异常终止');
                    return;
                }
                if (reportTracked && reportStatus === 'cancelled') {
                    closeBacktestStream();
                    logMessage('回测', '回测已终止', 'warning');
                    setBacktestButtonState(BACKTEST_BTN_STATE.idle);
                    return;
                }
                const successLike = ['success', 'succeeded', 'completed', 'done'].includes(reportStatus);
                const finishedBySnapshot = reportTracked && !isBacktestRunning && (
                    successLike
                    || progressVal >= 100
                    || (backtestNoRunningTicks >= 2 && Boolean(statusReportId || progressVal > 0))
                );
                if ((reportTracked && successLike) || finishedBySnapshot) {
                    closeBacktestStream();
                    if (!backtestResultRecovered) {
                        await recoverBacktestResultFromApi();
                        backtestResultRecovered = true;
                    }
                    setBacktestButtonState(BACKTEST_BTN_STATE.idle);
                    return;
                }
                backtestMonitorErrorCount = 0;
            } catch (e) {
                backtestMonitorErrorCount += 1;
                if (backtestMonitorErrorCount >= 2) {
                    handleBacktestFailure(`状态检测失败: ${e}`);
                    return;
                }
            }
            backtestStatusMonitorTimer = setTimeout(monitorBacktestTaskStatus, 2000);
        }

        async function startBacktestByApi(payload) {
            const res = await fetch('/api/control/start_backtest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const data = await res.json();
            if (String(data.status || '').toLowerCase() !== 'success') {
                throw new Error(data.msg || '启动失败');
            }
            return data;
        }

        async function recoverBacktestResultFromApi(reportId = '') {
            try {
                const targetReportId = String(reportId || currentBacktestReportId || '').trim();
                const reportApi = targetReportId
                    ? `/api/report/${encodeURIComponent(targetReportId)}`
                    : '/api/report/latest';
                const res = await fetch(reportApi);
                const data = await res.json();
                const resultReportId = String(data?.report_id || '').trim();
                if (targetReportId && resultReportId && resultReportId !== targetReportId) return;
                if (data && data.summary) {
                    if (Array.isArray(data.strategy_reports)) {
                        strategyReportsBuffer = data.strategy_reports;
                        renderStrategyReports();
                    }
                    showBacktestResults(data.summary);
                }
            } catch (_) {}
        }

        async function stopBacktest() {
            if (backtestBtnState !== BACKTEST_BTN_STATE.running) return;
            if (backtestStopInFlight) return;
            setBacktestStopPending(true);
            logMessage('回测', '正在强制快速终止...', 'warning');
            try {
                const { res, data } = await fetchJsonWithTimeout('/api/control/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ force_fast: true })
                }, 4000);
                const status = String(data?.status || '').toLowerCase();
                const released = Boolean(data?.cleanup_state?.released_task_ref);
                if (res.ok && (status === 'success' || status === 'info')) {
                    closeBacktestStream();
                    setBacktestButtonState(BACKTEST_BTN_STATE.idle);
                    if (released) {
                        logMessage('回测', data?.msg || '已强制快速终止', 'warning');
                    } else {
                        logMessage('回测', '终止请求已受理，后端仍在清理中（前端已释放操作）', 'warning');
                    }
                    syncStatus();
                } else {
                    logMessage('回测', data?.msg || `终止失败(${res.status})`, 'danger');
                    setBacktestStopPending(false);
                }
            } catch (e) {
                const msg = String(e?.message || e || '');
                if (msg.includes('aborted')) {
                    closeBacktestStream();
                    setBacktestButtonState(BACKTEST_BTN_STATE.idle);
                    logMessage('回测', '终止请求超时，前端已释放操作；后台将继续清理', 'warning');
                    syncStatus();
                } else {
                    logMessage('回测', `终止失败: ${e}`, 'danger');
                    setBacktestStopPending(false);
                }
            }
        }

        async function startBacktest() {
            if (backtestBtnState === BACKTEST_BTN_STATE.running) {
                await stopBacktest();
                return;
            }
            const overlay = document.getElementById('backtest-overlay');
            if (overlay) overlay.classList.remove('active');
            strategyReportsBuffer = [];
            DIAG_STATE.backtestSummaryWinRate = null;
            DIAG_STATE.backtestReportWinRate = null;
            backtestResultRecovered = false;
            backtestStreamClosed = false;
            document.getElementById('bt-strategy-reports').innerHTML = '';
            
            const code = normalizeCode(document.getElementById('stock-search-input').value || '600036.SH');
            const picked = Array.isArray(selectedStrategyIds) ? selectedStrategyIds.slice() : [];
            if (!picked.length) {
                logMessage('回测', '未选择策略，已取消回测提交', 'warning');
                const txt = document.getElementById('backtest-status-text');
                if (txt) txt.innerText = '未选择策略';
                return;
            }
            const strategy = picked.length === strategyCatalog.length ? 'all' : String(picked[0]);
            const range = document.getElementById('bt-range-select')?.value || '1y';
            const capitalRaw = Number(document.getElementById('bt-capital-input')?.value || 1000000);
            const capital = Number.isFinite(capitalRaw) && capitalRaw >= 10000 ? Math.floor(capitalRaw) : 1000000;
            const dates = getBacktestDateRange(range);
            if (!dates) return;
            currentBacktestChartCtx = { stock: code, start: dates.start, end: dates.end };
            klineLastProgressDate = null;
            klineHasRenderedData = false;
            klineRealtimeMarkers = [];
            const klineBtn = document.getElementById('kline-open-btn');
            if (klineBtn) klineBtn.classList.remove('hidden');
            if (klineModalOpened) {
                refreshKlineModalImage(true, null);
            }
            const periodText = buildStrategyPeriodText(picked);
            logMessage('回测', `开始回测 ${code} (${dates.start}~${dates.end})，资金 ${capital.toLocaleString()}，策略周期：${periodText}`, 'warning');
            logMessage('工部', `数据获取阶段：准备加载 ${code} ${dates.start}~${dates.end} 历史K线`, 'system');
            BT_STATE.progress = 0;
            BT_STATE.totalTrades = 0;
            BT_STATE.approvedSignals = 0;
            BT_STATE.rejectedSignals = 0;
            const txt = document.getElementById('backtest-status-text');
            const dt = document.getElementById('backtest-date-display');
            const bar = document.getElementById('backtest-progress-bar');
            if (txt) txt.innerText = '初始化中...';
            if (dt) dt.innerText = dates.start;
            if (bar) bar.style.width = '0%';
            const timeEl = document.getElementById('war-time');
            if (timeEl) timeEl.innerText = '--';
            currentBacktestReportId = '';
            backtestStartInFlight = true;
            setBacktestButtonState(BACKTEST_BTN_STATE.running);
            try {
                const reqPayload = {
                    stock_code: code,
                    strategy_id: strategy,
                    strategy_ids: picked.length && picked.length !== strategyCatalog.length ? picked : null,
                    combination_config: buildBacktestCombinationConfig(),
                    start: dates.start,
                    end: dates.end,
                    capital: capital
                };
                const startResp = await startBacktestByApi(reqPayload);
                currentBacktestReportId = String(startResp.report_id || '').trim();
                backtestStartInFlight = false;
                logMessage('回测', `任务已提交 report_id=${startResp.report_id || '--'}`, 'system');
            } catch (e) {
                backtestStartInFlight = false;
                currentBacktestReportId = '';
                handleBacktestFailure(`启动失败: ${e}`);
            }
        }

        function getBacktestDateRange(range) {
            const end = new Date();
            const start = new Date(end);
            const currentYearStart = new Date(end.getFullYear(), 0, 1);
            if (range === 'custom') {
                const s = document.getElementById('bt-start-date')?.value;
                const e = document.getElementById('bt-end-date')?.value;
                if (!s || !e) {
                    logMessage('SYSTEM', '请先选择自定义开始/结束日期', 'danger');
                    return null;
                }
                if (s > e) {
                    logMessage('SYSTEM', '自定义区间无效：开始日期不能晚于结束日期', 'danger');
                    return null;
                }
                return { start: s, end: e };
            }
            if (range === '3m') start.setMonth(start.getMonth() - 3);
            else if (range === '6m') start.setMonth(start.getMonth() - 6);
            else if (range === '2y') start.setFullYear(start.getFullYear() - 2);
            else if (range === 'ytd') start.setTime(currentYearStart.getTime());
            else start.setFullYear(start.getFullYear() - 1);
            const fmt = (d) => d.toISOString().slice(0, 10);
            return { start: fmt(start), end: fmt(end) };
        }

        function ensureKlineChart() {
            if (klineChart && klineCandlesSeries && klineVolumeSeries) return true;
            const container = document.getElementById('kline-modal-chart');
            if (!container || !window.LightweightCharts) return false;
            klineChart = LightweightCharts.createChart(container, {
                layout: { background: { color: '#020617' }, textColor: '#cbd5e1' },
                grid: { vertLines: { color: 'rgba(148,163,184,0.1)' }, horzLines: { color: 'rgba(148,163,184,0.1)' } },
                rightPriceScale: { borderColor: '#334155' },
                timeScale: { borderColor: '#334155', timeVisible: true, secondsVisible: false }
            });
            const candleOpt = {
                upColor: '#ef4444',
                downColor: '#22c55e',
                borderVisible: false,
                wickUpColor: '#ef4444',
                wickDownColor: '#22c55e'
            };
            const volumeOpt = {
                priceFormat: { type: 'volume' },
                priceScaleId: 'volume',
                lastValueVisible: false,
                priceLineVisible: false
            };
            if (typeof klineChart.addCandlestickSeries === 'function') {
                klineCandlesSeries = klineChart.addCandlestickSeries(candleOpt);
                klineVolumeSeries = klineChart.addHistogramSeries(volumeOpt);
            } else if (typeof klineChart.addSeries === 'function' && window.LightweightCharts?.CandlestickSeries && window.LightweightCharts?.HistogramSeries) {
                klineCandlesSeries = klineChart.addSeries(LightweightCharts.CandlestickSeries, candleOpt);
                klineVolumeSeries = klineChart.addSeries(LightweightCharts.HistogramSeries, volumeOpt);
            } else {
                return false;
            }
            klineChart.priceScale('right').applyOptions({ scaleMargins: { top: 0.08, bottom: 0.32 } });
            klineChart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });
            return true;
        }

        function renderKlineLegend(items) {
            const legend = document.getElementById('kline-modal-legend');
            if (!legend) return;
            const strategyHtml = (items || []).map(x => `<span class="inline-flex items-center gap-1"><i class="fa-solid fa-circle text-[9px]" style="color:${x.color}"></i>${x.name}</span>`).join('');
            legend.innerHTML = `
                ${strategyHtml || '<span class="text-slate-500">暂无策略标记</span>'}
                <span class="inline-flex items-center gap-1 text-slate-400"><i class="fa-solid fa-arrow-up"></i>买入</span>
                <span class="inline-flex items-center gap-1 text-slate-400"><i class="fa-solid fa-arrow-down"></i>卖出</span>
            `;
        }

        function setKlineRenderMode(mode) {
            const chartEl = document.getElementById('kline-modal-chart');
            const imgEl = document.getElementById('kline-modal-image-fallback');
            if (!chartEl || !imgEl) return;
            if (mode === 'image') {
                chartEl.classList.add('hidden');
                imgEl.classList.remove('hidden');
                return;
            }
            chartEl.classList.remove('hidden');
            imgEl.classList.add('hidden');
        }

        async function setKlineModalLoading(show, text = 'K线加载中...理财有风险，投资需谨慎') {
            const box = document.getElementById('kline-modal-loading');
            const label = document.getElementById('kline-modal-loading-text');
            if (label) label.innerText = text;
            if (!box) return;
            if (show) {
                klineLoadingShownAt = Date.now();
                box.classList.remove('hidden');
                return;
            }
            const minShowMs = 260;
            const waitMs = Math.max(0, minShowMs - (Date.now() - klineLoadingShownAt));
            if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
            box.classList.add('hidden');
        }

        function getKlineCtxKey(ctx) {
            if (!ctx) return '';
            return `${ctx.stock}|${ctx.start}|${ctx.end}`;
        }

        async function preloadKlineModalData(ctx) {
            const key = getKlineCtxKey(ctx);
            if (!key) return;
            if (klinePreloadKey === key && klinePreloadPayload) return;
            if (klinePreloadInFlightPromise && klinePreloadInFlightKey === key) return klinePreloadInFlightPromise;
            const now = Date.now();
            if ((now - klinePreloadLastRequestAt) < 900) return;
            klinePreloadLastRequestAt = now;
            klinePreloadInFlightKey = key;
            klinePreloadInFlightPromise = (async () => {
                try {
                    const q = `stock=${encodeURIComponent(ctx.stock)}&start=${encodeURIComponent(ctx.start)}&end=${encodeURIComponent(ctx.end)}`;
                    const res = await fetch(`/api/backtest/kline_data?${q}`);
                    if (!res.ok) return;
                    const data = await res.json();
                    if (data.status !== 'success' || !Array.isArray(data.candles) || !data.candles.length) return;
                    klinePreloadKey = key;
                    klinePreloadPayload = data;
                } catch (_) {}
            })();
            try {
                await klinePreloadInFlightPromise;
            } finally {
                if (klinePreloadInFlightKey === key) {
                    klinePreloadInFlightKey = '';
                    klinePreloadInFlightPromise = null;
                }
            }
        }

        function renderKlineChartData(payload) {
            if (!ensureKlineChart()) return;
            setKlineRenderMode('chart');
            const candles = Array.isArray(payload?.candles) ? payload.candles : [];
            const volumes = Array.isArray(payload?.volumes) ? payload.volumes : [];
            const markers = Array.isArray(payload?.markers) ? payload.markers : [];
            if (!candles.length) return;
            klineCandlesSeries.setData(candles);
            klineVolumeSeries.setData(volumes);
            klineRealtimeMarkers = markers.slice();
            if (typeof klineCandlesSeries.setMarkers === 'function') {
                klineCandlesSeries.setMarkers(klineRealtimeMarkers);
            } else if (typeof LightweightCharts?.createSeriesMarkers === 'function') {
                LightweightCharts.createSeriesMarkers(klineCandlesSeries, klineRealtimeMarkers);
            }
            klineChart.timeScale().fitContent();
            renderKlineLegend(payload?.strategies || []);
            klineHasRenderedData = true;
        }

        function upsertRealtimeBacktestTradeMarker(data) {
            if (!klineModalOpened || !currentBacktestChartCtx || !klineCandlesSeries) return;
            const tradeCode = normalizeCode(String(data?.code || ''));
            const ctxCode = normalizeCode(String(currentBacktestChartCtx.stock || ''));
            if (!tradeCode || !ctxCode || tradeCode !== ctxCode) return;
            const direction = String(data?.dir || '').toUpperCase();
            if (direction !== 'BUY' && direction !== 'SELL') return;
            const rawDt = String(data?.dt || '').trim();
            const ts = Date.parse(rawDt.includes(' ') ? rawDt.replace(' ', 'T') : rawDt);
            if (!Number.isFinite(ts)) return;
            const dtObj = new Date(ts);
            const dayText = `${dtObj.getFullYear()}-${String(dtObj.getMonth() + 1).padStart(2, '0')}-${String(dtObj.getDate()).padStart(2, '0')}`;
            const startText = String(currentBacktestChartCtx.start || '');
            const endText = String(currentBacktestChartCtx.end || '');
            if (startText && dayText < startText) return;
            if (endText && dayText > endText) return;
            const sid = String(data?.strategy || '').trim();
            const strategyList = Array.isArray(klinePreloadPayload?.strategies) ? klinePreloadPayload.strategies : [];
            const matchedStrategy = strategyList.find(x => String(x?.id || '') === sid);
            const marker = {
                time: dayText,
                strategy_id: sid,
                position: direction === 'BUY' ? 'belowBar' : 'aboveBar',
                shape: direction === 'BUY' ? 'arrowUp' : 'arrowDown',
                color: String(matchedStrategy?.color || '#60a5fa'),
                text: Number(data?.price || 0).toFixed(2)
            };
            const dup = klineRealtimeMarkers.some(m =>
                String(m?.time || '') === marker.time &&
                String(m?.strategy_id || '') === marker.strategy_id &&
                String(m?.shape || '') === marker.shape &&
                String(m?.text || '') === marker.text
            );
            if (dup) return;
            klineRealtimeMarkers.push(marker);
            if (typeof klineCandlesSeries.setMarkers === 'function') {
                klineCandlesSeries.setMarkers(klineRealtimeMarkers);
            } else if (typeof LightweightCharts?.createSeriesMarkers === 'function') {
                LightweightCharts.createSeriesMarkers(klineCandlesSeries, klineRealtimeMarkers);
            }
        }

        function refreshKlineModalImage(force = false, progressDate = null) {
            if (!klineModalOpened || !currentBacktestChartCtx) return;
            const subtitle = document.getElementById('kline-modal-subtitle');
            const { stock, start, end } = currentBacktestChartCtx;
            if (!stock || !start || !end) return;
            if (!force && progressDate && klineLastProgressDate === String(progressDate)) return;
            if (progressDate) klineLastProgressDate = String(progressDate);
            if (subtitle) subtitle.innerText = `${stock} · 区间 ${start} ~ ${end} · 按回测进度动态绘制${progressDate ? `（${progressDate}）` : ''}`;
            const q = `stock=${encodeURIComponent(stock)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&_t=${Date.now()}`;
            const run = async () => {
                await setKlineModalLoading(true, 'K线加载中...理财有风险，投资需谨慎');
                try {
                    const key = getKlineCtxKey(currentBacktestChartCtx);
                    if (key && key === klinePreloadInFlightKey && klinePreloadInFlightPromise) {
                        await klinePreloadInFlightPromise;
                    }
                    if (key && key === klinePreloadKey && klinePreloadPayload && !force) {
                        renderKlineChartData(klinePreloadPayload);
                        await setKlineModalLoading(false);
                        return;
                    }
                    const res = await fetch(`/api/backtest/kline_data?${q}`);
                    if (!res.ok) {
                        if (res.status === 404 && !klineHasRenderedData) {
                            setKlineRenderMode('image');
                            const img = document.getElementById('kline-modal-image-fallback');
                            if (img) img.src = `/api/backtest/kline_chart?${q}`;
                        }
                        await setKlineModalLoading(false);
                        return;
                    }
                    const data = await res.json();
                    if (data.status !== 'success' || !Array.isArray(data.candles) || data.candles.length === 0) {
                        if (!klineHasRenderedData) {
                            setKlineRenderMode('image');
                            const img = document.getElementById('kline-modal-image-fallback');
                            if (img) img.src = `/api/backtest/kline_chart?${q}`;
                        }
                        await setKlineModalLoading(false);
                        return;
                    }
                    renderKlineChartData(data);
                    klinePreloadKey = getKlineCtxKey(currentBacktestChartCtx);
                    klinePreloadPayload = data;
                    await setKlineModalLoading(false);
                } catch (_) {
                    if (!klineHasRenderedData) {
                        setKlineRenderMode('image');
                        const img = document.getElementById('kline-modal-image-fallback');
                        if (img) img.src = `/api/backtest/kline_chart?${q}`;
                    }
                    await setKlineModalLoading(false);
                }
            };
            if (force) return run();
            if (klineModalTimer) return;
            klineModalTimer = setTimeout(() => {
                klineModalTimer = null;
                run();
            }, 600);
        }

        function buildBacktestChartCtxFromForm() {
            const code = normalizeCode(document.getElementById('stock-search-input')?.value || '600036.SH');
            const range = document.getElementById('bt-range-select')?.value || '1y';
            let dates = null;
            if (range === 'custom') {
                const s = String(document.getElementById('bt-start-date')?.value || '');
                const e = String(document.getElementById('bt-end-date')?.value || '');
                if (s && e && s <= e) dates = { start: s, end: e };
            } else {
                dates = getBacktestDateRange(range);
            }
            if (!dates || !code) return null;
            return { stock: code, start: dates.start, end: dates.end };
        }

        function openKlineModal() {
            if (!currentBacktestChartCtx) {
                currentBacktestChartCtx = buildBacktestChartCtxFromForm();
            }
            if (!currentBacktestChartCtx) {
                logMessage('SYSTEM', '无法打开K线：缺少有效回测区间', 'danger');
                return;
            }
            klineModalOpened = true;
            setKlineModalLoading(true, 'K线加载中...理财有风险，投资需谨慎');
            const modal = document.getElementById('kline-modal');
            const title = document.getElementById('kline-modal-title');
            const container = document.getElementById('kline-modal-chart');
            if (title) title.innerText = `日K线与成交量 · ${currentBacktestChartCtx.stock || '--'}`;
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
            if (ensureKlineChart() && container && klineChart) {
                klineChart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
            }
            refreshKlineModalImage(true);
        }

        function closeKlineModal() {
            klineModalOpened = false;
            const modal = document.getElementById('kline-modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        }

        function onBacktestRangeChange(value) {
            const custom = document.getElementById('bt-custom-range');
            if (!custom) return;
            if (value === 'custom') {
                custom.classList.remove('hidden');
                custom.classList.add('flex');
            } else {
                custom.classList.add('hidden');
                custom.classList.remove('flex');
            }
            persistConsoleState();
            scheduleStrategyRegimeHintRefresh(true);
        }

        function getPatternThumbUrl(item) {
            const key = `${item.stockCode}|${item.start}|${item.end}`;
            if (!patternKlineCache[key]) {
                const q = `stock=${encodeURIComponent(item.stockCode)}&start=${encodeURIComponent(item.start)}&end=${encodeURIComponent(item.end)}`;
                patternKlineCache[key] = `/api/backtest/kline_thumb?${q}`;
            }
            return patternKlineCache[key];
        }

        function getPatternThumbStatusUrl(item) {
            const q = `stock=${encodeURIComponent(item.stockCode)}&start=${encodeURIComponent(item.start)}&end=${encodeURIComponent(item.end)}`;
            return `/api/backtest/kline_thumb_status?${q}`;
        }

        async function refreshPatternThumbReadiness() {
            const modal = document.getElementById('pattern-picker-modal');
            if (!modal || modal.classList.contains('hidden')) {
                stopPatternThumbStatusPolling();
                return;
            }
            const pendingItems = CLASSIC_PATTERNS.filter(item => !patternThumbReadyMap[item.id]);
            if (pendingItems.length === 0) {
                if (patternThumbStatusTimer) {
                    clearInterval(patternThumbStatusTimer);
                    patternThumbStatusTimer = null;
                }
                return;
            }
            await Promise.all(pendingItems.map(async item => {
                try {
                    const res = await fetch(getPatternThumbStatusUrl(item));
                    const data = await res.json();
                    const ready = data && data.status === 'success' && !!data.ready;
                    const img = document.getElementById(`pattern-kline-${item.id}`);
                    if (!img) return;
                    if (ready) {
                        patternThumbReadyMap[item.id] = true;
                        img.style.objectFit = 'cover';
                        const sep = getPatternThumbUrl(item).includes('?') ? '&' : '?';
                        img.src = `${getPatternThumbUrl(item)}${sep}_ts=${Date.now()}`;
                    } else {
                        img.style.objectFit = 'contain';
                    }
                } catch (_) {
                }
            }));
        }

        function startPatternThumbStatusPolling() {
            if (patternThumbStatusTimer) {
                clearInterval(patternThumbStatusTimer);
                patternThumbStatusTimer = null;
            }
            refreshPatternThumbReadiness();
            patternThumbStatusTimer = setInterval(refreshPatternThumbReadiness, 1500);
        }

        function stopPatternThumbStatusPolling() {
            if (!patternThumbStatusTimer) return;
            clearInterval(patternThumbStatusTimer);
            patternThumbStatusTimer = null;
        }

        function applyPatternSelection(item) {
            const stockInput = document.getElementById('stock-search-input');
            const rangeSelect = document.getElementById('bt-range-select');
            const startInput = document.getElementById('bt-start-date');
            const endInput = document.getElementById('bt-end-date');
            if (stockInput) stockInput.value = String(item.stockCode || '');
            if (rangeSelect) {
                rangeSelect.value = 'custom';
                onBacktestRangeChange('custom');
            }
            if (startInput) startInput.value = String(item.start || '');
            if (endInput) endInput.value = String(item.end || '');
            persistConsoleState();
            closePatternPicker();
            logMessage('SYSTEM', `已选择经典形态：${item.patternName}（${item.stockCode} ${item.start}~${item.end}）`, 'system');
            scheduleStrategyRegimeHintRefresh(true);
        }

        async function renderPatternPickerGrid() {
            const wrap = document.getElementById('pattern-picker-grid');
            if (!wrap) return;
            wrap.innerHTML = CLASSIC_PATTERNS.map(item => `
                <label class="bg-slate-800/60 border border-slate-700 rounded p-2 flex flex-col gap-2 cursor-pointer hover:border-cyan-500">
                    <div class="flex items-center gap-2">
                        <input type="radio" name="classic-pattern-radio" value="${item.id}" />
                        <span class="text-[11px] text-slate-300">${item.patternName}</span>
                    </div>
                    <img id="pattern-kline-${item.id}" src="${getPatternThumbUrl(item)}" class="w-full h-[110px] object-cover bg-slate-950 border border-slate-700 rounded" alt="${item.patternName}" />
                    <div class="text-[10px] text-slate-400 leading-4">
                        <div>形态名称：${item.patternName}</div>
                        <div>股票名称：${item.stockName}</div>
                        <div>股票代码：${item.stockCode}</div>
                        <div>开始日期：${item.start}</div>
                        <div>结束日期：${item.end}</div>
                    </div>
                </label>
            `).join('');
            const radios = wrap.querySelectorAll('input[type="radio"][name="classic-pattern-radio"]');
            radios.forEach(r => {
                r.addEventListener('change', () => {
                    if (!r.checked) return;
                    const item = CLASSIC_PATTERNS.find(x => x.id === r.value);
                    if (item) applyPatternSelection(item);
                });
            });
            CLASSIC_PATTERNS.forEach(item => {
                const img = document.getElementById(`pattern-kline-${item.id}`);
                if (!img) return;
                img.onerror = () => {
                    img.alt = '经典形态缩略图加载中';
                    img.style.objectFit = 'contain';
                };
            });
        }

        function openPatternPicker() {
            const modal = document.getElementById('pattern-picker-modal');
            if (modal) modal.classList.remove('hidden');
            if (!patternPickerRendered) {
                patternPickerRendered = true;
                renderPatternPickerGrid();
            }
            startPatternThumbStatusPolling();
        }

        function closePatternPicker() {
            const modal = document.getElementById('pattern-picker-modal');
            if (modal) modal.classList.add('hidden');
            stopPatternThumbStatusPolling();
        }
        
        function updateBacktestProgress(data) {
            const { progress, current_date } = data;
            const phase = String(data.phase || '');
            const phaseLabel = String(data.phase_label || '');
            const isDataFetch = phase === 'data_fetch';
            const klineBtn = document.getElementById('kline-open-btn');
            if (klineBtn) klineBtn.classList.remove('hidden');
            if (!currentBacktestChartCtx) {
                const fallbackCtx = buildBacktestChartCtxFromForm();
                if (fallbackCtx) currentBacktestChartCtx = fallbackCtx;
            }
            if (currentBacktestChartCtx) {
                const preloadKey = getKlineCtxKey(currentBacktestChartCtx);
                if (preloadKey && (!klinePreloadPayload || klinePreloadKey !== preloadKey)) {
                    preloadKlineModalData(currentBacktestChartCtx);
                }
            }
            const bar = document.getElementById('backtest-progress-bar');
            const txt = document.getElementById('backtest-status-text');
            const dt = document.getElementById('backtest-date-display');
            const p = Number(progress || 0);
            const prevProgress = Number(BT_STATE.progress || 0);
            const nextProgress = Math.max(BT_STATE.progress, Math.max(0, Math.min(100, p)));
            BT_STATE.progress = nextProgress;
            if (bar) bar.style.width = `${nextProgress}%`;
            if (txt) {
                if (isDataFetch) {
                    txt.innerText = `历史数据准备中 ${nextProgress}%${phaseLabel ? ` · ${phaseLabel}` : ''}`;
                } else {
                    txt.innerText = `回测推进中 ${nextProgress}%`;
                }
            }
            if (dt) dt.innerText = current_date || '--';
            if (isDataFetch) {
                logMessage('工部', `数据准备 ${nextProgress}%${phaseLabel ? ` · ${phaseLabel}` : ''} · 区间 ${current_date || '--'}`, 'system');
                return;
            }
            if (nextProgress >= prevProgress + 10 || nextProgress === 100) {
                logMessage('回测', `进度 ${nextProgress}% · 当前时间 ${current_date || '--'} · 交易 ${BT_STATE.totalTrades}`, 'warning');
            }
            if (nextProgress > 0 && nextProgress < 100) {
                const heat = Math.min(100, Math.max(0, BT_STATE.approvedSignals - BT_STATE.rejectedSignals + 50));
                const temp = document.getElementById('rites-market-temp');
                if (temp) temp.innerText = `🔥 ${Math.round(heat)}（回测）`;
            }
        }

        const MINISTRY_FLASH_CLASS_BY_ID = {
            'panel-zhongshu': 'ministry-border-flash-zhongshu',
            'panel-menxia': 'ministry-border-flash-menxia',
            'panel-shangshu': 'ministry-border-flash-shangshu'
        };

        const panelPulseTimers = new Map();

        function pulsePanel(id) {
            const el = document.getElementById(id);
            if (!el) return;
            const ministryClass = MINISTRY_FLASH_CLASS_BY_ID[id];
            if (ministryClass) {
                el.classList.remove('ministry-border-flash', ministryClass);
                void el.offsetWidth;
                el.classList.add('ministry-border-flash', ministryClass);
                const prevTimer = panelPulseTimers.get(id);
                if (prevTimer) clearTimeout(prevTimer);
                const timer = setTimeout(() => {
                    el.classList.remove('ministry-border-flash', ministryClass);
                    panelPulseTimers.delete(id);
                }, 700);
                panelPulseTimers.set(id, timer);
                return;
            }
            el.classList.add('ring-2', 'ring-purple-400', 'shadow-[0_0_16px_rgba(168,85,247,0.45)]');
            setTimeout(() => {
                el.classList.remove('ring-2', 'ring-purple-400', 'shadow-[0_0_16px_rgba(168,85,247,0.45)]');
            }, 500);
        }

        function renderBacktestFlow(data) {
            const module = data.module || '回测';
            const msg = data.msg || '';
            const type = data.level || 'system';
            logMessage(module, msg, type);
            if (data.module === '太子院') pulsePanel('panel-li');
            if (data.module === '中书省') pulsePanel('panel-zhongshu');
            if (data.module === '中书省') pulsePanel('panel-li');
            if (data.module === '门下省') pulsePanel('panel-menxia');
            if (data.module === '门下省') pulsePanel('panel-xing');
            if (data.module === '尚书省') pulsePanel('panel-shangshu');
            if (data.module === '尚书省') pulsePanel('panel-bing');
            if (data.module === '户部') pulsePanel('panel-hu');
            if (data.module === '工部') pulsePanel('panel-gong');
            if (data.module === '吏部') pulsePanel('panel-li');
            if (data.module === '礼部') pulsePanel('panel-li-rites');
            if (data.module === '兵部') pulsePanel('panel-bing');
            DIAG_STATE.signalConsistency = Math.max(20, Math.min(99, 50 + BT_STATE.approvedSignals - BT_STATE.rejectedSignals));
            updateConfidenceScore();
        }

        function renderBacktestTrade(data) {
            const dir = data.dir || '--';
            const code = data.code || '--';
            const price = Number(data.price || 0).toFixed(2);
            const qty = data.qty || 0;
            const strategy = data.strategy || '--';
            const tradeDt = formatDateTime(data.dt);
            const dirText = dir === 'BUY' ? '买入' : (dir === 'SELL' ? '卖出' : dir);
            const actionEl = document.getElementById('war-action');
            if (actionEl) {
                actionEl.innerText = dirText;
                actionEl.className = `font-bold ${dir === 'BUY' ? 'text-trading-green' : 'text-trading-red'}`;
            }
            setMetricText('war-price', price, Number(price));
            const timeEl = document.getElementById('war-time');
            if (timeEl) timeEl.innerText = tradeDt;
            BT_STATE.totalTrades += 1;
            pulsePanel('panel-shangshu');
            pulsePanel('panel-bing');
            logMessage('尚书省', `[${strategy}] ${dirText} ${code} @ ${price} x ${qty}`, dir === 'BUY' ? 'success' : 'warning');
            updateConfidenceScore();
        }

        function renderLiveTradeExec(data) {
            const dirRaw = String(data?.direction || '--').toUpperCase();
            const dirText = dirRaw === 'BUY' ? '买入' : (dirRaw === 'SELL' ? '卖出' : dirRaw);
            const priceNum = Number(data?.actual_price ?? data?.price ?? 0);
            const qty = Number(data?.qty || 0);
            const strategy = String(data?.strategy_id || '--');
            const tradeTime = String(data?.time || data?.dt || '--');
            const actionEl = document.getElementById('war-action');
            if (actionEl) {
                actionEl.innerText = dirText;
                actionEl.className = `font-bold ${dirRaw === 'BUY' ? 'text-trading-green' : (dirRaw === 'SELL' ? 'text-trading-red' : 'text-slate-300')}`;
            }
            if (Number.isFinite(priceNum) && priceNum > 0) {
                setMetricText('war-price', priceNum.toFixed(2), priceNum);
            } else {
                setMetricText('war-price', '--', null);
            }
            const timeEl = document.getElementById('war-time');
            if (timeEl) timeEl.innerText = tradeTime;
            if (dirRaw === 'BUY' || dirRaw === 'SELL') {
                const priceText = Number.isFinite(priceNum) && priceNum > 0 ? priceNum.toFixed(2) : '--';
                logMessage('尚书省', `[${strategy}] ${dirText} @ ${priceText} x ${qty || '--'} (${tradeTime})`, dirRaw === 'BUY' ? 'success' : 'warning');
            }
        }

        function updateMinistryTick(data) {
            let latestCash = null;
            if (data.cash !== undefined) {
                const cashNum = Number(data.cash);
                setMetricText('revenue-cash', cashNum.toLocaleString(), cashNum);
                latestCash = cashNum;
            }
            updateRevenueCashRatioBar(latestCash, null);
            if (data.available_pos_pct !== undefined) {
                const apNum = Number(data.available_pos_pct);
                setMetricText('personnel-available-pos', `${apNum.toFixed(1)}%`, apNum);
            }
            if (data.main_strategy) {
                const ms = document.getElementById('personnel-main-strategy');
                if (ms) {
                    const sid = String(data.main_strategy || '').trim();
                    const fromCatalog = strategyCatalog.find(s => String(s.id) === sid)?.name;
                    const fromGuide = (STRATEGY_GUIDE[sid] && STRATEGY_GUIDE[sid].name) ? STRATEGY_GUIDE[sid].name : '';
                    ms.innerText = fromCatalog || fromGuide || sid || '--';
                }
            }
            if (data.drawdown_pct !== undefined) {
                const dd = document.getElementById('justice-dd-current');
                if (dd) {
                    const ddNum = Number(data.drawdown_pct);
                    setMetricText('justice-dd-current', `${ddNum.toFixed(2)}%`, ddNum);
                    dd.className = 'font-mono text-trading-green';
                }
            }
            if (data.compliance_status) {
                const c = document.getElementById('rites-compliance-status');
                if (c) {
                    if (data.compliance_status === 'PASS') {
                        c.innerText = '通过';
                        c.className = 'text-trading-green';
                    } else if (data.compliance_status === 'REJECT') {
                        c.innerText = '驳回';
                        c.className = 'text-trading-red';
                    } else {
                        c.innerText = '--';
                        c.className = 'text-slate-400';
                    }
                }
            }
        }

        function buildStrategyPeriodText(ids) {
            const allIds = Array.isArray(ids) && ids.length ? ids : strategyCatalog.map(s => String(s.id));
            const uniq = Array.from(new Set(allIds));
            return uniq.map(id => `${id}:${toZhTimeframe((STRATEGY_GUIDE[id] || STRATEGY_GUIDE.all).trigger || '--')}`).join('，');
        }

        function openStrategyDocs() {
            const overlay = document.getElementById('strategy-doc-overlay');
            const selector = document.getElementById('strategy-doc-selector');
            const current = selectedStrategyIds.length === 1 ? String(selectedStrategyIds[0]) : 'all';
            if (selector) selector.value = current in STRATEGY_GUIDE ? current : 'all';
            renderStrategyDoc(selector?.value || 'all');
            if (overlay) overlay.classList.add('active');
        }

        function closeStrategyDocs() {
            const overlay = document.getElementById('strategy-doc-overlay');
            if (overlay) overlay.classList.remove('active');
        }

        function renderStrategyDoc(strategyId) {
            const target = document.getElementById('strategy-doc-content');
            if (!target) return;
            const renderList = (arr) => {
                const list = Array.isArray(arr) ? arr : [];
                if (!list.length) return '<div class="text-slate-500 text-xs">无</div>';
                return `<ul class="list-disc pl-5 space-y-1 text-slate-300 text-xs">${list.map(x => `<li>${x}</li>`).join('')}</ul>`;
            };
            if (strategyId === 'all') {
                const ids = ['01','02','03','04','05','06','07','08','09'];
                target.innerHTML = ids.map(id => {
                    const d = STRATEGY_GUIDE[id];
                    return `<div class="bg-slate-800/70 border border-slate-700 rounded p-3">
                        <div class="text-white font-bold mb-1">${d.name}</div>
                        <div class="text-slate-400 text-[11px] mb-1">使用数据周期：${toZhTimeframe(d.trigger || '--')}</div>
                        <div class="text-slate-300 text-xs">入场规则：${(d.entry_rules && d.entry_rules[0]) || '无'}</div>
                        <div class="text-slate-300 text-xs mt-1">离场规则：${(d.exit_rules && d.exit_rules[0]) || '无'}</div>
                        <div class="text-slate-500 text-[11px] mt-1">${d.example || ''}</div>
                    </div>`;
                }).join('');
                return;
            }
            const d = STRATEGY_GUIDE[strategyId] || STRATEGY_GUIDE.all;
            target.innerHTML = `<div class="bg-slate-800/70 border border-slate-700 rounded p-4">
                <div class="text-white text-base font-bold mb-2">${d.name}</div>
                <div class="text-slate-400 text-xs mb-2">使用数据周期：${toZhTimeframe(d.trigger || '--')}</div>
                <div class="text-slate-200 text-sm font-semibold mb-1">入场规则</div>
                ${renderList(d.entry_rules)}
                <div class="text-slate-200 text-sm font-semibold mb-1 mt-3">离场规则</div>
                ${renderList(d.exit_rules)}
                <div class="text-slate-200 text-sm font-semibold mb-1 mt-3">关键参数</div>
                ${renderList(d.params)}
                <div class="text-slate-300 text-sm mt-3"><span class="text-slate-400">说明：</span>${d.note || '--'}</div>
                <div class="text-slate-300 text-sm mt-2"><span class="text-slate-400">示例：</span>${d.example || '--'}</div>
            </div>`;
        }

        function updateStrategyQuick(strategyId) {
            const sid = String(strategyId || '');
            const name = document.getElementById('strategy-quick-name');
            const logic = document.getElementById('strategy-quick-logic');
            const example = document.getElementById('strategy-quick-example');
            const details = document.getElementById('strategy-quick-details');
            const selected = selectedStrategyIds.length ? selectedStrategyIds.slice() : (sid && sid !== 'all' ? [sid] : []);
            const selectedRows = selected
                .map(id => strategyManagerRows.find(x => String(x.id || '') === String(id)))
                .filter(x => !!x);
            if (selected.length > 1 && selectedRows.length) {
                const sources = new Set(selectedRows.map(x => String(x.source_label || '--')));
                if (name) name.innerText = `已选 ${selected.length} 个策略`;
                if (logic) logic.innerText = `聚合摘要：来源 ${Array.from(sources).join(' / ')}；优先按策略管理器“策略详情说明”展示。`;
                if (example) example.innerText = '下方可展开查看每个策略明细（A方案：聚合摘要 + 折叠明细）';
                if (details) {
                    details.innerHTML = selectedRows.map(r => {
                        const rid = String(r.id || '--');
                        const rname = String(r.name || rid);
                        const sourceLabel = String(r.source_label || '--');
                        const requirementTitle = String(r.raw_requirement_title || '原始需求');
                        const analysisHtml = renderMarkdownReadonly(r.analysis_text || '--');
                        const requirementHtml = renderMarkdownReadonly(r.raw_requirement || '--');
                        return `<details class="bg-slate-900/60 border border-slate-700 rounded p-2">
                            <summary class="cursor-pointer text-[11px] text-slate-200 font-semibold">[${rid}] ${rname} · ${sourceLabel}</summary>
                            <div class="mt-2 text-[11px] text-slate-200">
                                <div class="text-slate-400 mb-1">策略详情说明</div>
                                <div class="bg-slate-950 border border-slate-700 rounded p-2">${analysisHtml}</div>
                                <div class="text-slate-400 mt-2 mb-1">${requirementTitle}</div>
                                <div class="bg-slate-950 border border-slate-700 rounded p-2">${requirementHtml}</div>
                            </div>
                        </details>`;
                    }).join('');
                }
                scheduleStrategyRegimeHintRefresh();
                return;
            }
            if (details) details.innerHTML = '';
            const fromManager = strategyManagerRows.find(x => String(x.id || '') === sid);
            const d = STRATEGY_GUIDE[sid] || STRATEGY_GUIDE.all;
            if (fromManager) {
                if (name) name.innerText = `[${sid}] ${fromManager.name || d.name}`;
                if (logic) logic.innerText = String(fromManager.analysis_text || '--');
                if (example) example.innerText = `需求：${String(fromManager.raw_requirement_title || '原始需求')} · ${String(fromManager.raw_requirement || '--')}`;
                scheduleStrategyRegimeHintRefresh();
                return;
            }
            if (name) name.innerText = d.name;
            if (logic) logic.innerText = `入场：${(d.entry_rules && d.entry_rules[0]) || '无'} 离场：${(d.exit_rules && d.exit_rules[0]) || '无'}`;
            if (example) example.innerText = d.example || '';
            scheduleStrategyRegimeHintRefresh();
        }

        function classifyRegimeByCandles(candles) {
            const closes = (Array.isArray(candles) ? candles : []).map(x => Number(x?.close)).filter(x => Number.isFinite(x) && x > 0);
            const highs = (Array.isArray(candles) ? candles : []).map(x => Number(x?.high)).filter(x => Number.isFinite(x) && x > 0);
            const lows = (Array.isArray(candles) ? candles : []).map(x => Number(x?.low)).filter(x => Number.isFinite(x) && x > 0);
            if (closes.length < 20 || highs.length < 20 || lows.length < 20) {
                return { label: '数据不足', er: null, ret: null, rangeRatio: null, suggestion: '--', badgeClass: 'border-slate-600 text-slate-300' };
            }
            const first = closes[0];
            const last = closes[closes.length - 1];
            const ret = first > 0 ? (last - first) / first : 0;
            let path = 0;
            for (let i = 1; i < closes.length; i++) path += Math.abs(closes[i] - closes[i - 1]);
            const er = path > 0 ? Math.abs(last - first) / path : 0;
            const hi = Math.max(...highs);
            const lo = Math.min(...lows);
            const rangeRatio = (hi - lo) / Math.max(last, 1e-9);
            if (er >= 0.30 && Math.abs(ret) >= 0.10) {
                return { label: '强势趋势', er, ret, rangeRatio, suggestion: '建议仓位：1.0x（34R1进攻）', badgeClass: 'border-emerald-500 text-emerald-300' };
            }
            if (er <= 0.18 && Math.abs(ret) <= 0.06) {
                return { label: '震荡整理', er, ret, rangeRatio, suggestion: '建议仓位：≤0.3x（降仓或切防守）', badgeClass: 'border-amber-500 text-amber-300' };
            }
            return { label: '弱趋势', er, ret, rangeRatio, suggestion: '建议仓位：0.5x~0.7x（谨慎参与）', badgeClass: 'border-sky-500 text-sky-300' };
        }

        function renderStrategyRegimeHint(result, ctx, appliesTo34R1) {
            const regimeEl = document.getElementById('strategy-quick-regime');
            const badgeEl = document.getElementById('strategy-quick-regime-badge');
            const posEl = document.getElementById('strategy-quick-position');
            const metricsEl = document.getElementById('strategy-quick-regime-metrics');
            if (!regimeEl || !badgeEl || !posEl || !metricsEl) return;
            const label = String(result?.label || '--');
            regimeEl.innerText = `当前分层：${label}${ctx ? `（${ctx.stock} ${ctx.start}~${ctx.end}）` : ''}`;
            badgeEl.className = `px-1.5 py-0.5 rounded text-[10px] border ${result?.badgeClass || 'border-slate-600 text-slate-300'}`;
            badgeEl.innerText = label;
            if (appliesTo34R1) {
                posEl.innerText = String(result?.suggestion || '建议仓位：--');
                posEl.className = 'text-[11px] text-emerald-300';
            } else {
                posEl.innerText = `建议仓位：${String(result?.suggestion || '--')}（当前未单选34R1，仅作参考）`;
                posEl.className = 'text-[11px] text-slate-300';
            }
            const erTxt = Number.isFinite(result?.er) ? result.er.toFixed(3) : '--';
            const retTxt = Number.isFinite(result?.ret) ? `${(result.ret * 100).toFixed(2)}%` : '--';
            const rrTxt = Number.isFinite(result?.rangeRatio) ? `${(result.rangeRatio * 100).toFixed(2)}%` : '--';
            metricsEl.innerText = `ER ${erTxt} | 区间收益 ${retTxt} | 波动幅度 ${rrTxt}`;
            strategyRegimeSnapshot = { result, ctx, ts: Date.now() };
            if (Array.isArray(strategyManagerRows) && strategyManagerRows.length) {
                renderStrategyManagerList(strategyManagerRows);
            }
        }

        async function updateStrategyRegimeHint(force = false) {
            const ctx = buildBacktestChartCtxFromForm() || currentBacktestChartCtx;
            const selected = Array.isArray(selectedStrategyIds) ? selectedStrategyIds.map(x => String(x)) : [];
            const appliesTo34R1 = selected.includes('34R1');
            const emptyResult = { label: '待判定', er: null, ret: null, rangeRatio: null, suggestion: '--', badgeClass: 'border-slate-600 text-slate-300' };
            if (!ctx || !ctx.stock || !ctx.start || !ctx.end) {
                renderStrategyRegimeHint(emptyResult, null, appliesTo34R1);
                return;
            }
            const key = `${ctx.stock}|${ctx.start}|${ctx.end}`;
            const now = Date.now();
            if (!force && key === strategyRegimeLastKey && (now - strategyRegimeLastAt) < 45000) return;
            strategyRegimeLastKey = key;
            strategyRegimeLastAt = now;
            try {
                const q = `stock=${encodeURIComponent(ctx.stock)}&start=${encodeURIComponent(ctx.start)}&end=${encodeURIComponent(ctx.end)}`;
                const res = await fetch(`/api/backtest/kline_data?${q}`);
                if (!res.ok) {
                    renderStrategyRegimeHint({ ...emptyResult, label: '数据异常' }, ctx, appliesTo34R1);
                    return;
                }
                const data = await res.json();
                if (data.status !== 'success' || !Array.isArray(data.candles) || !data.candles.length) {
                    renderStrategyRegimeHint({ ...emptyResult, label: '无K线数据' }, ctx, appliesTo34R1);
                    return;
                }
                const result = classifyRegimeByCandles(data.candles);
                renderStrategyRegimeHint(result, ctx, appliesTo34R1);
            } catch (_) {
                renderStrategyRegimeHint({ ...emptyResult, label: '判定失败' }, ctx, appliesTo34R1);
            }
        }

        function scheduleStrategyRegimeHintRefresh(force = false) {
            if (strategyRegimeHintTimer) clearTimeout(strategyRegimeHintTimer);
            strategyRegimeHintTimer = setTimeout(() => {
                strategyRegimeHintTimer = null;
                updateStrategyRegimeHint(force);
            }, 200);
        }
        
        function showBacktestResults(data) {
            const txt = document.getElementById('backtest-status-text');
            const dt = document.getElementById('backtest-date-display');
            const bar = document.getElementById('backtest-progress-bar');
            if (txt) txt.innerText = '回测完成 100%';
            if (dt) dt.innerText = '已完成';
            if (bar) bar.style.width = '100%';
            const selected = selectedStrategyIds.length ? selectedStrategyIds : strategyCatalog.map(s => String(s.id));
            logMessage('回测', `回测完成：${data.stock}，策略周期：${buildStrategyPeriodText(selected)}`, 'success');
            
            // Fill Data
            document.getElementById('bt-code').innerText = data.stock;
            document.getElementById('bt-period').innerText = data.period;
            document.getElementById('bt-trades').innerText = data.total_trades;
            DIAG_STATE.backtestSummaryWinRate = computeWeightedWinRate(data.ranking, 'win_rate', 'total_trades');
            updateConfidenceScore();
            
            fetchGlobalStrategies();

            const best = data.ranking[0];
            if (best) {
                document.getElementById('bt-best-strat').innerText = `[${best.strategy_id}]`;
                document.getElementById('bt-calmar').innerText = parseFloat(best.calmar).toFixed(2);
                document.getElementById('bt-roi').innerText = (parseFloat(best.annualized_roi) * 100).toFixed(2) + '%';
            }
            
            // Fill Table
            const tbody = document.getElementById('bt-ranking-body');
            tbody.innerHTML = '';
            
            data.ranking.forEach(row => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-700/50 transition-colors';
                
                // Colorize Rating
                let ratingColor = 'text-slate-400';
                if(row.rating.includes('A')) ratingColor = 'text-trading-green font-bold';
                if(row.rating.includes('S')) ratingColor = 'text-trading-yellow font-bold text-lg';
                
                tr.innerHTML = `
                    <td class="px-3 py-2 text-slate-400">#${row.rank}</td>
                    <td class="px-3 py-2 font-bold text-white">${row.strategy_id}</td>
                    <td class="px-3 py-2 text-slate-300">${toZhTimeframe((STRATEGY_GUIDE[row.strategy_id] || STRATEGY_GUIDE.all).trigger || '--')}</td>
                    <td class="px-3 py-2 ${ratingColor}">${row.rating}</td>
                    <td class="px-3 py-2 text-trading-yellow">${(row.annualized_roi * 100).toFixed(2)}%</td>
                    <td class="px-3 py-2 text-trading-red">${(row.max_dd * 100).toFixed(2)}%</td>
                    <td class="px-3 py-2">${(row.win_rate * 100).toFixed(1)}%</td>
                    <td class="px-3 py-2 text-trading-blue">${parseFloat(row.calmar).toFixed(2)}</td>
                `;
                tbody.appendChild(tr);
            });

            renderStrategyReports();
        }

        function upsertStrategyReport(report) {
            const idx = strategyReportsBuffer.findIndex(r => r.strategy_id === report.strategy_id);
            if (idx >= 0) {
                strategyReportsBuffer[idx] = report;
            } else {
                strategyReportsBuffer.push(report);
            }
            DIAG_STATE.backtestReportWinRate = computeWeightedWinRate(strategyReportsBuffer, 'win_rate', 'trade_count');
            updateConfidenceScore();
            renderStrategyReports();
        }

        function renderStrategyReports() {
            const wrap = document.getElementById('bt-strategy-reports');
            if (!wrap) return;
            wrap.innerHTML = '';
            strategyReportsBuffer
                .sort((a, b) => String(a.strategy_id).localeCompare(String(b.strategy_id)))
                .forEach(r => {
                    const card = document.createElement('div');
                    card.className = 'bg-slate-800/50 border border-slate-700 rounded p-3 text-xs font-mono';
                    card.innerHTML = `
                        <div class="text-white font-bold mb-2">策略 ${r.strategy_id}</div>
                        <div class="text-slate-300">使用数据周期：${toZhTimeframe((STRATEGY_GUIDE[r.strategy_id] || STRATEGY_GUIDE.all).trigger || '--')}</div>
                        <div class="text-slate-300">回测周期：${r.start_date} ~ ${r.end_date}</div>
                        <div class="text-slate-300">初始资金：${Number(r.init_capital).toFixed(2)} 元</div>
                        <div class="text-slate-300">结束资金：${Number(r.end_capital).toFixed(2)} 元</div>
                        <div class="text-slate-300">总收益：${(Number(r.total_return) * 100).toFixed(2)}%</div>
                        <div class="text-slate-300">年化收益：${(Number(r.annual_return) * 100).toFixed(2)}%</div>
                        <div class="text-slate-300">最大回撤：${(Number(r.max_drawdown) * 100).toFixed(2)}%</div>
                        <div class="text-slate-300">总交易次数：${r.trade_count}</div>
                        <div class="text-slate-300">盈利次数：${r.win_num} | 亏损次数：${r.loss_num}</div>
                        <div class="text-slate-300">胜率：${(Number(r.win_rate) * 100).toFixed(2)}%</div>
                        <div class="text-slate-300">平均盈利：${Number(r.avg_win).toFixed(2)} | 平均亏损：${Number(r.avg_loss).toFixed(2)}</div>
                        <div class="text-slate-300">盈亏比：${Number(r.profit_ratio).toFixed(2)}</div>
                    `;
                    wrap.appendChild(card);
                });
        }
        
        function closeBacktest() {
            document.getElementById('backtest-overlay').classList.remove('active');
            // Restart live simulation if needed, or just close overlay
            // Ideally we should switch back to live mode automatically or manual
        }

        // UI Helpers
        function getTime() {
            return new Date().toLocaleTimeString('en-GB', { hour12: false });
        }
        const formatClockTime = (v) => {
            const text = String(v || '').trim();
            if (!text) return '';
            if (/^\d{2}:\d{2}:\d{2}$/.test(text)) return text;
            const d = new Date(text);
            if (Number.isNaN(d.getTime())) return '';
            const hh = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            return `${hh}:${mi}:${ss}`;
        };
        const formatDateTime = (v) => {
            if (!v) return '--';
            const d = new Date(v);
            if (Number.isNaN(d.getTime())) return String(v);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
        };
        
        function evolutionEscapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function evolutionParseListInput(value) {
            return String(value || '')
                .split(',')
                .map(x => String(x || '').trim())
                .filter(Boolean);
        }

        function evolutionParseOptionalBoolean(id) {
            const raw = String(document.getElementById(id)?.value || '').trim().toLowerCase();
            if (raw === 'true') return true;
            if (raw === 'false') return false;
            return null;
        }

        function evolutionFormatNumber(value, digits = 4) {
            const num = Number(value);
            if (!Number.isFinite(num)) return '--';
            return num.toFixed(digits);
        }

        function collectRecentNumericValues(rows, valuePicker, limit = 50) {
            const arr = Array.isArray(rows) ? rows.slice(-Math.max(1, Number(limit) || 50)) : [];
            const result = [];
            arr.forEach(item => {
                const val = Number(typeof valuePicker === 'function' ? valuePicker(item) : item);
                if (Number.isFinite(val)) result.push(val);
            });
            return result;
        }

        function calcQuantile(sortedValues, q) {
            const sorted = Array.isArray(sortedValues) ? sortedValues : [];
            if (!sorted.length) return NaN;
            const ratio = Math.max(0, Math.min(1, Number(q) || 0));
            if (sorted.length === 1) return Number(sorted[0]);
            const pos = (sorted.length - 1) * ratio;
            const lower = Math.floor(pos);
            const upper = Math.ceil(pos);
            const lv = Number(sorted[lower]);
            const uv = Number(sorted[upper]);
            if (!Number.isFinite(lv) || !Number.isFinite(uv)) return NaN;
            if (lower === upper) return lv;
            const weight = pos - lower;
            return lv + (uv - lv) * weight;
        }

        function recommendThresholdByDistribution(values, options = {}) {
            const nums = (Array.isArray(values) ? values : []).filter(v => Number.isFinite(Number(v))).map(v => Number(v));
            const minSamples = Math.max(3, Number(options.minSamples || 8));
            if (nums.length < minSamples) {
                return {
                    ok: false,
                    samples: nums.length,
                    message: `样本不足（${nums.length}/${minSamples}）`
                };
            }
            const sorted = nums.slice().sort((a, b) => a - b);
            const p50 = calcQuantile(sorted, 0.5);
            const p70 = calcQuantile(sorted, 0.7);
            const p85 = calcQuantile(sorted, 0.85);
            const recommended = p70;
            return {
                ok: Number.isFinite(recommended),
                samples: nums.length,
                p50,
                p70,
                p85,
                recommended
            };
        }

        function renderEvolutionThresholdRecommendation() {
            const hint = document.getElementById('evolution-threshold-recommendation');
            const btn = document.getElementById('evolution-threshold-recommend-btn');
            if (!hint) return;
            const sampleScores = collectRecentNumericValues(evolutionHistoryRows, row => row?.score, 50);
            const result = recommendThresholdByDistribution(sampleScores, { minSamples: 8 });
            if (!result.ok) {
                hint.innerText = `分布推荐：${result.message}，继续积累最近50轮评分后可推荐`;
                if (btn) btn.title = `当前不可推荐：${result.message}`;
                return;
            }
            const p50Text = result.p50.toFixed(3);
            const p70Text = result.p70.toFixed(3);
            const p85Text = result.p85.toFixed(3);
            const recText = result.recommended.toFixed(3);
            hint.innerText = `分布推荐：样本=${result.samples}，P50=${p50Text}，P70=${p70Text}，P85=${p85Text}，建议阈值=${recText}`;
            if (btn) btn.title = `点击应用建议阈值 ${recText}`;
        }

        function applyEvolutionRecommendedThreshold() {
            const input = document.getElementById('evolution-persist-score-threshold');
            if (!input) return;
            const sampleScores = collectRecentNumericValues(evolutionHistoryRows, row => row?.score, 50);
            const result = recommendThresholdByDistribution(sampleScores, { minSamples: 8 });
            if (!result.ok) {
                appendEvolutionLog(`阈值推荐失败：${result.message}`, 'warning');
                setEvolutionStatusText(`阈值推荐失败：${result.message}`, 'warning');
                renderEvolutionThresholdRecommendation();
                return;
            }
            input.value = result.recommended.toFixed(3);
            renderEvolutionThresholdRecommendation();
            appendEvolutionLog(`已应用推荐入库阈值=${result.recommended.toFixed(3)}（最近${result.samples}轮分布）`, 'info');
            setEvolutionStatusText(`已应用推荐入库阈值=${result.recommended.toFixed(3)}（最近${result.samples}轮分布）`, 'success');
        }

        function triggerEvolutionButtonFx(buttonId, level = 'slate') {
            const btn = document.getElementById(buttonId);
            if (!btn) return;
            btn.classList.remove('scale-95', 'ring-2', 'ring-emerald-300', 'ring-rose-300', 'ring-amber-300', 'ring-slate-300');
            void btn.offsetWidth;
            btn.classList.add('scale-95', 'ring-2');
            const ringClass = level === 'emerald'
                ? 'ring-emerald-300'
                : (level === 'rose' ? 'ring-rose-300' : (level === 'amber' ? 'ring-amber-300' : 'ring-slate-300'));
            btn.classList.add(ringClass);
            setTimeout(() => {
                btn.classList.remove('scale-95', 'ring-2', 'ring-emerald-300', 'ring-rose-300', 'ring-amber-300', 'ring-slate-300');
            }, 220);
        }

        function resetEvolutionStopConfirmState(syncUi = true) {
            evolutionStopConfirmUntil = 0;
            if (evolutionStopConfirmTimer) {
                clearTimeout(evolutionStopConfirmTimer);
                evolutionStopConfirmTimer = null;
            }
            if (syncUi) updateEvolutionActionButtons();
        }

        function armEvolutionStopConfirmState() {
            evolutionStopConfirmUntil = Date.now() + 5000;
            if (evolutionStopConfirmTimer) clearTimeout(evolutionStopConfirmTimer);
            evolutionStopConfirmTimer = setTimeout(() => {
                if (Date.now() >= evolutionStopConfirmUntil) resetEvolutionStopConfirmState();
            }, 5100);
            updateEvolutionActionButtons();
        }

        function updateEvolutionActionButtons(runningOverride = null) {
            const running = runningOverride === null ? !!(evolutionLastState && evolutionLastState.running) : !!runningOverride;
            const startBtn = document.getElementById('evolution-start-btn');
            const stopBtn = document.getElementById('evolution-stop-btn');
            const applyBtn = document.getElementById('evolution-apply-style-btn');
            const resetBtn = document.getElementById('evolution-reset-btn');
            const startText = document.getElementById('evolution-start-btn-text');
            const stopText = document.getElementById('evolution-stop-btn-text');
            const applyText = document.getElementById('evolution-apply-style-btn-text');
            const resetText = document.getElementById('evolution-reset-btn-text');
            if (!running && evolutionStopConfirmUntil > 0) resetEvolutionStopConfirmState(false);
            const confirmingStop = running && evolutionStopConfirmUntil > Date.now() && !evolutionStopPending;
            const startDisabled = running || evolutionStartPending || evolutionStopPending;
            const stopDisabled = !running || evolutionStartPending || evolutionStopPending;
            const applyDisabled = !running || evolutionStartPending || evolutionStopPending || evolutionProfileUpdatePending;
            const resetDisabled = running || evolutionStartPending || evolutionStopPending || evolutionProfileUpdatePending;
            if (startBtn) {
                startBtn.disabled = startDisabled;
                startBtn.classList.toggle('opacity-70', startDisabled);
                startBtn.classList.toggle('cursor-not-allowed', startDisabled);
                startBtn.classList.toggle('animate-pulse', evolutionStartPending);
            }
            if (stopBtn) {
                stopBtn.disabled = stopDisabled;
                stopBtn.classList.toggle('opacity-70', stopDisabled);
                stopBtn.classList.toggle('cursor-not-allowed', stopDisabled);
                stopBtn.classList.toggle('animate-pulse', evolutionStopPending);
                stopBtn.classList.toggle('bg-amber-700', confirmingStop);
                stopBtn.classList.toggle('hover:bg-amber-600', confirmingStop);
                stopBtn.classList.toggle('border-amber-500', confirmingStop);
                stopBtn.classList.toggle('bg-rose-700', !confirmingStop);
                stopBtn.classList.toggle('hover:bg-rose-600', !confirmingStop);
                stopBtn.classList.toggle('border-rose-500', !confirmingStop);
            }
            if (resetBtn) {
                resetBtn.disabled = resetDisabled;
                resetBtn.classList.toggle('opacity-70', resetDisabled);
                resetBtn.classList.toggle('cursor-not-allowed', resetDisabled);
            }
            if (applyBtn) {
                applyBtn.disabled = applyDisabled;
                applyBtn.classList.toggle('opacity-70', applyDisabled);
                applyBtn.classList.toggle('cursor-not-allowed', applyDisabled);
                applyBtn.classList.toggle('animate-pulse', evolutionProfileUpdatePending);
            }
            if (startText) startText.innerText = evolutionStartPending ? '启动中...' : '启动';
            if (stopText) {
                if (evolutionStopPending) stopText.innerText = '停止中...';
                else if (confirmingStop) stopText.innerText = '再次点击确认';
                else stopText.innerText = '停止';
            }
            if (applyText) applyText.innerText = evolutionProfileUpdatePending ? '应用中...' : '应用风格';
            if (resetText) resetText.innerText = '重置';
        }

        function resetEvolutionBoardUi() {
            const running = !!(evolutionLastState && evolutionLastState.running);
            if (running || evolutionStartPending || evolutionStopPending) {
                triggerEvolutionButtonFx('evolution-reset-btn', 'amber');
                setEvolutionStatusText('运行中或操作处理中，不允许重置看板', 'warning');
                appendEvolutionLog('重置被拦截：运行中或操作处理中', 'warning');
                return;
            }
            triggerEvolutionButtonFx('evolution-reset-btn', 'slate');
            evolutionLastState = null;
            evolutionLastActivity = null;
            evolutionHistoryRows = [];
            evolutionTopRows = [];
            evolutionFamilyStatsRows = [];
            evolutionProfileUpdateRows = [];
            evolutionFamilyStatsEnabled = false;
            evolutionFamilyStatsError = '';
            evolutionFamilyWeightsSnapshot = null;
            evolutionFamilyAlertPreset = 'balanced';
            evolutionFamilyAlertThresholdOverride = '';
            persistEvolutionFamilyAlertPresetPreference('');
            persistEvolutionFamilyAlertThresholdPreference('');
            evolutionRunRows = [];
            evolutionRunsTotal = 0;
            evolutionRunsPage = 1;
            evolutionRunsLastEnabled = false;
            evolutionLogRows = [];
            evolutionLastRunning = null;
            evolutionSeedTempSelectedIds = [];
            evolutionSeedAllowTopFallback = false;
            evolutionStartPending = false;
            evolutionStopPending = false;
            evolutionProfileUpdatePending = false;
            resetEvolutionStopConfirmState(false);
            const defaults = {
                'evolution-interval': '1',
                'evolution-max-iterations': '0',
                'evolution-seed-source': 'strategy_dropdown',
                'evolution-seed-include-builtin': '',
                'evolution-seed-only-enabled': '',
                'evolution-persist-enabled': '',
                'evolution-target-stock-codes': '',
                'evolution-timeframes': '',
                'evolution-seed-search': '',
                'evolution-seed-strategy-id': '',
                'evolution-seed-strategy-ids': '',
                'evolution-persist-score-threshold': '',
                'evolution-runs-run-id': '',
                'evolution-runs-gene-id': '',
                'evolution-runs-parent-id': '',
                'evolution-runs-status': '',
                'evolution-runs-start-time': '',
                'evolution-runs-end-time': '',
                'evolution-family-alert-preset': 'balanced',
                'evolution-family-alert-threshold': '0.18',
            };
            Object.entries(defaults).forEach(([id, value]) => {
                const el = document.getElementById(id);
                if (el) el.value = value;
            });
            const statusPill = document.getElementById('evolution-status-pill');
            const runningEl = document.getElementById('evolution-running');
            const iterationEl = document.getElementById('evolution-iteration');
            const lastStatusEl = document.getElementById('evolution-last-status');
            const lastScoreEl = document.getElementById('evolution-last-score');
            const outcomeEl = document.getElementById('evolution-outcome-count');
            const bestEl = document.getElementById('evolution-best-score');
            const avgCostEl = document.getElementById('evolution-avg-cost');
            const qualifiedEl = document.getElementById('evolution-qualified-strategy');
            const conclusionEl = document.getElementById('evolution-conclusion-wrap');
            const historyEl = document.getElementById('evolution-history-wrap');
            const topEl = document.getElementById('evolution-top-wrap');
            const familyEl = document.getElementById('evolution-family-stats-wrap');
            const profileUpdatesEl = document.getElementById('evolution-profile-updates-wrap');
            const runEl = document.getElementById('evolution-runs-wrap');
            const runMetaEl = document.getElementById('evolution-runs-meta');
            const runPageEl = document.getElementById('evolution-runs-page-text');
            const logEl = document.getElementById('evolution-log-wrap');
            const progressLabelEl = document.getElementById('evolution-progress-label');
            const progressTextEl = document.getElementById('evolution-progress-text');
            const progressBarEl = document.getElementById('evolution-progress-bar');
            const progressDetailEl = document.getElementById('evolution-progress-detail');
            const dataStatusEl = document.getElementById('evolution-data-status');
            const startBtn = document.getElementById('evolution-start-btn');
            const stopBtn = document.getElementById('evolution-stop-btn');
            const allBox = document.getElementById('evolution-seed-all-checkbox');
            if (statusPill) {
                statusPill.innerText = '未启动';
                statusPill.className = 'text-[11px] text-slate-300 font-mono mt-1';
            }
            if (runningEl) runningEl.innerText = '--';
            if (iterationEl) iterationEl.innerText = '--';
            if (lastStatusEl) lastStatusEl.innerText = '--';
            if (lastScoreEl) lastScoreEl.innerText = '--';
            if (outcomeEl) outcomeEl.innerText = '--/--/--';
            if (bestEl) bestEl.innerText = '--';
            if (avgCostEl) avgCostEl.innerText = '--';
            if (qualifiedEl) qualifiedEl.innerText = '--';
            if (conclusionEl) conclusionEl.innerText = '暂无';
            if (historyEl) historyEl.innerHTML = '<div class="text-slate-500">暂无</div>';
            if (topEl) topEl.innerHTML = '<div class="text-slate-500">暂无</div>';
            if (familyEl) familyEl.innerHTML = '<div class="text-slate-500">暂无</div>';
            if (profileUpdatesEl) profileUpdatesEl.innerHTML = '<div class="text-slate-500">暂无</div>';
            if (runEl) runEl.innerHTML = '<div class="text-slate-500">暂无</div>';
            if (runMetaEl) runMetaEl.innerText = '记录：--';
            if (runPageEl) runPageEl.innerText = '第 -- / -- 页';
            if (logEl) logEl.innerHTML = '<div class="text-slate-500">暂无</div>';
            if (progressLabelEl) progressLabelEl.innerText = '阶段：待命';
            if (progressTextEl) progressTextEl.innerText = '--%';
            if (progressBarEl) progressBarEl.style.width = '0%';
            if (progressDetailEl) progressDetailEl.innerText = '进度详情：--';
            if (dataStatusEl) {
                dataStatusEl.innerText = '数据状态：待命';
                dataStatusEl.className = 'text-slate-300 whitespace-nowrap';
            }
            if (allBox) allBox.checked = false;
            renderEvolutionEffectiveProfile({});
            renderEvolutionSeedSourceUi();
            renderEvolutionThresholdRecommendation();
            renderEvolutionRunsPager();
            updateEvolutionActionButtons(false);
            setEvolutionStatusText('已重置当前看板界面数据（仅前端显示）', 'warning');
            logMessage('策略中心', '策略进化看板已重置（仅前端显示）', 'warning');
        }

        function getEvolutionSeedIdsFromStrategyDropdown() {
            if (Array.isArray(evolutionSeedTempSelectedIds) && evolutionSeedTempSelectedIds.length) {
                return evolutionSeedTempSelectedIds.slice();
            }
            const picked = Array.isArray(selectedStrategyIds) ? selectedStrategyIds.map(x => String(x || '').trim()).filter(Boolean) : [];
            return picked;
        }

        function renderEvolutionSeedStrategySelectOptions() {
            const list = document.getElementById('evolution-seed-strategy-list');
            if (!list) return;
            const prevSelected = new Set(Array.isArray(evolutionSeedTempSelectedIds) ? evolutionSeedTempSelectedIds.map(x => String(x || '').trim()) : []);
            const topSelected = Array.isArray(selectedStrategyIds) ? selectedStrategyIds.map(x => String(x || '').trim()).filter(Boolean) : [];
            const defaultSet = prevSelected.size ? prevSelected : (evolutionSeedAllowTopFallback ? new Set(topSelected) : new Set());
            const rows = Array.isArray(strategyCatalog) ? strategyCatalog.filter(x => String(x?.id || '').trim()) : [];
            evolutionSeedTempSelectedIds = rows.filter(row => {
                const id = String(row?.id || '').trim();
                if (!id) return false;
                return defaultSet.size > 0 && defaultSet.has(id);
            }).map(row => String(row.id));
            renderSearchableStrategyChecklist({
                listId: 'evolution-seed-strategy-list',
                searchInputId: 'evolution-seed-search',
                checkboxClass: 'evolution-seed-item-checkbox',
                rows,
                selectedIds: evolutionSeedTempSelectedIds,
                renderRightText: () => '',
                onToggle: (cb) => {
                    const sid = String(cb?.value || '').trim();
                    const curr = new Set((Array.isArray(evolutionSeedTempSelectedIds) ? evolutionSeedTempSelectedIds : []).map(x => String(x)));
                    if (sid) {
                        if (cb.checked) curr.add(sid);
                        else curr.delete(sid);
                    }
                    evolutionSeedTempSelectedIds = Array.from(curr);
                    const allBox = document.getElementById('evolution-seed-all-checkbox');
                    if (allBox) allBox.checked = rows.length > 0 && evolutionSeedTempSelectedIds.length === rows.length;
                    renderEvolutionSeedSourceUi();
                }
            });
            const allBox = document.getElementById('evolution-seed-all-checkbox');
            if (allBox) allBox.checked = rows.length > 0 && evolutionSeedTempSelectedIds.length === rows.length;
        }

        function toggleAllEvolutionSeedStrategies(checked) {
            evolutionSeedTempSelectedIds = checked ? strategyCatalog.map(x => String(x?.id || '').trim()).filter(Boolean) : [];
            setCheckedValuesByClass('evolution-seed-item-checkbox', evolutionSeedTempSelectedIds, !!checked);
            renderEvolutionSeedSourceUi();
        }

        function renderEvolutionSeedSourceUi() {
            const source = String(document.getElementById('evolution-seed-source')?.value || 'strategy_dropdown');
            const manualWrap = document.getElementById('evolution-seed-manual-wrap');
            const selectWrap = document.getElementById('evolution-seed-select-wrap');
            const summary = document.getElementById('evolution-seed-from-strategy-summary');
            if (manualWrap) manualWrap.classList.toggle('hidden', source !== 'manual');
            if (selectWrap) selectWrap.classList.toggle('hidden', source === 'manual');
            renderEvolutionSeedStrategySelectOptions();
            if (!summary) return;
            const ids = getEvolutionSeedIdsFromStrategyDropdown();
            if (!ids.length) {
                summary.innerText = '起点策略（多选下拉）：暂无，默认将按配置中心规则选种';
                return;
            }
            const names = ids.slice(0, 6).map(id => {
                const meta = (Array.isArray(strategyCatalog) ? strategyCatalog : []).find(x => String(x?.id || '') === String(id));
                return `[${id}]${meta?.name ? meta.name : ''}`;
            });
            const suffix = ids.length > 6 ? ` ...共${ids.length}个` : ` 共${ids.length}个`;
            summary.innerText = `起点策略（多选下拉）：${names.join('、')}${suffix}`;
        }

        function renderEvolutionEffectiveProfile(profile) {
            const el = document.getElementById('evolution-effective-profile');
            if (!el) return;
            const p = profile && typeof profile === 'object' ? profile : {};
            const seedOne = String(p.seed_strategy_id || '').trim() || '-';
            const seedMany = Array.isArray(p.seed_strategy_ids) && p.seed_strategy_ids.length ? p.seed_strategy_ids.join(',') : '-';
            const targets = Array.isArray(p.target_stock_codes) && p.target_stock_codes.length ? p.target_stock_codes.join(',') : '-';
            const tfs = Array.isArray(p.timeframes) && p.timeframes.length ? p.timeframes.join(',') : '-';
            const persistEnabled = p.persist_enabled === true ? '开' : (p.persist_enabled === false ? '关' : '-');
            const threshold = Number.isFinite(Number(p.persist_score_threshold)) ? Number(p.persist_score_threshold).toFixed(3) : '--';
            const familyPreset = String(p.family_alert_preset || '-').trim() || '-';
            const familyBlend = Number.isFinite(Number(p.family_adaptive_blend_ratio)) ? Number(p.family_adaptive_blend_ratio).toFixed(2) : '--';
            el.innerText = `有效配置：seed=${seedOne} | seed_pool=${seedMany} | include_builtin=${String(p.seed_include_builtin)} | only_enabled=${String(p.seed_only_enabled)} | stocks=${targets} | tfs=${tfs} | persist=${persistEnabled}@${threshold} | family=${familyPreset}@blend=${familyBlend}`;
        }

        function renderEvolutionSummary(rows) {
            const arr = Array.isArray(rows) ? rows : [];
            const running = !!(evolutionLastState && evolutionLastState.running);
            let ok = 0;
            let rejected = 0;
            let error = 0;
            let best = null;
            let costTotal = 0;
            let costCount = 0;
            arr.forEach(r => {
                const status = String(r?.status || '').toLowerCase();
                if (status === 'ok') ok += 1;
                else if (status === 'error') error += 1;
                else rejected += 1;
                const score = Number(r?.score);
                if (Number.isFinite(score)) best = best === null ? score : Math.max(best, score);
                const cost = Number(r?.cost_ms);
                if (Number.isFinite(cost) && cost >= 0) {
                    costTotal += cost;
                    costCount += 1;
                }
            });
            const outcomeEl = document.getElementById('evolution-outcome-count');
            const bestEl = document.getElementById('evolution-best-score');
            const costEl = document.getElementById('evolution-avg-cost');
            if (outcomeEl) outcomeEl.innerText = `${ok}/${rejected}/${error}`;
            if (bestEl) bestEl.innerText = best === null ? (running ? '统计中' : '--') : best.toFixed(2);
            if (costEl) costEl.innerText = costCount > 0 ? `${(costTotal / costCount / 1000).toFixed(2)}秒` : (running ? '统计中' : '--');
        }

        function renderEvolutionConclusion() {
            const wrap = document.getElementById('evolution-conclusion-wrap');
            if (!wrap) return;
            const state = evolutionLastState && typeof evolutionLastState === 'object' ? evolutionLastState : {};
            const statusText = evolutionDisplayStatus(state);
            const hist = Array.isArray(evolutionHistoryRows) ? evolutionHistoryRows : [];
            const top = Array.isArray(evolutionTopRows) ? evolutionTopRows : [];
            if (!hist.length && !top.length) {
                const running = !!state.running;
                const iter = Number(state.iteration || 0);
                const activity = state.activity && typeof state.activity === 'object' ? state.activity : {};
                const phase = String(activity.phase_label || activity.phase || '待命');
                const detail = String(activity.message || '').trim() || '等待首轮回测完成';
                if (running) {
                    wrap.innerText = [
                        `运行状态: 运行中  轮次: ${iter > 0 ? iter : 1}  最近状态: ${statusText || 'running'}`,
                        `结果分布: 首轮尚未完成，统计生成中`,
                        `最佳策略: 统计中（将于首轮完成后展示）`,
                        `当前阶段: ${phase} · ${detail}`,
                    ].join('\n');
                } else {
                    wrap.innerText = '暂无';
                }
                return;
            }
            const latest = hist.length ? hist[hist.length - 1] : {};
            const committedCount = hist.filter(r => !!r?.committed).length;
            const okCount = hist.filter(r => String(r?.status || '').toLowerCase() === 'ok').length;
            const errCount = hist.filter(r => String(r?.status || '').toLowerCase() === 'error').length;
            const rejectCount = Math.max(0, hist.length - okCount - errCount);
            const topOne = top.length ? top[0] : null;
            const topScore = Number(topOne?.score);
            const topScoreText = Number.isFinite(topScore) ? topScore.toFixed(2) : '--';
            const topSharpe = evolutionFormatNumber(topOne?.metrics?.sharpe, 3);
            const topWin = evolutionFormatNumber(topOne?.metrics?.win_rate, 3);
            const latestReason = String(latest?.reason || latest?.error || '').trim() || '--';
            const latestParent = String(latest?.parent_strategy_id || latest?.parent_strategy_name || '--');
            const latestTf = String(latest?.best_timeframe || '--');
            const latestStock = String(latest?.best_stock_code || '--');
            wrap.innerText = [
                `运行状态: ${state.running ? '运行中' : '已停止'}  轮次: ${state.iteration ?? '--'}  最近状态: ${statusText || '--'}`,
                `结果分布: 通过=${okCount}, 驳回=${rejectCount}, 异常=${errCount}, 入库=${committedCount}`,
                `最佳策略: 评分=${topScoreText}, 夏普=${topSharpe}, 胜率=${topWin}`,
                `最近一轮: 母策略=${latestParent}, 周期=${latestTf}, 标的=${latestStock}, 原因=${latestReason}`,
            ].join('\n');
        }

        function renderEvolutionLogs() {
            const wrap = document.getElementById('evolution-log-wrap');
            if (!wrap) return;
            const arr = Array.isArray(evolutionLogRows) ? evolutionLogRows.slice(-120) : [];
            if (!arr.length) {
                wrap.innerHTML = '<div class="text-slate-500">暂无</div>';
                return;
            }
            wrap.innerHTML = arr.slice().reverse().map(item => {
                const level = String(item?.level || 'info');
                const color = level === 'danger' ? 'text-rose-300' : (level === 'success' ? 'text-emerald-300' : (level === 'warning' ? 'text-amber-300' : 'text-slate-200'));
                return `<div class="${color}">[${evolutionEscapeHtml(item?.time || '--')}] ${evolutionEscapeHtml(item?.message || '--')}</div>`;
            }).join('');
        }

        function appendEvolutionLog(message, level = 'info') {
            const msg = String(message || '').trim();
            if (!msg) return;
            const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
            const prev = evolutionLogRows.length ? evolutionLogRows[evolutionLogRows.length - 1] : null;
            if (prev && prev.message === msg && prev.level === level) return;
            evolutionLogRows.push({ time: ts, level, message: msg });
            if (evolutionLogRows.length > 200) evolutionLogRows = evolutionLogRows.slice(-200);
            renderEvolutionLogs();
        }

        function rebuildEvolutionLogsFromHistory(rows) {
            const arr = Array.isArray(rows) ? rows.slice(-80) : [];
            evolutionLogRows = arr.map(r => {
                const score = (typeof r?.score === 'number' && Number.isFinite(r.score)) ? r.score.toFixed(2) : '--';
                const statusText = evolutionStatusLabel(r?.status || '--');
                const reason = String(r?.reason || r?.error || '').trim();
                const committed = r?.committed ? ` 入库=${r?.committed_strategy_id || '--'}` : '';
                const text = `轮次=${r?.iteration ?? '--'} 状态=${statusText} 评分=${score} 耗时=${evolutionCostTextFromMs(r?.cost_ms)}${reason ? ` 原因=${reason}` : ''}${committed}`;
                const level = String(r?.status || '').toLowerCase() === 'ok' ? 'success' : (String(r?.status || '').toLowerCase() === 'error' ? 'danger' : 'warning');
                return { time: formatClockTime(r?.time) || '--', level, message: text };
            });
            renderEvolutionLogs();
        }

        async function startEvolutionRun() {
            triggerEvolutionButtonFx('evolution-start-btn', 'emerald');
            const running = !!(evolutionLastState && evolutionLastState.running);
            if (running || evolutionStartPending || evolutionStopPending) {
                setEvolutionStatusText('当前处于运行或操作处理中，启动按钮已锁定', 'warning');
                return;
            }
            const intervalRaw = Number(document.getElementById('evolution-interval')?.value || 1);
            const maxRaw = Number(document.getElementById('evolution-max-iterations')?.value || 0);
            const payload = {
                interval_seconds: Number.isFinite(intervalRaw) ? Math.max(0, intervalRaw) : 1,
                max_iterations: Number.isFinite(maxRaw) && maxRaw > 0 ? Math.floor(maxRaw) : null
            };
            const seedSource = String(document.getElementById('evolution-seed-source')?.value || 'strategy_dropdown');
            const seedId = String(document.getElementById('evolution-seed-strategy-id')?.value || '').trim();
            const seedIds = evolutionParseListInput(document.getElementById('evolution-seed-strategy-ids')?.value || '');
            const includeBuiltin = evolutionParseOptionalBoolean('evolution-seed-include-builtin');
            const onlyEnabled = evolutionParseOptionalBoolean('evolution-seed-only-enabled');
            const targetCodes = evolutionParseListInput(document.getElementById('evolution-target-stock-codes')?.value || '');
            const timeframes = evolutionParseListInput(document.getElementById('evolution-timeframes')?.value || '');
            const persistEnabled = evolutionParseOptionalBoolean('evolution-persist-enabled');
            const persistThresholdRaw = Number(document.getElementById('evolution-persist-score-threshold')?.value);
            const styleMeta = evolutionPresetStyleMeta(evolutionFamilyAlertPreset);
            if (seedSource === 'manual') {
                if (seedId) payload.seed_strategy_id = seedId;
                if (seedIds.length) payload.seed_strategy_ids = seedIds;
            } else {
                const fromDropdown = getEvolutionSeedIdsFromStrategyDropdown();
                if (fromDropdown.length) payload.seed_strategy_ids = fromDropdown;
            }
            if (includeBuiltin !== null) payload.seed_include_builtin = includeBuiltin;
            if (onlyEnabled !== null) payload.seed_only_enabled = onlyEnabled;
            if (targetCodes.length) payload.target_stock_codes = targetCodes;
            if (timeframes.length) payload.timeframes = timeframes;
            if (persistEnabled !== null) payload.persist_enabled = persistEnabled;
            if (Number.isFinite(persistThresholdRaw)) payload.persist_score_threshold = persistThresholdRaw;
            payload.family_alert_preset = evolutionFamilyAlertPreset;
            payload.family_adaptive_blend_ratio = Number(styleMeta?.blend || 0.35);
            evolutionStartPending = true;
            updateEvolutionActionButtons();
            renderEvolutionActivity({
                phase: 'start_pending',
                phase_label: '启动请求中',
                message: '正在提交启动请求',
                progress_pct: 0,
                data_status: 'checking',
            });
            appendEvolutionLog('正在提交启动请求...', 'info');
            try {
                const startedAt = Date.now();
                const { res, data } = await fetchJsonWithTimeout('/api/evolution/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }, 20000);
                const elapsed = Date.now() - startedAt;
                if (!res.ok || data.status !== 'success') {
                    // 检查是否是并发冲突
                    if (data.state && data.state.concurrency_conflict) {
                        showConcurrencyConflict(data.state.error || '并发冲突，请稍后重试');
                        return;
                    }
                    throw new Error(data.msg || '启动失败');
                }
                appendEvolutionLog(`已启动策略进化任务（请求耗时 ${elapsed}ms）`, 'success');
                logMessage('策略中心', 'Evolution 已启动', 'success');
                renderEvolutionStatus(data.state || {});
                refreshEvolutionDashboard({ withHistory: true, withTop: true, withFamilyStats: true, withProfileUpdates: true, withTimingLog: true, withConcurrency: true });
            } catch (e) {
                const text = `Evolution 启动失败：${e.message || e}`;
                appendEvolutionLog(text, 'danger');
                setEvolutionStatusText(text, 'danger');
                logMessage('策略中心', text, 'danger');
            } finally {
                evolutionStartPending = false;
                updateEvolutionActionButtons();
            }
        }

        async function applyEvolutionStyleRuntime() {
            triggerEvolutionButtonFx('evolution-apply-style-btn', 'cyan');
            const running = !!(evolutionLastState && evolutionLastState.running);
            if (!running) {
                setEvolutionStatusText('当前未运行，风格热更新仅在运行中可用', 'warning');
                return;
            }
            if (evolutionStartPending || evolutionStopPending || evolutionProfileUpdatePending) {
                setEvolutionStatusText('当前有操作处理中，请稍候', 'warning');
                return;
            }
            const styleMeta = evolutionPresetStyleMeta(evolutionFamilyAlertPreset);
            const payload = {
                family_alert_preset: evolutionFamilyAlertPreset,
                family_adaptive_blend_ratio: Number(styleMeta?.blend || 0.35),
                updated_by: 'dashboard',
                source: 'ui_apply_style',
            };
            evolutionProfileUpdatePending = true;
            updateEvolutionActionButtons();
            appendEvolutionLog(
                `应用风格热更新：preset=${evolutionFamilyAlertPreset} blend=${payload.family_adaptive_blend_ratio}`,
                'info',
            );
            try {
                const { res, data } = await fetchJsonWithTimeout('/api/evolution/profile/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                }, 12000);
                if (!res.ok || data.status !== 'success') {
                    throw new Error(data.msg || '风格热更新失败');
                }
                renderEvolutionStatus(data.state || {});
                setEvolutionStatusText(
                    `风格参数已应用：${evolutionFamilyAlertPreset} / blend=${payload.family_adaptive_blend_ratio}`,
                    'success',
                );
                appendEvolutionLog('风格热更新成功，后续轮次将按新参数执行', 'success');
                refreshEvolutionDashboard({ withHistory: false, withTop: false, withRuns: false, withFamilyStats: true, withProfileUpdates: true });
            } catch (e) {
                const text = `风格热更新失败：${e.message || e}`;
                setEvolutionStatusText(text, 'danger');
                appendEvolutionLog(text, 'danger');
            } finally {
                evolutionProfileUpdatePending = false;
                updateEvolutionActionButtons();
            }
        }

        async function stopEvolutionRun() {
            triggerEvolutionButtonFx('evolution-stop-btn', 'rose');
            const running = !!(evolutionLastState && evolutionLastState.running);
            if (!running) {
                setEvolutionStatusText('当前未运行，无需停止', 'warning');
                return;
            }
            if (evolutionStartPending || evolutionStopPending) {
                setEvolutionStatusText('当前有操作处理中，请稍候', 'warning');
                return;
            }
            if (evolutionStopConfirmUntil <= Date.now()) {
                armEvolutionStopConfirmState();
                setEvolutionStatusText('再次点击“停止”以确认终止本次进化任务（5秒内）', 'warning');
                return;
            }
            resetEvolutionStopConfirmState(false);
            evolutionStopPending = true;
            updateEvolutionActionButtons();
            try {
                const { res, data } = await fetchJsonWithTimeout('/api/evolution/stop', { method: 'POST' }, 20000);
                if (!res.ok || data.status !== 'success') {
                    // 检查是否是并发冲突
                    if (data.state && data.state.concurrency_conflict) {
                        showConcurrencyConflict(data.state.error || '并发冲突，请稍后重试');
                        return;
                    }
                    throw new Error(data.msg || '停止失败');
                }
                appendEvolutionLog('已停止策略进化任务', 'warning');
                logMessage('策略中心', 'Evolution 已停止', 'warning');
                renderEvolutionStatus(data.state || {});
                refreshEvolutionDashboard({ withHistory: true, withTop: true, withFamilyStats: true, withProfileUpdates: true, withConcurrency: true });
            } catch (e) {
                const text = `Evolution 停止失败：${e.message || e}`;
                appendEvolutionLog(text, 'danger');
                setEvolutionStatusText(text, 'danger');
                logMessage('策略中心', text, 'danger');
            } finally {
                evolutionStopPending = false;
                updateEvolutionActionButtons();
            }
        }

        function setEvolutionStatusText(text, level = 'info') {
            const el = document.getElementById('evolution-status-text');
            if (!el) return;
            el.innerText = String(text || '--');
            if (level === 'danger') el.className = 'text-[11px] text-rose-300 font-mono';
            else if (level === 'success') el.className = 'text-[11px] text-emerald-300 font-mono';
            else if (level === 'warning') el.className = 'text-[11px] text-amber-300 font-mono';
            else el.className = 'text-[11px] text-slate-300 font-mono';
        }

        function evolutionDataStatusMeta(status) {
            const key = String(status || '').trim().toLowerCase();
            if (key === 'ok') return { text: '数据状态：正常', cls: 'text-emerald-300' };
            if (key === 'warning') return { text: '数据状态：异常告警', cls: 'text-amber-300' };
            if (key === 'error') return { text: '数据状态：异常', cls: 'text-rose-300' };
            if (key === 'checking') return { text: '数据状态：校验中', cls: 'text-cyan-300' };
            return { text: '数据状态：待命', cls: 'text-slate-300' };
        }

        function evolutionStatusLabel(status) {
            const key = String(status || '').trim().toLowerCase();
            if (!key) return '--';
            const alias = {
                ok: '通过',
                success: '通过',
                rejected: '驳回',
                reject: '驳回',
                error: '异常',
                failed: '失败',
                cancelled: '已取消',
                canceled: '已取消',
                starting: '启动中',
                running: '运行中',
                idle: '待命',
                stopped: '已停止',
                done: '已完成',
            };
            return alias[key] || status;
        }

        function evolutionCostTextFromMs(costMs) {
            const cost = Number(costMs);
            if (!Number.isFinite(cost) || cost < 0) return '--';
            return `${(cost / 1000).toFixed(2)}秒`;
        }

        function evolutionScoreTextCompact(scoreVal) {
            const score = Number(scoreVal);
            if (!Number.isFinite(score)) return '--';
            if (score !== 0 && Math.abs(score) < 0.01) return `${score > 0 ? '<' : '>-'}0.01`;
            return score.toFixed(2);
        }

        function evolutionThresholdText(profile) {
            const threshold = Number(profile?.persist_score_threshold);
            return Number.isFinite(threshold) ? threshold.toFixed(2) : '--';
        }

        function evolutionQualifiedStrategyText(record) {
            const r = record && typeof record === 'object' ? record : {};
            const profile = evolutionLastState?.profile || {};
            const persistEnabled = profile?.persist_enabled !== false;
            const threshold = Number(profile?.persist_score_threshold);
            const score = Number(r?.score);
            const scoreText = Number.isFinite(score) ? score.toFixed(2) : '--';
            const thresholdText = evolutionThresholdText(profile);
            const committedId = String(r?.committed_strategy_id || '').trim();
            const committedName = String(r?.committed_strategy_name || '').trim();
            const committedLabel = committedId || committedName
                ? `${committedId || '--'}${committedName ? `(${committedName})` : ''}`
                : '--';

            if (!persistEnabled) {
                return `未启用入库阈值（本轮评分=${scoreText}）`;
            }
            if (!Number.isFinite(score) || String(r?.status || '').trim().toLowerCase() !== 'ok') {
                return `无（本轮未通过，阈值=${thresholdText}）`;
            }
            if (r?.committed) {
                return `已达标并入库：${committedLabel}（评分=${scoreText}，阈值=${thresholdText}）`;
            }
            if (Number.isFinite(threshold) && score >= threshold) {
                return `已达标（评分=${scoreText}，阈值=${thresholdText}）`;
            }
            return `无（评分=${scoreText} < 阈值=${thresholdText}）`;
        }

        function evolutionDisplayStatus(state) {
            const s = state && typeof state === 'object' ? state : {};
            const running = !!s.running;
            const raw = String(s.last_status || '').trim().toLowerCase();
            if (!running) return evolutionStatusLabel(raw || '--');
            if (!raw || raw === 'starting' || raw === 'idle') {
                const phase = String(s?.activity?.phase_label || s?.activity?.phase || '').trim();
                return phase ? `运行中(${phase})` : '运行中';
            }
            return evolutionStatusLabel(raw);
        }

        function evolutionIterationDisplay(iteration, scenarioIndex, scenarioTotal, running = false) {
            const iterNum = Number(iteration || 0);
            const iterText = (Number.isFinite(iterNum) && iterNum > 0) ? String(Math.floor(iterNum)) : (running ? '1' : '--');
            const idx = Number(scenarioIndex || 0);
            const total = Number(scenarioTotal || 0);
            if (Number.isFinite(idx) && Number.isFinite(total) && idx > 0 && total > 0) {
                return `${iterText} (场景 ${Math.floor(idx)}/${Math.floor(total)})`;
            }
            return iterText;
        }

        function renderEvolutionActivity(activity) {
            const act = activity && typeof activity === 'object' ? activity : {};
            evolutionLastActivity = act;
            const labelEl = document.getElementById('evolution-progress-label');
            const textEl = document.getElementById('evolution-progress-text');
            const barEl = document.getElementById('evolution-progress-bar');
            const detailEl = document.getElementById('evolution-progress-detail');
            const dataStatusEl = document.getElementById('evolution-data-status');
            const phaseLabel = String(act.phase_label || act.phase || '待命');
            const message = String(act.message || '').trim();
            const stock = String(act.stock_code || '').trim();
            const timeframe = String(act.timeframe || '').trim();
            const klineRows = Number(act.kline_rows);
            const scenarioIndex = Number(act.scenario_index || 0);
            const scenarioTotal = Number(act.scenario_total || 0);
            const pctRaw = Number(act.progress_pct);
            const pct = Number.isFinite(pctRaw) ? Math.max(0, Math.min(100, Math.floor(pctRaw))) : 0;
            if (labelEl) labelEl.innerText = `阶段：${phaseLabel}`;
            if (textEl) textEl.innerText = `${pct}%`;
            if (barEl) barEl.style.width = `${pct}%`;
            const scenarioText = scenarioTotal > 0 ? ` · 场景 ${scenarioIndex}/${scenarioTotal}` : '';
            const stockTfText = stock || timeframe ? ` · ${stock || '--'} ${timeframe || '--'}` : '';
            const klineText = Number.isFinite(klineRows) && klineRows >= 0 ? ` · K线=${klineRows}` : '';
            const detail = message || (phaseLabel ? `${phaseLabel}${scenarioText}${stockTfText}${klineText}` : '--');
            if (detailEl) detailEl.innerText = `进度详情：${detail}`;
            const statusMeta = evolutionDataStatusMeta(act.data_status);
            if (dataStatusEl) {
                dataStatusEl.innerText = statusMeta.text;
                dataStatusEl.className = `${statusMeta.cls} whitespace-nowrap`;
            }
        }

        function renderEvolutionStatus(state) {
            const s = state && typeof state === 'object' ? state : {};
            evolutionLastState = s;
            renderEvolutionEffectiveProfile(s.profile || {});
            renderEvolutionActivity(s.activity || {});
            const running = !!s.running;
            const iterRaw = Number(s.iteration || 0);
            const activityIter = Number(s?.activity?.iteration || 0);
            const iter = (Number.isFinite(iterRaw) && iterRaw > 0)
                ? iterRaw
                : ((Number.isFinite(activityIter) && activityIter > 0)
                    ? activityIter
                    : (running ? 1 : 0));
            const scenarioIndex = Number(s?.activity?.scenario_index || 0);
            const scenarioTotal = Number(s?.activity?.scenario_total || 0);
            const lastStatus = evolutionDisplayStatus(s);
            const score = s.last_score;
            const scoreText = (typeof score === 'number' && Number.isFinite(score)) ? score.toFixed(2) : '--';
            const runningText = running ? '运行中' : '已停止';
            const pill = document.getElementById('evolution-status-pill');
            const runningEl = document.getElementById('evolution-running');
            const iterEl = document.getElementById('evolution-iteration');
            const lsEl = document.getElementById('evolution-last-status');
            const scoreEl = document.getElementById('evolution-last-score');
            const qualifiedEl = document.getElementById('evolution-qualified-strategy');
            if (pill) {
                pill.innerText = runningText;
                pill.className = running ? 'text-[11px] text-emerald-300 font-mono' : 'text-[11px] text-slate-300 font-mono';
            }
            if (runningEl) runningEl.innerText = runningText;
            if (iterEl) iterEl.innerText = evolutionIterationDisplay(iter, scenarioIndex, scenarioTotal, running);
            if (lsEl) lsEl.innerText = lastStatus;
            if (scoreEl) scoreEl.innerText = scoreText;
            if (!running && qualifiedEl) {
                const hist = Array.isArray(evolutionHistoryRows) ? evolutionHistoryRows : [];
                const latest = hist.length ? hist[hist.length - 1] : null;
                qualifiedEl.innerText = latest ? evolutionQualifiedStrategyText(latest) : '--';
            }
            if (evolutionLastRunning === null) {
                evolutionLastRunning = running;
            } else if (evolutionLastRunning !== running) {
                appendEvolutionLog(running ? '运行状态切换为：运行中' : '运行状态切换为：已停止', running ? 'success' : 'warning');
                evolutionLastRunning = running;
            }
            if (String(s.last_error || '').trim()) {
                setEvolutionStatusText(`异常: ${s.last_error}`, 'danger');
            } else {
                const progressPct = Number(s?.activity?.progress_pct);
                const progressText = Number.isFinite(progressPct) ? `${Math.max(0, Math.min(100, Math.floor(progressPct)))}%` : '--';
                setEvolutionStatusText(`状态 ${lastStatus} · 进度 ${progressText} · started=${s.started_at || '--'} · finished=${s.finished_at || '--'}`, running ? 'success' : 'info');
            }
            renderEvolutionConclusion();
        }

        function applyEvolutionProgress(progress) {
            const p = progress && typeof progress === 'object' ? progress : {};
            renderEvolutionActivity(p);
            const iterFromProgress = Number(p.iteration || 0);
            const scenarioIndex = Number(p.scenario_index || 0);
            const scenarioTotal = Number(p.scenario_total || 0);
            if (Number.isFinite(iterFromProgress) && iterFromProgress > 0) {
                const iterEl = document.getElementById('evolution-iteration');
                if (iterEl) iterEl.innerText = evolutionIterationDisplay(iterFromProgress, scenarioIndex, scenarioTotal, true);
                if (evolutionLastState && typeof evolutionLastState === 'object') {
                    evolutionLastState.iteration = Math.max(Number(evolutionLastState.iteration || 0), iterFromProgress);
                }
            } else if (evolutionLastState?.running && Number(evolutionLastState?.iteration || 0) <= 0) {
                const iterEl = document.getElementById('evolution-iteration');
                if (iterEl) iterEl.innerText = evolutionIterationDisplay(1, scenarioIndex, scenarioTotal, true);
            }
            const msg = String(p.message || '').trim();
            const phaseLabel = String(p.phase_label || p.phase || '执行中');
            const pctRaw = Number(p.progress_pct);
            const pct = Number.isFinite(pctRaw) ? Math.max(0, Math.min(100, Math.floor(pctRaw))) : null;
            if (!msg && !phaseLabel) return;
            const scenarioText = scenarioTotal > 0 ? ` · 场景${scenarioIndex}/${scenarioTotal}` : '';
            const status = String(p.data_status || '').toLowerCase();
            const level = status === 'error' ? 'danger' : (status === 'warning' ? 'warning' : (status === 'ok' ? 'success' : 'info'));
            const text = `${phaseLabel}${pct === null ? '' : ` ${pct}%`}${scenarioText}${msg ? ` · ${msg}` : ''}`;
            appendEvolutionLog(text, level);
            if (evolutionLastState && evolutionLastState.running) {
                evolutionLastState.last_status = 'running';
                setEvolutionStatusText(text, level === 'danger' ? 'danger' : 'info');
                const lsEl = document.getElementById('evolution-last-status');
                if (lsEl) lsEl.innerText = evolutionDisplayStatus(evolutionLastState);
            }
        }

        function renderEvolutionHistory(rows) {
            const wrap = document.getElementById('evolution-history-wrap');
            if (!wrap) return;
            const arr = Array.isArray(rows) ? rows.slice(-30).reverse() : [];
            evolutionHistoryRows = Array.isArray(rows) ? rows.slice() : [];
            renderEvolutionSummary(evolutionHistoryRows);
            renderEvolutionConclusion();
            renderEvolutionThresholdRecommendation();
            if (!arr.length) {
                const running = !!(evolutionLastState && evolutionLastState.running);
                const activity = evolutionLastState?.activity || {};
                const phase = String(activity?.phase_label || activity?.phase || '执行中');
                wrap.innerHTML = running ? `<div class="text-cyan-300">首轮结果尚未产出，当前阶段：${evolutionEscapeHtml(phase)}</div>` : '<div class="text-slate-500">暂无</div>';
                return;
            }
            wrap.innerHTML = arr.map(r => {
                const scoreCompact = evolutionScoreTextCompact(r.score);
                const scoreRawNum = Number(r.score);
                const scoreRaw = Number.isFinite(scoreRawNum) ? scoreRawNum.toFixed(6) : '--';
                const reason = String(r.reason || r.error || '').trim();
                const parent = String(r.parent_strategy_id || r.parent_strategy_name || '--');
                const tf = String(r.best_timeframe || '--');
                const stock = String(r.best_stock_code || '--');
                const llmProvider = String(r.llm_provider || '--');
                const llmPath = String(r.llm_path || '--');
                const llmFallback = r.llm_fallback_used ? '是' : '否';
                const thresholdNum = Number(r.persist_score_threshold);
                const threshold = Number.isFinite(thresholdNum) ? thresholdNum.toFixed(6) : '--';
                const statusText = evolutionStatusLabel(r.status || '--');
                const committed = r.committed ? ` <span class="text-emerald-300">[入库:${evolutionEscapeHtml(r.committed_strategy_id || '--')}]</span>` : '';
                const reasonHtml = reason ? `<span class="text-rose-300"> · 原因=${evolutionEscapeHtml(reason)}</span>` : '';
                const llmText = ` · 模型=${evolutionEscapeHtml(llmProvider)} 路径=${evolutionEscapeHtml(llmPath)} 回退=${evolutionEscapeHtml(llmFallback)}`;
                const thresholdText = ` · 阈值=${evolutionEscapeHtml(threshold)}`;
                const rawHint = r.committed ? ` · 原始评分=${evolutionEscapeHtml(scoreRaw)}` : '';
                return `<div>[${evolutionEscapeHtml(r.time || '--')}] #${evolutionEscapeHtml(r.iteration || '--')} ${evolutionEscapeHtml(statusText)} 评分=${evolutionEscapeHtml(scoreCompact)} 耗时=${evolutionEscapeHtml(evolutionCostTextFromMs(r.cost_ms))}${thresholdText}${rawHint} · 母策略=${evolutionEscapeHtml(parent)} · 周期=${evolutionEscapeHtml(tf)} · 标的=${evolutionEscapeHtml(stock)}${llmText}${reasonHtml}${committed}</div>`;
            }).join('');
        }

        function renderEvolutionTop(rows) {
            const wrap = document.getElementById('evolution-top-wrap');
            if (!wrap) return;
            const arr = Array.isArray(rows) ? rows.slice(0, 15) : [];
            evolutionTopRows = Array.isArray(rows) ? rows.slice() : [];
            renderEvolutionConclusion();
            if (!arr.length) {
                const running = !!(evolutionLastState && evolutionLastState.running);
                wrap.innerHTML = running ? '<div class="text-cyan-300">Top策略将在首轮评分完成后展示</div>' : '<div class="text-slate-500">暂无</div>';
                return;
            }
            wrap.innerHTML = arr.map((r, idx) => {
                const score = Number(r?.score || 0);
                const metaFromCode = evolutionExtractStrategyMetaFromCode(r?.strategy_code || '');
                const strategyId = String(r?.strategy_id || metaFromCode.strategy_id || '').trim();
                const strategyName = String(r?.strategy_name || metaFromCode.strategy_name || '').trim();
                const className = String(r?.class_name || metaFromCode.class_name || '').trim();
                const code = String(r?.strategy_code || '').replace(/\s+/g, ' ').slice(0, 22);
                const metrics = r?.metrics || {};
                const sharpe = evolutionFormatNumber(metrics.sharpe, 2);
                const win = evolutionFormatNumber(metrics.win_rate, 2);
                const dd = evolutionFormatNumber(metrics.drawdown, 2);
                const idNameText = strategyId || strategyName
                    ? `${strategyId || '--'} ${strategyName || '--'}`
                    : (className || code || '--');
                return `<button onclick="openEvolutionTopDetail(${idx})" class="w-full text-left hover:text-cyan-300">#${idx + 1} ${score.toFixed(2)} · ${evolutionEscapeHtml(idNameText)} · 夏普=${sharpe} 胜率=${win} 回撤=${dd}</button>`;
            }).join('');
        }

        function renderEvolutionProfileUpdates(rows) {
            // Render runtime profile hot-update audit rows.
            const wrap = document.getElementById('evolution-profile-updates-wrap');
            if (!wrap) return;
            const arr = Array.isArray(rows) ? rows.slice() : [];
            evolutionProfileUpdateRows = arr.slice();
            if (!arr.length) {
                wrap.innerHTML = '<div class="text-slate-500">暂无</div>';
                return;
            }
            wrap.innerHTML = arr.slice(-20).reverse().map((row) => {
                const tm = String(row?.time || '--');
                const by = String(row?.updated_by || '--');
                const source = String(row?.source || '--');
                const patch = row?.patch && typeof row.patch === 'object' ? row.patch : {};
                const preset = String(patch?.family_alert_preset || '-');
                const blend = Number.isFinite(Number(patch?.family_adaptive_blend_ratio))
                    ? Number(patch.family_adaptive_blend_ratio).toFixed(2)
                    : '--';
                return `<div>[${evolutionEscapeHtml(tm)}] by=${evolutionEscapeHtml(by)} src=${evolutionEscapeHtml(source)} family=${evolutionEscapeHtml(preset)} blend=${evolutionEscapeHtml(blend)}</div>`;
            }).join('');
        }

        function renderEvolutionConcurrencyStatus(concurrencyData) {
            // 渲染并发状态监控面板
            const statusEl = document.getElementById('evolution-concurrency-status');
            const operationsEl = document.getElementById('evolution-concurrent-operations');
            const startPermissionEl = document.getElementById('evolution-start-permission');
            const stopPermissionEl = document.getElementById('evolution-stop-permission');
            const conflictEl = document.getElementById('evolution-concurrency-conflict');
            const conflictMessageEl = document.getElementById('evolution-conflict-message');
            
            if (!statusEl || !operationsEl || !startPermissionEl || !stopPermissionEl) return;
            
            // 更新状态指示器
            const currentOps = concurrencyData.current_operations || {};
            const stats = concurrencyData.statistics || {};
            const hasConflicts = stats.conflicts_prevented > 0;
            
            if (Object.keys(currentOps).length > 0) {
                statusEl.textContent = '运行中';
                statusEl.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-amber-600/20 text-amber-300 border border-amber-600/50';
            } else {
                statusEl.textContent = '正常';
                statusEl.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-green-600/20 text-green-300 border border-green-600/50';
            }
            
            // 渲染当前操作
            if (Object.keys(currentOps).length === 0) {
                operationsEl.innerHTML = '<div class="text-slate-500">当前无操作</div>';
            } else {
                const operationRows = Object.entries(currentOps).map(([key, op]) => {
                    const type = String(op.type || '--');
                    const operator = String(op.operator_id || '--');
                    const duration = Number.isFinite(op.duration) ? op.duration.toFixed(1) : '--';
                    const remaining = Number.isFinite(op.remaining_timeout) ? op.remaining_timeout.toFixed(1) : '--';
                    return `<div class="text-cyan-300">${type} by ${operator} (${duration}s, 剩余${remaining}s)</div>`;
                });
                operationsEl.innerHTML = operationRows.join('');
            }
            
            // 更新权限状态
            const isStartAllowed = concurrencyData.is_start_allowed !== false;
            const isStopAllowed = concurrencyData.is_stop_allowed !== false;
            
            if (isStartAllowed) {
                startPermissionEl.textContent = '✓';
                startPermissionEl.className = 'text-green-300';
            } else {
                startPermissionEl.textContent = '✗';
                startPermissionEl.className = 'text-red-300';
            }
            
            if (isStopAllowed) {
                stopPermissionEl.textContent = '✓';
                stopPermissionEl.className = 'text-green-300';
            } else {
                stopPermissionEl.textContent = '✗';
                stopPermissionEl.className = 'text-red-300';
            }
            
            // 隐藏冲突提示（如果有）
            if (conflictEl) {
                conflictEl.classList.add('hidden');
            }
        }

        function showConcurrencyConflict(message) {
            // 显示并发冲突提示
            const conflictEl = document.getElementById('evolution-concurrency-conflict');
            const conflictMessageEl = document.getElementById('evolution-conflict-message');
            
            if (!conflictEl || !conflictMessageEl) return;
            
            conflictMessageEl.textContent = message;
            conflictEl.classList.remove('hidden');
            
            // 3秒后自动隐藏
            setTimeout(() => {
                if (conflictEl) {
                    conflictEl.classList.add('hidden');
                }
            }, 3000);
            
            // 同时在状态文本中显示
            setEvolutionStatusText(`操作冲突：${message}`, 'warning');
        }

        function renderEvolutionFamilyStats(rows, enabled, errorText = '', familyWeights = null) {
            // Render aggregated strategy-family distribution rows.
            const wrap = document.getElementById('evolution-family-stats-wrap');
            const meta = document.getElementById('evolution-family-stats-meta');
            const trendEl = document.getElementById('evolution-family-stats-trend');
            const styleHintEl = document.getElementById('evolution-family-style-hint');
            const alertEl = document.getElementById('evolution-family-stats-alert');
            const thresholdSel = document.getElementById('evolution-family-alert-threshold');
            const sparkTrend = document.getElementById('evolution-family-spark-trend');
            const sparkMean = document.getElementById('evolution-family-spark-mean');
            if (!wrap) return;
            evolutionFamilyStatsRows = Array.isArray(rows) ? rows.slice() : [];
            evolutionFamilyStatsEnabled = !!enabled;
            evolutionFamilyStatsError = String(errorText || '');
            evolutionFamilyWeightsSnapshot = familyWeights && typeof familyWeights === 'object' ? familyWeights : null;
            const configured = familyWeights?.configured || {};
            const effective = familyWeights?.effective || {};
            const history = Array.isArray(familyWeights?.history) ? familyWeights.history : [];
            const adaptiveEnabled = !!familyWeights?.adaptive_enabled;
            const apiThreshold = Number(familyWeights?.alert_threshold);
            if (thresholdSel && !String(evolutionFamilyAlertThresholdOverride || '').trim()) {
                const fallback = Number.isFinite(apiThreshold) ? apiThreshold : 0.18;
                thresholdSel.value = String(fallback.toFixed(2));
            }
            const selectedThreshold = Number.parseFloat(
                String(evolutionFamilyAlertThresholdOverride || thresholdSel?.value || apiThreshold || 0.18),
            );
            const threshold = Number.isFinite(selectedThreshold) ? selectedThreshold : 0.18;
            const styleMeta = evolutionPresetStyleMeta(evolutionFamilyAlertPreset);
            if (meta) {
                const cTrend = evolutionFormatNumber(configured.trend_following, 2);
                const cMean = evolutionFormatNumber(configured.mean_reversion, 2);
                const eTrend = evolutionFormatNumber(effective.trend_following, 3);
                const eMean = evolutionFormatNumber(effective.mean_reversion, 3);
                meta.innerText = `权重(${adaptiveEnabled ? 'adaptive' : 'fixed'}) cfg[T=${cTrend},M=${cMean}] eff[T=${eTrend},M=${eMean}] threshold=${evolutionFormatNumber(threshold, 2)}`;
            }
            if (styleHintEl) {
                styleHintEl.innerText = `风格：${styleMeta.name} · 建议blend_ratio=${evolutionFormatNumber(styleMeta.blend, 2)}`;
            }
            if (trendEl) {
                const tail = history.slice(-8);
                if (!tail.length) {
                    trendEl.innerText = '趋势：--';
                } else {
                    const trendSeries = tail.map((x) => evolutionFormatNumber(x?.trend_following, 2)).join('>');
                    const meanSeries = tail.map((x) => evolutionFormatNumber(x?.mean_reversion, 2)).join('>');
                    trendEl.innerText = `趋势 T:${trendSeries} | M:${meanSeries}`;
                }
            }
            // Draw tiny sparkline chart for recent effective weights.
            const sparkTail = history.slice(-24);
            const buildPath = (arr, key) => {
                const pts = Array.isArray(arr) ? arr : [];
                if (!pts.length) return '';
                const w = 180;
                const h = 28;
                const values = pts.map((x) => Number(x?.[key]));
                const safe = values.map((v) => (Number.isFinite(v) ? v : 0));
                const min = Math.min(...safe, 0.0);
                const max = Math.max(...safe, 1.0);
                const span = Math.max(0.0001, max - min);
                return safe.map((v, i) => {
                    const x = (i / Math.max(1, safe.length - 1)) * (w - 2) + 1;
                    const y = h - 1 - ((v - min) / span) * (h - 2);
                    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                }).join(' ');
            };
            if (sparkTrend) sparkTrend.setAttribute('d', buildPath(sparkTail, 'trend_following'));
            if (sparkMean) sparkMean.setAttribute('d', buildPath(sparkTail, 'mean_reversion'));
            // Alert when one-step weight jump is too large.
            if (alertEl) {
                let maxStep = 0.0;
                for (let i = 1; i < sparkTail.length; i += 1) {
                    const prev = Number(sparkTail[i - 1]?.trend_following);
                    const curr = Number(sparkTail[i]?.trend_following);
                    if (!Number.isFinite(prev) || !Number.isFinite(curr)) continue;
                    const delta = Math.abs(curr - prev);
                    if (delta > maxStep) maxStep = delta;
                }
                if (!sparkTail.length) {
                    alertEl.innerText = '波动告警：--';
                } else if (maxStep >= threshold) {
                    alertEl.innerText = `波动告警：触发（最大步进=${evolutionFormatNumber(maxStep, 3)} >= ${threshold}）`;
                } else {
                    alertEl.innerText = `波动告警：正常（最大步进=${evolutionFormatNumber(maxStep, 3)}）`;
                }
            }
            if (!enabled) {
                wrap.innerHTML = `<div class="text-slate-500">family统计不可用${errorText ? ` · ${evolutionEscapeHtml(errorText)}` : ''}</div>`;
                return;
            }
            if (!evolutionFamilyStatsRows.length) {
                wrap.innerHTML = '<div class="text-slate-500">暂无</div>';
                return;
            }
            wrap.innerHTML = evolutionFamilyStatsRows.slice(0, 6).map((row, idx) => {
                const family = String(row?.family || 'unknown');
                const count = Number(row?.run_count || 0);
                const avgScore = evolutionFormatNumber(row?.avg_score, 3);
                const avgSharpe = evolutionFormatNumber(row?.avg_sharpe, 3);
                const avgDrawdown = evolutionFormatNumber(row?.avg_drawdown, 3);
                return `<div>#${idx + 1} ${evolutionEscapeHtml(family)} · 样本=${count} · 均分=${avgScore} · 夏普=${avgSharpe} · 回撤=${avgDrawdown}</div>`;
            }).join('');
        }

        function openEvolutionTopDetail(index) {
            const i = Number(index);
            if (!Number.isFinite(i) || i < 0 || i >= evolutionTopRows.length) return;
            const row = evolutionTopRows[i] || {};
            const modal = document.getElementById('evolution-top-detail-modal');
            const meta = document.getElementById('evolution-top-detail-meta');
            const metrics = document.getElementById('evolution-top-detail-metrics');
            const code = document.getElementById('evolution-top-detail-code');
            const score = Number(row?.score || 0);
            const metaFromCode = evolutionExtractStrategyMetaFromCode(row?.strategy_code || '');
            const strategyId = String(row?.strategy_id || metaFromCode.strategy_id || '--');
            const strategyName = String(row?.strategy_name || metaFromCode.strategy_name || '--');
            const className = String(row?.class_name || metaFromCode.class_name || '--');
            if (meta) meta.innerText = `#${i + 1} · 评分=${score.toFixed(2)} · ID=${strategyId} · 名称=${strategyName} · 类名=${className} · ${row?.created_at || '--'}`;
            if (metrics) metrics.innerText = JSON.stringify(row?.metrics || {}, null, 2);
            if (code) code.innerText = String(row?.strategy_code || '--');
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
        }

        function evolutionExtractStrategyMetaFromCode(codeText) {
            const text = String(codeText || '');
            const out = { strategy_id: '', strategy_name: '', class_name: '' };
            if (!text.trim()) return out;
            const classMatch = text.match(/class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
            if (classMatch && classMatch[1]) out.class_name = String(classMatch[1]);
            const superMatch = text.match(/super\(\)\.__init__\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/);
            if (superMatch && superMatch[1]) out.strategy_id = String(superMatch[1]);
            if (superMatch && superMatch[2]) out.strategy_name = String(superMatch[2]);
            return out;
        }

        function closeEvolutionTopDetail() {
            const modal = document.getElementById('evolution-top-detail-modal');
            if (!modal) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }

        function evolutionGetRunFiltersFromUi() {
            // Collect current run-filter form values from dashboard inputs.
            const get = (id) => {
                const el = document.getElementById(id);
                return el ? String(el.value || '').trim() : '';
            };
            return {
                run_id: get('evolution-runs-run-id'),
                child_gene_id: get('evolution-runs-gene-id'),
                parent_strategy_id: get('evolution-runs-parent-id'),
                status: get('evolution-runs-status').toLowerCase(),
                start_time: get('evolution-runs-start-time'),
                end_time: get('evolution-runs-end-time'),
            };
        }

        function evolutionBuildRunsQuery(page = 1) {
            // Build GET query string for /api/evolution/runs with stable pagination params.
            const p = Math.max(1, Number(page || 1));
            const offset = (p - 1) * evolutionRunsPageSize;
            const filters = evolutionGetRunFiltersFromUi();
            const params = new URLSearchParams();
            params.set('limit', String(evolutionRunsPageSize));
            params.set('offset', String(offset));
            Object.entries(filters).forEach(([key, value]) => {
                const v = String(value || '').trim();
                if (v) params.set(key, v);
            });
            return params.toString();
        }

        function renderEvolutionRunsPager() {
            // Render pager text/buttons based on latest query result metadata.
            const pageEl = document.getElementById('evolution-runs-page-text');
            const prevBtn = document.getElementById('evolution-runs-prev-btn');
            const nextBtn = document.getElementById('evolution-runs-next-btn');
            const totalPage = Math.max(1, Math.ceil((Number(evolutionRunsTotal || 0) || 0) / evolutionRunsPageSize));
            const page = Math.max(1, Math.min(totalPage, Number(evolutionRunsPage || 1)));
            evolutionRunsPage = page;
            if (pageEl) pageEl.innerText = `第 ${page} / ${totalPage} 页`;
            if (prevBtn) prevBtn.disabled = page <= 1;
            if (nextBtn) nextBtn.disabled = page >= totalPage;
        }

        function renderEvolutionRuns(rows, count, enabled, errorText = '') {
            // Render run list rows with one-click detail action.
            const wrap = document.getElementById('evolution-runs-wrap');
            const meta = document.getElementById('evolution-runs-meta');
            evolutionRunRows = Array.isArray(rows) ? rows.slice() : [];
            evolutionRunsTotal = Number(count || 0) || 0;
            evolutionRunsLastEnabled = !!enabled;
            if (meta) {
                const statusText = enabled ? `记录：${evolutionRunsTotal}` : '记录：数据库未启用';
                meta.innerText = errorText ? `${statusText} · ${errorText}` : statusText;
            }
            renderEvolutionRunsPager();
            if (!wrap) return;
            if (!enabled) {
                wrap.innerHTML = '<div class="text-slate-500">gene_run_store 未启用，无法查询数据库记录</div>';
                return;
            }
            if (!evolutionRunRows.length) {
                wrap.innerHTML = '<div class="text-slate-500">暂无匹配记录</div>';
                return;
            }
            wrap.innerHTML = evolutionRunRows.map((row, idx) => {
                const runId = String(row?.run_id || '--');
                const status = String(row?.status || '--');
                const scoreNum = Number(row?.score);
                const score = Number.isFinite(scoreNum) ? scoreNum.toFixed(4) : '--';
                const geneId = String(row?.child_gene_id || '--');
                const parent = String(row?.parent_strategy_id || '--');
                const created = String(row?.created_at || '--');
                return `<button onclick="openEvolutionRunDetail(${idx})" class="w-full text-left hover:text-cyan-300">#${idx + 1} ${evolutionEscapeHtml(status)} · score=${evolutionEscapeHtml(score)} · run=${evolutionEscapeHtml(runId)} · gene=${evolutionEscapeHtml(geneId)} · parent=${evolutionEscapeHtml(parent)} · ${evolutionEscapeHtml(created)}</button>`;
            }).join('');
        }

        async function searchEvolutionRuns(page = 1, opts = {}) {
            // Query /api/evolution/runs and update list/pager widgets.
            const p = Math.max(1, Number(page || 1));
            evolutionRunsPage = p;
            const silent = !!opts?.silent;
            const requestSeq = ++evolutionRunsLastRequestSeq;
            const query = evolutionBuildRunsQuery(p);
            try {
                const resp = await fetchJsonWithTimeout(`/api/evolution/runs?${query}`, {}, 12000);
                // Ignore stale responses when newer filter requests are already in-flight.
                if (requestSeq !== evolutionRunsLastRequestSeq) return;
                if (!resp.res.ok || resp.data?.status !== 'success') {
                    if (!silent) setEvolutionStatusText('运行记录查询失败', 'warning');
                    renderEvolutionRuns([], 0, false, '查询失败');
                    return;
                }
                renderEvolutionRuns(
                    resp.data?.rows || [],
                    resp.data?.count || 0,
                    !!resp.data?.enabled,
                    String(resp.data?.error || '').trim(),
                );
            } catch (e) {
                if (requestSeq !== evolutionRunsLastRequestSeq) return;
                renderEvolutionRuns([], 0, false, String(e?.message || e || '查询异常'));
            }
        }

        function scheduleEvolutionRunsSearch(page = 1, delayMs = 450) {
            // Debounce filter-triggered queries to reduce dashboard request pressure.
            if (evolutionRunsDebounceTimer) clearTimeout(evolutionRunsDebounceTimer);
            const p = Math.max(1, Number(page || 1));
            evolutionRunsDebounceTimer = setTimeout(() => {
                evolutionRunsDebounceTimer = null;
                searchEvolutionRuns(p);
            }, Math.max(120, Number(delayMs || 450)));
        }

        function bindEvolutionRunsFilterEvents() {
            // Bind input/select Enter-change behavior for run filter controls.
            const ids = [
                'evolution-runs-run-id',
                'evolution-runs-gene-id',
                'evolution-runs-parent-id',
                'evolution-runs-status',
                'evolution-runs-start-time',
                'evolution-runs-end-time',
            ];
            ids.forEach((id) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.addEventListener('input', () => scheduleEvolutionRunsSearch(1, 520));
                el.addEventListener('change', () => scheduleEvolutionRunsSearch(1, 180));
                el.addEventListener('keydown', (evt) => {
                    if (!evt || evt.key !== 'Enter') return;
                    scheduleEvolutionRunsSearch(1, 0);
                });
            });
        }

        function resetEvolutionRunsFilters() {
            // Reset run filters to blank and refresh first page.
            const ids = [
                'evolution-runs-run-id',
                'evolution-runs-gene-id',
                'evolution-runs-parent-id',
                'evolution-runs-status',
                'evolution-runs-start-time',
                'evolution-runs-end-time',
            ];
            ids.forEach((id) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.value = '';
            });
            if (evolutionRunsDebounceTimer) {
                clearTimeout(evolutionRunsDebounceTimer);
                evolutionRunsDebounceTimer = null;
            }
            searchEvolutionRuns(1);
        }

        function openEvolutionRunDetail(index) {
            // Open detail modal for one run row in current page result.
            const i = Number(index);
            if (!Number.isFinite(i) || i < 0 || i >= evolutionRunRows.length) return;
            const row = evolutionRunRows[i] || {};
            const modal = document.getElementById('evolution-run-detail-modal');
            const meta = document.getElementById('evolution-run-detail-meta');
            const metrics = document.getElementById('evolution-run-detail-metrics');
            const profile = document.getElementById('evolution-run-detail-profile');
            const lineage = document.getElementById('evolution-run-detail-lineage');
            const parentGenes = Array.isArray(row?.child_gene_parent_ids)
                ? row.child_gene_parent_ids
                : (typeof row?.child_gene_parent_ids === 'string' ? [row.child_gene_parent_ids] : []);
            if (meta) {
                meta.innerText = `run_id=${row?.run_id || '--'} · status=${row?.status || '--'} · score=${row?.score ?? '--'} · gene=${row?.child_gene_id || '--'} · commit=${row?.committed_strategy_id || '--'} · ${row?.created_at || '--'}`;
            }
            if (metrics) metrics.innerText = JSON.stringify(row?.metrics || {}, null, 2);
            if (profile) profile.innerText = JSON.stringify(row?.profile || {}, null, 2);
            if (lineage) {
                lineage.innerText = JSON.stringify(
                    {
                        child_gene_id: row?.child_gene_id || '',
                        child_gene_parent_ids: parentGenes,
                        child_gene_fingerprint: row?.child_gene_fingerprint || '',
                        parent_strategy_id: row?.parent_strategy_id || '',
                        parent_strategy_name: row?.parent_strategy_name || '',
                        strategy_id: row?.strategy_id || '',
                        strategy_name: row?.strategy_name || '',
                        committed_strategy_id: row?.committed_strategy_id || '',
                        committed_strategy_name: row?.committed_strategy_name || '',
                        committed_version: row?.committed_version || 0,
                        strategy_code_sha256: row?.strategy_code_sha256 || '',
                    },
                    null,
                    2,
                );
            }
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
        }

        function closeEvolutionRunDetail() {
            // Close run detail modal.
            const modal = document.getElementById('evolution-run-detail-modal');
            if (!modal) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }

        function applyEvolutionTick(row) {
            const record = row && typeof row === 'object' ? row : null;
            if (!record) return;
            const score = (typeof record.score === 'number' && Number.isFinite(record.score)) ? record.score.toFixed(2) : '--';
            const statusLower = String(record.status || '').toLowerCase();
            const statusText = evolutionStatusLabel(record.status || '--');
            setEvolutionStatusText(`迭代 ${record.iteration || '--'} · ${statusText} · 评分=${score}`, statusLower === 'ok' ? 'success' : (statusLower === 'error' ? 'danger' : 'warning'));
            const lsEl = document.getElementById('evolution-last-status');
            const scoreEl = document.getElementById('evolution-last-score');
            const qualifiedEl = document.getElementById('evolution-qualified-strategy');
            if (lsEl) lsEl.innerText = statusText;
            if (scoreEl) scoreEl.innerText = score;
            if (qualifiedEl) qualifiedEl.innerText = evolutionQualifiedStrategyText(record);
            const reason = String(record.reason || record.error || '').trim();
            const llmProvider = String(record.llm_provider || '--');
            const llmPath = String(record.llm_path || '--');
            const llmFallback = record.llm_fallback_used ? '是' : '否';
            const msg = `迭代${record.iteration || '--'} 状态=${statusText} 评分=${score} 耗时=${evolutionCostTextFromMs(record.cost_ms)} 模型=${llmProvider} 路径=${llmPath} 回退=${llmFallback}${reason ? ` 原因=${reason}` : ''}${record.committed ? ` 入库=${record.committed_strategy_id || '--'}` : ''}`;
            appendEvolutionLog(msg, statusLower === 'ok' ? 'success' : (statusLower === 'error' ? 'danger' : 'warning'));
            const next = Array.isArray(evolutionHistoryRows) ? evolutionHistoryRows.slice() : [];
            next.push(record);
            renderEvolutionHistory(next.slice(-100));
            if (record.status === 'ok' && Number(record.iteration || 0) % 3 === 0) {
                refreshEvolutionDashboard({ withTop: true, withRuns: true, withFamilyStats: true, withProfileUpdates: true });
            }
        }

        function applyEvolutionState(state) {
            renderEvolutionStatus(state || {});
            const running = !!state?.running;
            updateEvolutionActionButtons(running);
        }

        function switchEvolutionPlatformTab(tab) {
            const next = ['runtime', 'overview', 'risk', 'deployments', 'alerts', 'backup'].includes(String(tab || '')) ? String(tab) : 'runtime';
            evolutionPlatformTab = next;
            ['runtime', 'overview', 'risk', 'deployments', 'alerts', 'backup'].forEach((name) => {
                const btn = document.getElementById(`evolution-platform-tab-${name}`);
                const panel = document.getElementById(`evolution-platform-panel-${name}`);
                const active = name === next;
                if (btn) {
                    btn.className = active
                        ? 'px-3 py-1 rounded border border-cyan-500 bg-cyan-700 text-white'
                        : 'px-3 py-1 rounded border border-slate-600 bg-slate-800 text-slate-200';
                }
                if (panel) panel.classList.toggle('hidden', !active);
            });
        }

        function setEvolutionPlatformRefreshMeta(text) {
            const meta = document.getElementById('evolution-platform-refresh-meta');
            if (meta) meta.innerText = text;
        }

        function normalizeEvolutionPlatformEventTime(raw) {
            const text = String(raw || '').trim();
            if (!text) return new Date().toISOString();
            return text;
        }

        function touchEvolutionPlatformRealtime(text) {
            evolutionPlatformLastRealtimeAt = normalizeEvolutionPlatformEventTime(new Date().toISOString());
            setEvolutionPlatformRefreshMeta(text || `平台：实时更新 ${evolutionPlatformLastRealtimeAt}`);
        }

        function mergeEvolutionPlatformDeploymentRow(row) {
            const record = row && typeof row === 'object' ? row : null;
            const deploymentId = String(record?.deployment_id || '').trim();
            if (!deploymentId) return false;
            const next = Array.isArray(evolutionPlatformDeploymentRows) ? evolutionPlatformDeploymentRows.slice() : [];
            const index = next.findIndex((item) => String(item?.deployment_id || '').trim() === deploymentId);
            if (index >= 0) next[index] = { ...(next[index] || {}), ...record };
            else next.unshift(record);
            evolutionPlatformDeploymentRows = next.slice(0, 20);
            if (evolutionPlatformOverview?.overview && ['pending', 'running'].includes(String(record?.status || ''))) {
                const active = evolutionPlatformDeploymentRows.filter((item) => ['pending', 'running'].includes(String(item?.status || ''))).length;
                evolutionPlatformOverview = {
                    ...evolutionPlatformOverview,
                    overview: { ...(evolutionPlatformOverview.overview || {}), active_deployments: active },
                };
                renderEvolutionPlatformOverview(evolutionPlatformOverview);
            }
            renderEvolutionPlatformDeployments(evolutionPlatformDeploymentRows);
            return true;
        }

        function prependEvolutionPlatformAlertRow(row) {
            const record = row && typeof row === 'object' ? row : null;
            if (!record) return false;
            const alertId = String(record?.alert_id || '').trim();
            const next = Array.isArray(evolutionPlatformAlertRows) ? evolutionPlatformAlertRows.slice() : [];
            const index = alertId ? next.findIndex((item) => String(item?.alert_id || '').trim() === alertId) : -1;
            if (index >= 0) next[index] = { ...(next[index] || {}), ...record };
            else next.unshift(record);
            evolutionPlatformAlertRows = next.slice(0, 30);
            renderEvolutionPlatformAlerts(evolutionPlatformAlertRows, evolutionPlatformAlertStats || {});
            return true;
        }

        function patchEvolutionPlatformAlertStats(patch) {
            const incoming = patch && typeof patch === 'object' ? patch : null;
            if (!incoming) return false;
            evolutionPlatformAlertStats = { ...(evolutionPlatformAlertStats || {}), ...incoming };
            renderEvolutionPlatformAlerts(evolutionPlatformAlertRows, evolutionPlatformAlertStats);
            return true;
        }

        function patchEvolutionPlatformBackupStatus(patch) {
            const incoming = patch && typeof patch === 'object' ? patch : null;
            if (!incoming) return false;
            evolutionPlatformBackupStatus = { ...(evolutionPlatformBackupStatus || {}), ...incoming };
            renderEvolutionPlatformBackup(evolutionPlatformBackupStatus, evolutionPlatformRecoveryStats || {});
            if (evolutionPlatformOverview?.overview && incoming.active_source !== undefined) {
                evolutionPlatformOverview = {
                    ...evolutionPlatformOverview,
                    overview: { ...(evolutionPlatformOverview.overview || {}), active_backup_source: incoming.active_source || '--' },
                };
                renderEvolutionPlatformOverview(evolutionPlatformOverview);
            }
            return true;
        }

        function patchEvolutionPlatformRecoveryStats(patch) {
            const incoming = patch && typeof patch === 'object' ? patch : null;
            if (!incoming) return false;
            evolutionPlatformRecoveryStats = { ...(evolutionPlatformRecoveryStats || {}), ...incoming };
            renderEvolutionPlatformBackup(evolutionPlatformBackupStatus || {}, evolutionPlatformRecoveryStats);
            return true;
        }

        function applyEvolutionPlatformRealtimeEvent(type, data) {
            const payload = data && typeof data === 'object' ? data : {};
            let applied = false;
            if (type === 'platform_deployment_update') {
                applied = mergeEvolutionPlatformDeploymentRow(payload?.data || payload);
                touchEvolutionPlatformRealtime(`平台：部署实时更新 ${payload?.deployment_id || payload?.data?.deployment_id || ''}`.trim());
            } else if (type === 'platform_alert_sent') {
                const message = payload?.message;
                const stats = payload?.stats;
                if (message && typeof message === 'object') {
                    applied = prependEvolutionPlatformAlertRow(message) || applied;
                }
                if (stats && typeof stats === 'object') {
                    applied = patchEvolutionPlatformAlertStats(stats) || applied;
                } else if (payload?.channel) {
                    const channels = new Set(Array.isArray(evolutionPlatformAlertStats?.active_channels) ? evolutionPlatformAlertStats.active_channels : []);
                    if (payload?.enabled) channels.add(String(payload.channel));
                    else channels.delete(String(payload.channel));
                    applied = patchEvolutionPlatformAlertStats({ active_channels: Array.from(channels) }) || applied;
                }
                touchEvolutionPlatformRealtime(`平台：告警实时更新 ${payload?.channel || message?.title || ''}`.trim());
            } else if (type === 'platform_backup_status') {
                if (payload?.backup_status && typeof payload.backup_status === 'object') {
                    applied = patchEvolutionPlatformBackupStatus(payload.backup_status) || applied;
                }
                if (payload?.status === 'success' && payload?.name) {
                    const breakers = { ...((evolutionPlatformRecoveryStats?.circuit_breakers || {})) };
                    if (breakers[payload.name]) {
                        breakers[payload.name] = { ...(breakers[payload.name] || {}), state: 'closed', failure_count: 0 };
                    }
                    applied = patchEvolutionPlatformRecoveryStats({ circuit_breakers: breakers }) || applied;
                }
                touchEvolutionPlatformRealtime(`平台：备份实时更新 ${payload?.data_key || payload?.name || ''}`.trim());
            }
            if (!applied && isEvolutionBoardModalOpen()) {
                refreshEvolutionPlatformDashboard();
            }
        }

        function renderEvolutionPlatformOverview(payload) {
            evolutionPlatformOverview = payload && typeof payload === 'object' ? payload : null;
            const overview = evolutionPlatformOverview?.overview || {};
            const modules = Array.isArray(evolutionPlatformOverview?.modules) ? evolutionPlatformOverview.modules : [];
            const setText = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.innerText = value;
            };
            setText('platform-overview-running', `${overview.evolution_running ? '运行中' : '已停止'} / 轮次 ${overview.evolution_iteration ?? '--'}`);
            setText('platform-overview-monitors', String(overview.monitoring_strategies ?? '--'));
            setText('platform-overview-alerts', String(overview.active_risk_alerts ?? '--'));
            setText('platform-overview-deployments', String(overview.active_deployments ?? '--'));
            setText('platform-overview-backup-source', String(overview.active_backup_source || '--'));
            const wrap = document.getElementById('platform-overview-modules');
            if (wrap) {
                if (!modules.length) wrap.innerHTML = '<div class="text-slate-500">暂无</div>';
                else wrap.innerHTML = modules.map((item) => {
                    const ok = item?.healthy ? '正常' : '异常';
                    return `<div>[${evolutionEscapeHtml(item?.name || '--')}] ${evolutionEscapeHtml(ok)} · ${evolutionEscapeHtml(item?.summary || '--')}</div>`;
                }).join('');
            }
        }

        function renderEvolutionPlatformRisk(payload) {
            evolutionPlatformRiskOverview = payload && typeof payload === 'object' ? payload : null;
            const setText = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.innerText = value;
            };
            const perf = evolutionPlatformRiskOverview?.performance?.global_stats || {};
            setText('platform-risk-monitor-count', String(evolutionPlatformRiskOverview?.monitoring_strategies ?? '--'));
            setText('platform-risk-alert-count', String(evolutionPlatformRiskOverview?.active_alerts ?? '--'));
            setText('platform-risk-avg-cost', String(perf?.avg_calculation_time || '--'));
            setText('platform-risk-summary-pill', evolutionPlatformRiskOverview?.system_running ? '监控中' : '待命');
            const cross = document.getElementById('platform-risk-cross-summary');
            if (cross) {
                const summary = evolutionPlatformRiskOverview?.cross_summary || {};
                const metrics = summary?.aggregated_metrics || {};
                const keys = Object.keys(metrics || {});
                if (!keys.length) cross.innerHTML = '<div class="text-slate-500">暂无</div>';
                else cross.innerHTML = keys.slice(0, 8).map((key) => `<div>${evolutionEscapeHtml(key)} = ${evolutionEscapeHtml(evolutionFormatNumber(metrics[key], 3))}</div>`).join('');
            }
            const comp = document.getElementById('platform-compliance-summary');
            if (comp && !String(comp.innerHTML || '').trim()) {
                comp.innerHTML = '<div class="text-slate-400">输入 strategy_id 后可直接发起检查</div>';
            }
        }

        function renderEvolutionPlatformDeployments(rows) {
            evolutionPlatformDeploymentRows = Array.isArray(rows) ? rows.slice() : [];
            const wrap = document.getElementById('platform-deployments-wrap');
            if (!wrap) return;
            if (!evolutionPlatformDeploymentRows.length) {
                wrap.innerHTML = '<div class="text-slate-500">暂无</div>';
                return;
            }
            wrap.innerHTML = evolutionPlatformDeploymentRows.map((item, idx) => {
                const duration = evolutionFormatNumber(item?.duration, 2);
                const cancelBtn = ['pending', 'running'].includes(String(item?.status || ''))
                    ? `<button type="button" onclick="triggerEvolutionDeploymentCancel('${evolutionEscapeHtml(item?.deployment_id || '')}')" class="ml-2 px-2 py-0.5 rounded border border-rose-500 text-rose-200 hover:bg-rose-900/40">取消</button>`
                    : '';
                return `<div>#${idx + 1} ${evolutionEscapeHtml(item?.status || '--')} · ${evolutionEscapeHtml(item?.strategy_id || '--')} · v${evolutionEscapeHtml(item?.version || '--')} · stage=${evolutionEscapeHtml(item?.stage || '--')} · ${evolutionEscapeHtml(item?.start_time || '--')} · ${duration}s${cancelBtn}</div>`;
            }).join('');
        }

        function renderEvolutionPlatformAlerts(rows, stats) {
            evolutionPlatformAlertRows = Array.isArray(rows) ? rows.slice() : [];
            evolutionPlatformAlertStats = stats && typeof stats === 'object' ? stats : null;
            const setText = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.innerText = value;
            };
            setText('platform-alerts-total-sent', String(evolutionPlatformAlertStats?.total_sent ?? '--'));
            setText('platform-alerts-total-failed', String(evolutionPlatformAlertStats?.total_failed ?? '--'));
            setText('platform-alerts-success-rate', `${evolutionFormatNumber(evolutionPlatformAlertStats?.success_rate, 2)}%`);
            setText('platform-alerts-active-channels', Array.isArray(evolutionPlatformAlertStats?.active_channels) && evolutionPlatformAlertStats.active_channels.length ? evolutionPlatformAlertStats.active_channels.join(',') : '--');
            const wrap = document.getElementById('platform-alerts-wrap');
            if (!wrap) return;
            if (!evolutionPlatformAlertRows.length) {
                wrap.innerHTML = '<div class="text-slate-500">暂无</div>';
                return;
            }
            wrap.innerHTML = evolutionPlatformAlertRows.slice(0, 30).map((item, idx) => `<div>#${idx + 1} [${evolutionEscapeHtml(item?.level || '--')}] ${evolutionEscapeHtml(item?.title || '--')} · sid=${evolutionEscapeHtml(item?.strategy_id || '--')} · ${evolutionEscapeHtml(item?.timestamp || '--')}</div>`).join('');
        }

        function renderEvolutionPlatformBackup(backupStatus, recoveryStats) {
            evolutionPlatformBackupStatus = backupStatus && typeof backupStatus === 'object' ? backupStatus : null;
            evolutionPlatformRecoveryStats = recoveryStats && typeof recoveryStats === 'object' ? recoveryStats : null;
            const setText = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.innerText = value;
            };
            setText('platform-backup-pending', String(evolutionPlatformBackupStatus?.pending_tasks ?? '--'));
            setText('platform-backup-progress', String(evolutionPlatformBackupStatus?.in_progress_tasks ?? '--'));
            setText('platform-backup-completed', String(evolutionPlatformBackupStatus?.completed_tasks ?? '--'));
            setText('platform-backup-failed', String(evolutionPlatformBackupStatus?.failed_tasks ?? '--'));
            setText('platform-backup-auto', evolutionPlatformBackupStatus?.auto_backup_enabled ? '开启' : '关闭');
            const sourceWrap = document.getElementById('platform-backup-sources');
            if (sourceWrap) {
                const rows = evolutionPlatformBackupStatus?.sources_status || {};
                const keys = Object.keys(rows);
                if (!keys.length) sourceWrap.innerHTML = '<div class="text-slate-500">暂无</div>';
                else sourceWrap.innerHTML = keys.map((key) => {
                    const row = rows[key] || {};
                    const health = row.healthy ? 'healthy' : 'down';
                    return `<div>${evolutionEscapeHtml(key)} · ${evolutionEscapeHtml(row.type || '--')} · ${evolutionEscapeHtml(health)} · priority=${evolutionEscapeHtml(row.priority)}</div>`;
                }).join('');
            }
            const recoveryWrap = document.getElementById('platform-recovery-wrap');
            if (recoveryWrap) {
                const breakers = evolutionPlatformRecoveryStats?.circuit_breakers || {};
                const recent = Array.isArray(evolutionPlatformRecoveryStats?.recent_errors) ? evolutionPlatformRecoveryStats.recent_errors : [];
                const breakerKeys = Object.keys(breakers || {});
                const parts = [];
                parts.push(`<div>错误数=${evolutionEscapeHtml(evolutionPlatformRecoveryStats?.error_count ?? '--')}</div>`);
                if (breakerKeys.length) {
                    parts.push(...breakerKeys.slice(0, 6).map((key) => `<div>熔断器 ${evolutionEscapeHtml(key)} · state=${evolutionEscapeHtml(breakers[key]?.state || '--')} · fail=${evolutionEscapeHtml(breakers[key]?.failure_count ?? '--')}</div>`));
                }
                if (recent.length) {
                    parts.push(`<div class="text-slate-400 mt-1">最近错误：</div>`);
                    parts.push(...recent.slice(0, 5).map((row) => `<div>${evolutionEscapeHtml(row?.source || '--')} / ${evolutionEscapeHtml(row?.operation || '--')} / ${evolutionEscapeHtml(row?.error_type || '--')}</div>`));
                }
                recoveryWrap.innerHTML = parts.length ? parts.join('') : '<div class="text-slate-500">暂无</div>';
            }
        }

        function setEvolutionPlatformActionStatus(id, text, tone = 'muted') {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerText = text;
            el.className = tone === 'error'
                ? 'text-[11px] text-rose-300'
                : tone === 'success'
                    ? 'text-[11px] text-emerald-300'
                    : tone === 'busy'
                        ? 'text-[11px] text-amber-300'
                        : 'text-[11px] text-slate-400';
        }

        function getEvolutionPlatformInputValue(id) {
            return String(document.getElementById(id)?.value || '').trim();
        }

        async function triggerEvolutionRiskAssess() {
            const strategyId = getEvolutionPlatformInputValue('platform-risk-strategy-id');
            if (!strategyId) {
                setEvolutionPlatformActionStatus('platform-risk-action-status', '请输入 strategy_id', 'error');
                return;
            }
            setEvolutionPlatformActionStatus('platform-risk-action-status', '风险评估中...', 'busy');
            try {
                const resp = await fetchJsonWithTimeout('/api/evolution/platform/risk/assess', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ strategy_id: strategyId, strategy_data: { strategy_id: strategyId } }),
                }, 15000);
                const payload = resp?.data?.data || {};
                const comp = document.getElementById('platform-compliance-summary');
                if (comp) {
                    comp.innerHTML = [
                        `<div>风险等级=${evolutionEscapeHtml(payload?.overall_level || '--')}</div>`,
                        `<div>风险评分=${evolutionEscapeHtml(evolutionFormatNumber(payload?.overall_score, 2))}</div>`,
                        `<div>建议=${evolutionEscapeHtml((payload?.recommendations || []).slice(0, 3).join('；') || '--')}</div>`,
                    ].join('');
                }
                setEvolutionPlatformActionStatus('platform-risk-action-status', '风险评估完成', 'success');
            } catch (e) {
                setEvolutionPlatformActionStatus('platform-risk-action-status', `风险评估失败`, 'error');
            }
        }

        async function triggerEvolutionComplianceCheck() {
            const strategyId = getEvolutionPlatformInputValue('platform-risk-strategy-id');
            if (!strategyId) {
                setEvolutionPlatformActionStatus('platform-risk-action-status', '请输入 strategy_id', 'error');
                return;
            }
            setEvolutionPlatformActionStatus('platform-risk-action-status', '合规检查中...', 'busy');
            try {
                const resp = await fetchJsonWithTimeout('/api/evolution/platform/compliance/check', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ strategy_id: strategyId, data: { strategy_id: strategyId } }),
                }, 15000);
                const payload = resp?.data?.data || {};
                const comp = document.getElementById('platform-compliance-summary');
                if (comp) {
                    comp.innerHTML = [
                        `<div>合规等级=${evolutionEscapeHtml(payload?.overall_level || '--')}</div>`,
                        `<div>通过规则=${evolutionEscapeHtml(payload?.passed_rules ?? '--')} / ${evolutionEscapeHtml(payload?.total_rules ?? '--')}</div>`,
                        `<div>建议=${evolutionEscapeHtml((payload?.recommendations || []).slice(0, 3).join('；') || '--')}</div>`,
                    ].join('');
                }
                setEvolutionPlatformActionStatus('platform-risk-action-status', '合规检查完成', 'success');
            } catch (e) {
                setEvolutionPlatformActionStatus('platform-risk-action-status', '合规检查失败', 'error');
            }
        }

        async function triggerEvolutionDeploymentStart() {
            const strategyId = getEvolutionPlatformInputValue('platform-deployment-strategy-id');
            if (!strategyId) {
                setEvolutionPlatformActionStatus('platform-deployment-action-status', '请输入 strategy_id', 'error');
                return;
            }
            setEvolutionPlatformActionStatus('platform-deployment-action-status', '部署发起中...', 'busy');
            try {
                const resp = await fetchJsonWithTimeout('/api/evolution/platform/deployments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        strategy_id: strategyId,
                        version: getEvolutionPlatformInputValue('platform-deployment-version') || null,
                        environment: getEvolutionPlatformInputValue('platform-deployment-environment') || 'production',
                        strategy_data: { strategy_id: strategyId, code: `class ${strategyId.replace(/[^A-Za-z0-9_]/g, '_') || 'Strategy'}:\n    pass\n` },
                    }),
                }, 20000);
                const deploymentId = resp?.data?.data?.deployment_id || resp?.data?.data?.data?.deployment_id || '';
                const cancelInput = document.getElementById('platform-deployment-cancel-id');
                if (cancelInput && deploymentId) cancelInput.value = deploymentId;
                const deploymentPayload = resp?.data?.data?.data || resp?.data?.data || null;
                if (deploymentPayload && typeof deploymentPayload === 'object') {
                    mergeEvolutionPlatformDeploymentRow(deploymentPayload);
                    touchEvolutionPlatformRealtime(`平台：部署已发起 ${deploymentId || deploymentPayload?.strategy_id || ''}`.trim());
                }
                setEvolutionPlatformActionStatus('platform-deployment-action-status', deploymentId ? `已创建 ${deploymentId}` : '部署已发起', 'success');
            } catch (e) {
                setEvolutionPlatformActionStatus('platform-deployment-action-status', '部署发起失败', 'error');
            }
        }

        async function triggerEvolutionDeploymentCancel(explicitId = '') {
            const deploymentId = String(explicitId || getEvolutionPlatformInputValue('platform-deployment-cancel-id') || '').trim();
            if (!deploymentId) {
                setEvolutionPlatformActionStatus('platform-deployment-action-status', '请输入 deployment_id', 'error');
                return;
            }
            setEvolutionPlatformActionStatus('platform-deployment-action-status', '取消部署中...', 'busy');
            try {
                const resp = await fetchJsonWithTimeout(`/api/evolution/platform/deployments/${encodeURIComponent(deploymentId)}/cancel`, { method: 'POST' }, 15000);
                const deploymentPayload = resp?.data?.data?.data || resp?.data?.data || null;
                if (deploymentPayload && typeof deploymentPayload === 'object') {
                    mergeEvolutionPlatformDeploymentRow(deploymentPayload);
                    touchEvolutionPlatformRealtime(`平台：部署已取消 ${deploymentId}`);
                }
                setEvolutionPlatformActionStatus('platform-deployment-action-status', `已取消 ${deploymentId}`, 'success');
            } catch (e) {
                setEvolutionPlatformActionStatus('platform-deployment-action-status', '取消部署失败', 'error');
            }
        }

        async function triggerEvolutionTestAlert() {
            const title = getEvolutionPlatformInputValue('platform-alert-title');
            const content = String(document.getElementById('platform-alert-content')?.value || '').trim();
            if (!title || !content) {
                setEvolutionPlatformActionStatus('platform-alert-action-status', '请输入标题和内容', 'error');
                return;
            }
            const channel = getEvolutionPlatformInputValue('platform-alert-channel');
            setEvolutionPlatformActionStatus('platform-alert-action-status', '发送测试告警中...', 'busy');
            try {
                const resp = await fetchJsonWithTimeout('/api/evolution/platform/alerts/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title,
                        content,
                        level: getEvolutionPlatformInputValue('platform-alert-level') || 'warning',
                        strategy_id: getEvolutionPlatformInputValue('platform-alert-strategy-id') || null,
                        channels: channel ? [channel] : [],
                    }),
                }, 20000);
                const alertPayload = resp?.data?.data || null;
                if (alertPayload?.message) {
                    prependEvolutionPlatformAlertRow(alertPayload.message);
                }
                patchEvolutionPlatformAlertStats(alertPayload?.stats || {});
                touchEvolutionPlatformRealtime(`平台：测试告警已发送 ${title}`);
                setEvolutionPlatformActionStatus('platform-alert-action-status', '测试告警已发送', 'success');
            } catch (e) {
                setEvolutionPlatformActionStatus('platform-alert-action-status', '测试告警失败', 'error');
            }
        }

        async function toggleEvolutionAlertChannel(enabled) {
            const channel = getEvolutionPlatformInputValue('platform-alert-channel');
            if (!channel) {
                setEvolutionPlatformActionStatus('platform-alert-action-status', '请输入 channel', 'error');
                return;
            }
            setEvolutionPlatformActionStatus('platform-alert-action-status', enabled ? '启用渠道中...' : '禁用渠道中...', 'busy');
            try {
                const path = enabled ? 'enable' : 'disable';
                const resp = await fetchJsonWithTimeout(`/api/evolution/platform/alerts/channels/${encodeURIComponent(channel)}/${path}`, { method: 'POST' }, 15000);
                const payload = resp?.data?.data || null;
                if (payload?.stats) {
                    patchEvolutionPlatformAlertStats(payload.stats);
                } else {
                    const channels = new Set(Array.isArray(evolutionPlatformAlertStats?.active_channels) ? evolutionPlatformAlertStats.active_channels : []);
                    if (enabled) channels.add(String(channel));
                    else channels.delete(String(channel));
                    patchEvolutionPlatformAlertStats({ active_channels: Array.from(channels) });
                }
                touchEvolutionPlatformRealtime(`平台：${enabled ? '启用' : '禁用'}渠道 ${channel}`);
                setEvolutionPlatformActionStatus('platform-alert-action-status', enabled ? `已启用 ${channel}` : `已禁用 ${channel}`, 'success');
            } catch (e) {
                setEvolutionPlatformActionStatus('platform-alert-action-status', '渠道切换失败', 'error');
            }
        }

        async function triggerEvolutionBackupRun() {
            const dataKey = getEvolutionPlatformInputValue('platform-backup-data-key');
            if (!dataKey) {
                setEvolutionPlatformActionStatus('platform-backup-action-status', '请输入 data_key', 'error');
                return;
            }
            setEvolutionPlatformActionStatus('platform-backup-action-status', '执行备份中...', 'busy');
            try {
                const resp = await fetchJsonWithTimeout('/api/evolution/platform/backup/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        data_key: dataKey,
                        source_type: getEvolutionPlatformInputValue('platform-backup-source-type') || null,
                        data: { data_key: dataKey, triggered_from: 'dashboard', triggered_at: new Date().toISOString() },
                    }),
                }, 20000);
                const payload = resp?.data?.data || null;
                if (payload?.backup_status) {
                    patchEvolutionPlatformBackupStatus(payload.backup_status);
                }
                touchEvolutionPlatformRealtime(`平台：备份已触发 ${dataKey}`);
                setEvolutionPlatformActionStatus('platform-backup-action-status', `备份已触发 ${dataKey}`, 'success');
            } catch (e) {
                setEvolutionPlatformActionStatus('platform-backup-action-status', '执行备份失败', 'error');
            }
        }

        async function triggerEvolutionBackupRestore() {
            const dataKey = getEvolutionPlatformInputValue('platform-backup-data-key');
            if (!dataKey) {
                setEvolutionPlatformActionStatus('platform-backup-action-status', '请输入 data_key', 'error');
                return;
            }
            setEvolutionPlatformActionStatus('platform-backup-action-status', '恢复备份中...', 'busy');
            try {
                const resp = await fetchJsonWithTimeout('/api/evolution/platform/backup/restore', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        data_key: dataKey,
                        source_type: getEvolutionPlatformInputValue('platform-backup-source-type') || null,
                    }),
                }, 20000);
                const restored = resp?.data?.data?.data;
                const backupPayload = resp?.data?.data || null;
                if (backupPayload?.backup_status) {
                    patchEvolutionPlatformBackupStatus(backupPayload.backup_status);
                }
                touchEvolutionPlatformRealtime(`平台：恢复完成 ${dataKey}`);
                setEvolutionPlatformActionStatus('platform-backup-action-status', `恢复完成 ${dataKey}`, 'success');
                if (restored && typeof restored === 'object') {
                    const recoveryWrap = document.getElementById('platform-recovery-wrap');
                    if (recoveryWrap) {
                        recoveryWrap.innerHTML = `<div class="text-emerald-300">最近恢复成功：${evolutionEscapeHtml(dataKey)}</div><div class="text-slate-300">${evolutionEscapeHtml(JSON.stringify(restored).slice(0, 300))}</div>`;
                    }
                }
            } catch (e) {
                setEvolutionPlatformActionStatus('platform-backup-action-status', '恢复备份失败', 'error');
            }
        }

        async function triggerEvolutionCircuitBreakerReset() {
            const name = getEvolutionPlatformInputValue('platform-recovery-breaker-name');
            if (!name) {
                setEvolutionPlatformActionStatus('platform-backup-action-status', '请输入熔断器名称', 'error');
                return;
            }
            setEvolutionPlatformActionStatus('platform-backup-action-status', '重置熔断器中...', 'busy');
            try {
                const resp = await fetchJsonWithTimeout('/api/evolution/platform/recovery/circuit-breaker/reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name }),
                }, 15000);
                const payload = resp?.data?.data || null;
                if (payload?.name) {
                    const breakers = { ...((evolutionPlatformRecoveryStats?.circuit_breakers || {})) };
                    breakers[payload.name] = { ...(breakers[payload.name] || {}), state: 'closed', failure_count: 0 };
                    patchEvolutionPlatformRecoveryStats({ circuit_breakers: breakers });
                }
                touchEvolutionPlatformRealtime(`平台：已重置熔断器 ${name}`);
                setEvolutionPlatformActionStatus('platform-backup-action-status', `已重置 ${name}`, 'success');
            } catch (e) {
                setEvolutionPlatformActionStatus('platform-backup-action-status', '重置熔断器失败', 'error');
            }
        }

        async function refreshEvolutionPlatformDashboard() {
            try {
                const started = Date.now();
                const results = await Promise.all([
                    fetchJsonWithTimeout('/api/evolution/platform/overview', {}, 10000),
                    fetchJsonWithTimeout('/api/evolution/platform/risk/overview', {}, 10000),
                    fetchJsonWithTimeout('/api/evolution/platform/deployments?limit=20', {}, 10000),
                    fetchJsonWithTimeout('/api/evolution/platform/alerts?hours=72', {}, 10000),
                    fetchJsonWithTimeout('/api/evolution/platform/alerts/stats', {}, 10000),
                    fetchJsonWithTimeout('/api/evolution/platform/backup/status', {}, 10000),
                    fetchJsonWithTimeout('/api/evolution/platform/recovery/stats', {}, 10000),
                ]);
                const elapsed = Date.now() - started;
                setEvolutionPlatformRefreshMeta(`平台：已刷新 ${elapsed}ms`);
                const [overviewResp, riskResp, deployResp, alertsResp, alertStatsResp, backupResp, recoveryResp] = results;
                if (overviewResp.res.ok && overviewResp.data.status === 'success') renderEvolutionPlatformOverview(overviewResp.data);
                if (riskResp.res.ok && riskResp.data.status === 'success') renderEvolutionPlatformRisk(riskResp.data);
                if (deployResp.res.ok && deployResp.data.status === 'success') renderEvolutionPlatformDeployments(deployResp.data.rows || []);
                if (alertsResp.res.ok && alertsResp.data.status === 'success') {
                    const statsData = (alertStatsResp.res.ok && alertStatsResp.data.status === 'success') ? (alertStatsResp.data.data || {}) : {};
                    renderEvolutionPlatformAlerts(alertsResp.data.rows || [], statsData);
                }
                if (backupResp.res.ok && backupResp.data.status === 'success') {
                    const recoveryData = (recoveryResp.res.ok && recoveryResp.data.status === 'success') ? (recoveryResp.data.data || {}) : {};
                    renderEvolutionPlatformBackup(backupResp.data.data || {}, recoveryData);
                }
            } catch (e) {
                setEvolutionPlatformRefreshMeta(`平台：刷新失败`);
            }
        }

        async function refreshEvolutionDashboard(options = {}) {
            const withHistory = options.withHistory !== false;
            const withTop = options.withTop !== false;
            const withRuns = options.withRuns === true;
            const withFamilyStats = options.withFamilyStats === true;
            const withProfileUpdates = options.withProfileUpdates === true;
            const withConcurrency = options.withConcurrency === true;
            const withTimingLog = options.withTimingLog === true;
            try {
                const started = Date.now();
                const reqs = [fetchJsonWithTimeout('/api/evolution/status', {}, 10000)];
                if (withHistory) reqs.push(fetchJsonWithTimeout('/api/evolution/history?limit=80', {}, 10000));
                if (withTop) reqs.push(fetchJsonWithTimeout('/api/evolution/top?k=15', {}, 10000));
                if (withRuns) reqs.push(fetchJsonWithTimeout(`/api/evolution/runs?${evolutionBuildRunsQuery(evolutionRunsPage)}`, {}, 12000));
                if (withFamilyStats) reqs.push(fetchJsonWithTimeout('/api/evolution/family_stats', {}, 10000));
                if (withProfileUpdates) reqs.push(fetchJsonWithTimeout('/api/evolution/profile/updates?limit=20', {}, 10000));
                if (withConcurrency) reqs.push(fetchJsonWithTimeout('/api/evolution/concurrency', {}, 10000));
                const results = await Promise.all(reqs);
                const elapsed = Date.now() - started;
                if (withTimingLog) {
                    appendEvolutionLog(`看板数据刷新完成，耗时 ${elapsed}ms`, elapsed > 3500 ? 'warning' : 'info');
                }
                const statusResp = results[0];
                if (statusResp.res.ok && statusResp.data.status === 'success') {
                    applyEvolutionState(statusResp.data.state || {});
                }
                let idx = 1;
                if (withHistory) {
                    const historyResp = results[idx++];
                    if (historyResp.res.ok && historyResp.data.status === 'success') {
                        renderEvolutionHistory(historyResp.data.rows || []);
                        rebuildEvolutionLogsFromHistory(historyResp.data.rows || []);
                    }
                }
                if (withTop) {
                    const topResp = results[idx++];
                    if (topResp.res.ok && topResp.data.status === 'success') {
                        renderEvolutionTop(topResp.data.rows || []);
                    }
                }
                if (withRuns) {
                    const runResp = results[idx++];
                    if (runResp.res.ok && runResp.data.status === 'success') {
                        renderEvolutionRuns(
                            runResp.data.rows || [],
                            runResp.data.count || 0,
                            !!runResp.data.enabled,
                            String(runResp.data.error || '').trim(),
                        );
                    }
                }
                if (withFamilyStats) {
                    const familyResp = results[idx++];
                    if (familyResp.res.ok && familyResp.data.status === 'success') {
                        renderEvolutionFamilyStats(
                            familyResp.data.rows || [],
                            !!familyResp.data.enabled,
                            String(familyResp.data.error || '').trim(),
                            familyResp.data.family_weights || null,
                        );
                    }
                }
                if (withProfileUpdates) {
                    const updateResp = results[idx++];
                    if (updateResp.res.ok && updateResp.data.status === 'success') {
                        renderEvolutionProfileUpdates(updateResp.data.rows || []);
                    }
                }
                if (withConcurrency) {
                    const concurrencyResp = results[idx++];
                    if (concurrencyResp.res.ok && concurrencyResp.data.status === 'success') {
                        renderEvolutionConcurrencyStatus(concurrencyResp.data.concurrency || {});
                    }
                }
            } catch (e) {
                if (withTimingLog) {
                    appendEvolutionLog(`看板数据刷新失败：${e?.message || e}`, 'warning');
                }
            }
        }

        function logMessage(module, message, type = 'info', eventClock = '') {
            const timeline = document.getElementById('imperial-timeline');
            const el = document.createElement('div');
            el.className = 'flex gap-2 animate-pulse min-w-0';
            const moduleText = String(module || '') === 'SYSTEM' ? '系统' : module;
            const moduleColorMap = {
                '中书省': 'text-trading-blue',
                '门下省': 'text-trading-yellow',
                '尚书省': 'text-trading-red',
                '吏部': 'text-purple-400',
                '户部': 'text-trading-yellow',
                '礼部': 'text-blue-400',
                '兵部': 'text-red-500',
                '刑部': 'text-orange-500',
                '工部': 'text-cyan-400',
                '太子院': 'text-indigo-400',
                '系统': 'text-trading-blue'
            };
            const aliasColorMap = {
                '策略中心': 'text-trading-blue',
                '策略研究中心': 'text-trading-blue',
                '风控中心': 'text-trading-yellow',
                '风控审核中心': 'text-trading-yellow',
                '执行中心': 'text-trading-red',
                '指令执行中心': 'text-trading-red',
                '资金中心': 'text-purple-400',
                '数据中心': 'text-cyan-400',
                '合规中心': 'text-blue-400'
            };
            const resolveModuleColor = (name) => {
                if (moduleColorMap[name]) return moduleColorMap[name];
                if (aliasColorMap[name]) return aliasColorMap[name];
                const n = String(name || '');
                if (n.includes('策略')) return 'text-trading-blue';
                if (n.includes('风控')) return 'text-trading-yellow';
                if (n.includes('执行')) return 'text-trading-red';
                if (n.includes('合规')) return 'text-blue-400';
                if (n.includes('数据')) return 'text-cyan-400';
                if (n.includes('资金')) return 'text-purple-400';
                return '';
            };
            
            let color = resolveModuleColor(moduleText) || 'text-slate-300';
            if (!resolveModuleColor(moduleText)) {
                if (type === 'success') color = 'text-trading-green';
                if (type === 'warning') color = 'text-trading-yellow';
                if (type === 'danger') color = 'text-trading-red';
                if (type === 'system') color = 'text-trading-blue';
            }

            el.innerHTML = `
                <span class="text-slate-500 shrink-0">[${eventClock || getTime()}]</span>
                <span class="font-bold w-16 text-right ${color} shrink-0">${moduleText}</span>
                <span class="text-slate-200 flex-1 min-w-0 break-words whitespace-pre-wrap">${message}</span>
            `;
            
            timeline.appendChild(el);
            timeline.scrollTop = timeline.scrollHeight;

            setTimeout(() => el.classList.remove('animate-pulse'), 1000);
        }

        function updateCard(id, html, statusColor = null) {
            const el = document.getElementById(id);
            if(el) {
                el.innerHTML = html;
                el.scrollTop = el.scrollHeight;
            }
            
            if (statusColor) {
                const statusDot = document.getElementById(`status-${id.split('-')[1]}`);
                if(statusDot) {
                    // Extract color from class (e.g., bg-trading-green)
                    // Simplified: just use the passed class
                    statusDot.className = `status-dot ${statusColor} shadow-[0_0_8px_currentColor]`;
                }
            }
        }

        function updateDisclaimerAccess() {
            const overlay = document.getElementById('disclaimer-overlay');
            const checkbox = document.getElementById('disclaimer-agree-checkbox');
            const enterBtn = document.getElementById('disclaimer-enter-btn');
            if (!overlay || !checkbox || !enterBtn) return;
            disclaimerAccepted = !!checkbox.checked;
            enterBtn.disabled = !disclaimerAccepted;
            if (disclaimerAccepted) {
                enterBtn.classList.remove('cursor-not-allowed', 'opacity-60', 'bg-blue-600/50');
                enterBtn.classList.add('hover:bg-blue-500', 'bg-blue-600');
            } else {
                enterBtn.classList.add('cursor-not-allowed', 'opacity-60', 'bg-blue-600/50');
                enterBtn.classList.remove('hover:bg-blue-500', 'bg-blue-600');
            }
        }

        function enterSystemByDisclaimer() {
            const overlay = document.getElementById('disclaimer-overlay');
            const checkbox = document.getElementById('disclaimer-agree-checkbox');
            const accepted = !!(checkbox && checkbox.checked);
            disclaimerAccepted = accepted;
            if (!overlay || !accepted) return;
            try {
                localStorage.setItem(DISCLAIMER_ACCEPT_KEY, JSON.stringify({
                    accepted: true,
                    ts: Date.now()
                }));
                if (currentServerBootId) {
                    localStorage.setItem(DISCLAIMER_LAST_BOOT_KEY, currentServerBootId);
                }
            } catch (_) {}
            overlay.classList.remove('active');
        }

        async function applyInitialDisclaimerState() {
            const checkbox = document.getElementById('disclaimer-agree-checkbox');
            let skipOnce = false;
            let forceRecheck = false;
            let acceptedPersisted = false;
            let acceptedBootId = '';
            let liveBootId = '';
            try {
                skipOnce = sessionStorage.getItem(DISCLAIMER_SKIP_ONCE_KEY) === '1';
                if (skipOnce) sessionStorage.removeItem(DISCLAIMER_SKIP_ONCE_KEY);
                forceRecheck = sessionStorage.getItem(DISCLAIMER_FORCE_RECHECK_KEY) === '1';
                if (forceRecheck) sessionStorage.removeItem(DISCLAIMER_FORCE_RECHECK_KEY);
            } catch (_) {}
            try {
                const raw = localStorage.getItem(DISCLAIMER_ACCEPT_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    const ts = Number(parsed && parsed.ts ? parsed.ts : 0);
                    const accepted = !!(parsed && parsed.accepted);
                    const notExpired = ts > 0 && (Date.now() - ts) <= DISCLAIMER_ACCEPT_TTL_MS;
                    acceptedPersisted = accepted && notExpired;
                }
                acceptedBootId = String(localStorage.getItem(DISCLAIMER_LAST_BOOT_KEY) || '').trim();
                if (forceRecheck || !acceptedPersisted) {
                    localStorage.removeItem(DISCLAIMER_ACCEPT_KEY);
                    localStorage.removeItem(DISCLAIMER_LAST_BOOT_KEY);
                    acceptedPersisted = false;
                }
            } catch (_) {
                acceptedPersisted = false;
            }
            try {
                const { res, data } = await fetchJsonWithTimeout('/api/status/light', {}, 5000);
                if (res.ok) {
                    liveBootId = String(data?.server_boot_id || '').trim();
                    if (liveBootId) currentServerBootId = liveBootId;
                }
            } catch (_) {}
            if (!skipOnce && acceptedPersisted && liveBootId) {
                if (!acceptedBootId || acceptedBootId !== liveBootId) {
                    forceRecheck = true;
                    acceptedPersisted = false;
                    try {
                        localStorage.removeItem(DISCLAIMER_ACCEPT_KEY);
                        localStorage.removeItem(DISCLAIMER_LAST_BOOT_KEY);
                    } catch (_) {}
                }
            }
            if (skipOnce || acceptedPersisted) {
                disclaimerAccepted = true;
                if (checkbox) checkbox.checked = true;
            }
            updateDisclaimerAccess();
            if (skipOnce || acceptedPersisted) enterSystemByDisclaimer();
        }
        
        // Initial Log
        logMessage('SYSTEM', '控制台就绪，等待连接...', 'info');
        restoreConsoleState();
        loadEvolutionFamilyAlertPresetPreference();
        loadEvolutionFamilyAlertThresholdPreference();
        loadOpsHubPinState();
        applyInitialDisclaimerState();
        document.getElementById('disclaimer-agree-checkbox')?.addEventListener('change', updateDisclaimerAccess);
        document.getElementById('disclaimer-enter-btn')?.addEventListener('click', enterSystemByDisclaimer);
        document.getElementById('kline-modal')?.addEventListener('click', (e) => {
            if (e.target && e.target.id === 'kline-modal') closeKlineModal();
        });
        document.getElementById('webhook-retry-modal')?.addEventListener('click', (e) => {
            if (e.target && e.target.id === 'webhook-retry-modal') closeWebhookRetryCenter();
        });
        document.getElementById('fundamental-detail-modal')?.addEventListener('click', (e) => {
            if (e.target && e.target.id === 'fundamental-detail-modal') closeFundamentalDetailModal();
        });
        document.getElementById('fundamental-module-detail-modal')?.addEventListener('click', (e) => {
            if (e.target && e.target.id === 'fundamental-module-detail-modal') closeFundamentalModuleDetailModal();
        });
        document.getElementById('fundamental-detail-scroll')?.addEventListener('scroll', saveFundamentalDetailScroll);
        document.getElementById('evolution-top-detail-modal')?.addEventListener('click', (e) => {
            if (e.target && e.target.id === 'evolution-top-detail-modal') closeEvolutionTopDetail();
        });
        document.getElementById('evolution-run-detail-modal')?.addEventListener('click', (e) => {
            if (e.target && e.target.id === 'evolution-run-detail-modal') closeEvolutionRunDetail();
        });
        document.getElementById('evolution-seed-source')?.addEventListener('change', renderEvolutionSeedSourceUi);
        document.getElementById('evolution-seed-search')?.addEventListener('input', renderEvolutionSeedSourceUi);
        document.getElementById('strategy-multi-search')?.addEventListener('input', updateStrategyMultiListUI);
        document.getElementById('evolution-family-alert-preset')?.addEventListener('change', (evt) => {
            const preset = String(evt?.target?.value || '').trim().toLowerCase();
            evolutionFamilyAlertPreset = preset || 'balanced';
            const threshold = evolutionPresetToThreshold(evolutionFamilyAlertPreset);
            const thresholdSel = document.getElementById('evolution-family-alert-threshold');
            if (thresholdSel) thresholdSel.value = threshold;
            evolutionFamilyAlertThresholdOverride = threshold;
            persistEvolutionFamilyAlertPresetPreference(evolutionFamilyAlertPreset);
            persistEvolutionFamilyAlertThresholdPreference(threshold);
            renderEvolutionFamilyStats(
                evolutionFamilyStatsRows,
                evolutionFamilyStatsEnabled,
                evolutionFamilyStatsError,
                evolutionFamilyWeightsSnapshot,
            );
        });
        document.getElementById('evolution-family-alert-threshold')?.addEventListener('change', (evt) => {
            const value = String(evt?.target?.value || '').trim();
            evolutionFamilyAlertThresholdOverride = value;
            evolutionFamilyAlertPreset = evolutionThresholdToPreset(value);
            const presetSel = document.getElementById('evolution-family-alert-preset');
            if (presetSel) presetSel.value = evolutionFamilyAlertPreset;
            persistEvolutionFamilyAlertPresetPreference(evolutionFamilyAlertPreset);
            persistEvolutionFamilyAlertThresholdPreference(value);
            renderEvolutionFamilyStats(
                evolutionFamilyStatsRows,
                evolutionFamilyStatsEnabled,
                evolutionFamilyStatsError,
                evolutionFamilyWeightsSnapshot,
            );
        });
        bindEvolutionRunsFilterEvents();
        document.addEventListener('keydown', (e) => {
            try {
                const hardReload = !!(e && e.ctrlKey && !e.shiftKey && String(e.key || '').toLowerCase() === 'f5');
                if (hardReload) {
                    sessionStorage.setItem(DISCLAIMER_FORCE_RECHECK_KEY, '1');
                }
            } catch (_) {}
            if (e && e.key === 'Escape') {
                closeOpsHubModal();
                closeFundamentalModuleDetailModal();
                closeFundamentalDetailModal();
                closeEvolutionTopDetail();
                closeEvolutionRunDetail();
            }
        });
        window.addEventListener('resize', () => {
            const container = document.getElementById('kline-modal-chart');
            if (klineChart && container && klineModalOpened) {
                klineChart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
            }
            syncActionLayout();
            renderLiveStatus();
        });
        onBacktestRangeChange(document.getElementById('bt-range-select')?.value || '1y');
        searchInput.addEventListener('change', persistConsoleState);
        searchInput.addEventListener('change', () => scheduleStrategyRegimeHintRefresh(true));
        document.getElementById('bt-start-date')?.addEventListener('change', persistConsoleState);
        document.getElementById('bt-end-date')?.addEventListener('change', persistConsoleState);
        document.getElementById('bt-start-date')?.addEventListener('change', () => scheduleStrategyRegimeHintRefresh(true));
        document.getElementById('bt-end-date')?.addEventListener('change', () => scheduleStrategyRegimeHintRefresh(true));
        document.getElementById('bt-capital-input')?.addEventListener('input', persistConsoleState);
        setInterval(() => scheduleStrategyRegimeHintRefresh(false), 60000);
        setInterval(() => {
            const modal = document.getElementById('webhook-retry-modal');
            if (modal && !modal.classList.contains('hidden')) {
                reloadWebhookFailedEvents();
            }
        }, 15000);
        setInterval(() => {
            syncStatus();
        }, 3000);
        setInterval(() => {
            // Evolution 默认走 WS 推送，此处仅做兜底修正，避免网络抖动导致的状态漂移
            refreshEvolutionDashboard({
                withHistory: false,
                withTop: false,
                // Only refresh DB run list while board is visible to reduce query pressure.
                withRuns: isEvolutionBoardModalOpen(),
                withFamilyStats: isEvolutionBoardModalOpen(),
                withProfileUpdates: isEvolutionBoardModalOpen(),
            });
            if (isEvolutionBoardModalOpen()) {
                refreshEvolutionPlatformDashboard();
            }
        }, 10000);
        scheduleStrategyRegimeHintRefresh(true);
        refreshEvolutionDashboard({ withHistory: true, withTop: true, withRuns: false, withProfileUpdates: true });
        refreshEvolutionPlatformDashboard();
        renderEvolutionSeedSourceUi();
        tryAutoOpenConfigFromQuery();
        setTimeout(() => {
            if (!strategyCatalog.length) fetchGlobalStrategies();
        }, 800);
        syncActionLayout();
        renderLiveStatus();
        updateConfidenceScore();
        updateRevenueCashRatioBar();
        persistConsoleState();

    