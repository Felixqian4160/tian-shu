"""
旧版策略进化监控仪表板。

此模块仅保留为历史参考实现；统一入口已经收敛到：
- 后端：server.py
- 前端：dashboard.html

请勿再把本模块作为独立 FastAPI 服务入口启动。
"""
import json
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import logging

from ..risk.optimized_risk_monitor import optimized_risk_monitoring_system
from ..risk.risk_monitor import risk_monitoring_system, RiskAlertLevel
from ..deployment.deployment_pipeline import deployment_pipeline, DeploymentStatus
from ..risk.risk_rating_system import risk_rating_system
from ..compliance.compliance_engine import compliance_engine


class DashboardConfig:
    """仪表板配置"""
    def __init__(self):
        self.title = "金策智算 - 策略进化监控中心"
        self.refresh_interval = 5000  # 5秒刷新
        self.max_history_points = 100
        self.websocket_port = 8001


class MonitoringDashboard:
    """旧版监控仪表板，仅保留参考逻辑，不再作为主入口。"""
    
    def __init__(self, config: Optional[DashboardConfig] = None):
        self.config = config or DashboardConfig()
        self.app = FastAPI(title=self.config.title)
        self.connected_clients: List[WebSocket] = []
        
        # 设置路由
        self._setup_routes()
        
        # 启动后台任务
        self._start_background_tasks()
    
    def _setup_routes(self):
        """设置路由"""
        
        @self.app.get("/", response_class=HTMLResponse)
        async def get_dashboard():
            """获取仪表板页面"""
            return self._generate_dashboard_html()
        
        @self.app.get("/api/system/status")
        async def get_system_status():
            """获取系统状态"""
            return await self._get_system_status()
        
        @self.app.get("/api/strategies/{strategy_id}/risk")
        async def get_strategy_risk(strategy_id: str):
            """获取策略风险状态"""
            return await self._get_strategy_risk(strategy_id)
        
        @self.app.get("/api/strategies/{strategy_id}/risk/history")
        async def get_strategy_risk_history(strategy_id: str, hours: int = 24):
            """获取策略风险历史"""
            return self._get_strategy_risk_history(strategy_id, hours)
        
        @self.app.get("/api/deployments")
        async def get_deployments():
            """获取部署状态"""
            return self._get_deployments()
        
        @self.app.get("/api/deployments/{deployment_id}")
        async def get_deployment_detail(deployment_id: str):
            """获取部署详情"""
            return self._get_deployment_detail(deployment_id)
        
        @self.app.get("/api/alerts")
        async def get_alerts():
            """获取告警信息"""
            return self._get_alerts()
        
        @self.app.get("/api/performance")
        async def get_performance_stats():
            """获取性能统计"""
            return self._get_performance_stats()
        
        @self.app.websocket("/ws")
        async def websocket_endpoint(websocket: WebSocket):
            """WebSocket端点"""
            await self._handle_websocket(websocket)
    
    def _generate_dashboard_html(self) -> str:
        """生成仪表板HTML"""
        return f"""
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{self.config.title}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            color: #333;
        }}
        
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 1rem 2rem;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }}
        
        .header h1 {{
            font-size: 1.8rem;
            font-weight: 600;
        }}
        
        .container {{
            max-width: 1400px;
            margin: 0 auto;
            padding: 2rem;
        }}
        
        .grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }}
        
        .card {{
            background: white;
            border-radius: 12px;
            padding: 1.5rem;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            transition: transform 0.2s, box-shadow 0.2s;
        }}
        
        .card:hover {{
            transform: translateY(-2px);
            box-shadow: 0 8px 15px rgba(0,0,0,0.2);
        }}
        
        .card-title {{
            font-size: 1.2rem;
            font-weight: 600;
            margin-bottom: 1rem;
            color: #2c3e50;
        }}
        
        .status-indicator {{
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 0.5rem;
        }}
        
        .status-online {{ background: #27ae60; }}
        .status-warning {{ background: #f39c12; }}
        .status-error {{ background: #e74c3c; }}
        .status-offline {{ background: #95a5a6; }}
        
        .metric-value {{
            font-size: 2rem;
            font-weight: bold;
            color: #2c3e50;
        }}
        
        .metric-label {{
            color: #7f8c8d;
            font-size: 0.9rem;
            margin-top: 0.5rem;
        }}
        
        .alert-item {{
            padding: 0.75rem;
            margin: 0.5rem 0;
            border-radius: 6px;
            border-left: 4px solid;
        }}
        
        .alert-critical {{
            background: #fdf2f2;
            border-left-color: #e74c3c;
        }}
        
        .alert-warning {{
            background: #fef9e7;
            border-left-color: #f39c12;
        }}
        
        .alert-info {{
            background: #e8f4f8;
            border-left-color: #3498db;
        }}
        
        .deployment-item {{
            padding: 1rem;
            border: 1px solid #ecf0f1;
            border-radius: 6px;
            margin: 0.5rem 0;
        }}
        
        .deployment-status {{
            display: inline-block;
            padding: 0.25rem 0.75rem;
            border-radius: 12px;
            font-size: 0.8rem;
            font-weight: 600;
        }}
        
        .status-success {{ background: #d4edda; color: #155724; }}
        .status-running {{ background: #cce5ff; color: #004085; }}
        .status-failed {{ background: #f8d7da; color: #721c24; }}
        
        .chart-container {{
            position: relative;
            height: 300px;
            margin-top: 1rem;
        }}
        
        .progress-bar {{
            width: 100%;
            height: 8px;
            background: #ecf0f1;
            border-radius: 4px;
            overflow: hidden;
            margin: 0.5rem 0;
        }}
        
        .progress-fill {{
            height: 100%;
            background: linear-gradient(90deg, #3498db, #2ecc71);
            transition: width 0.3s ease;
        }}
        
        .connection-status {{
            position: fixed;
            top: 1rem;
            right: 1rem;
            padding: 0.5rem 1rem;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
        }}
        
        .connected {{ background: #d4edda; color: #155724; }}
        .disconnected {{ background: #f8d7da; color: #721c24; }}
        
        @media (max-width: 768px) {{
            .container {{
                padding: 1rem;
            }}
            
            .grid {{
                grid-template-columns: 1fr;
            }}
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 {self.config.title}</h1>
    </div>
    
    <div class="connection-status" id="connectionStatus">
        🔴 连接中...
    </div>
    
    <div class="container">
        <!-- 系统概览 -->
        <div class="grid">
            <div class="card">
                <div class="card-title">📊 系统状态</div>
                <div class="metric-value" id="totalStrategies">-</div>
                <div class="metric-label">监控策略数</div>
            </div>
            
            <div class="card">
                <div class="card-title">⚠️ 活跃告警</div>
                <div class="metric-value" id="activeAlerts">-</div>
                <div class="metric-label">需要关注</div>
            </div>
            
            <div class="card">
                <div class="card-title">🔄 部署状态</div>
                <div class="metric-value" id="activeDeployments">-</div>
                <div class="metric-label">进行中</div>
            </div>
            
            <div class="card">
                <div class="card-title">⚡ 性能</div>
                <div class="metric-value" id="avgResponseTime">-</div>
                <div class="metric-label">平均响应时间(ms)</div>
            </div>
        </div>
        
        <!-- 风险监控 -->
        <div class="card">
            <div class="card-title">🎯 风险监控概览</div>
            <div class="chart-container">
                <canvas id="riskChart"></canvas>
            </div>
        </div>
        
        <!-- 最新告警 -->
        <div class="card">
            <div class="card-title">🚨 最新告警</div>
            <div id="alertsList">
                <div style="text-align: center; color: #7f8c8d; padding: 2rem;">
                    加载中...
                </div>
            </div>
        </div>
        
        <!-- 部署状态 -->
        <div class="card">
            <div class="card-title">📦 部署状态</div>
            <div id="deploymentsList">
                <div style="text-align: center; color: #7f8c8d; padding: 2rem;">
                    加载中...
                </div>
            </div>
        </div>
        
        <!-- 性能统计 -->
        <div class="card">
            <div class="card-title">📈 性能统计</div>
            <div class="chart-container">
                <canvas id="performanceChart"></canvas>
            </div>
        </div>
    </div>
    
    <script>
        class MonitoringDashboard {{
            constructor() {{
                this.ws = null;
                this.reconnectInterval = null;
                this.charts = {{}};
                this.init();
            }}
            
            init() {{
                this.connectWebSocket();
                this.initCharts();
                this.loadInitialData();
                this.startAutoRefresh();
            }}
            
            connectWebSocket() {{
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = `${{protocol}}//${{window.location.host}}/ws`;
                
                this.ws = new WebSocket(wsUrl);
                
                this.ws.onopen = () => {{
                    console.log('WebSocket连接已建立');
                    this.updateConnectionStatus(true);
                    if (this.reconnectInterval) {{
                        clearInterval(this.reconnectInterval);
                        this.reconnectInterval = null;
                    }}
                }};
                
                this.ws.onmessage = (event) => {{
                    const data = JSON.parse(event.data);
                    this.handleRealtimeUpdate(data);
                }};
                
                this.ws.onclose = () => {{
                    console.log('WebSocket连接已关闭');
                    this.updateConnectionStatus(false);
                    this.scheduleReconnect();
                }};
                
                this.ws.onerror = (error) => {{
                    console.error('WebSocket错误:', error);
                }};
            }}
            
            scheduleReconnect() {{
                if (!this.reconnectInterval) {{
                    this.reconnectInterval = setInterval(() => {{
                        console.log('尝试重新连接...');
                        this.connectWebSocket();
                    }}, 5000);
                }}
            }}
            
            updateConnectionStatus(connected) {{
                const statusEl = document.getElementById('connectionStatus');
                if (connected) {{
                    statusEl.className = 'connection-status connected';
                    statusEl.innerHTML = '🟢 已连接';
                }} else {{
                    statusEl.className = 'connection-status disconnected';
                    statusEl.innerHTML = '🔴 连接断开';
                }}
            }}
            
            initCharts() {{
                // 风险监控图表
                const riskCtx = document.getElementById('riskChart').getContext('2d');
                this.charts.risk = new Chart(riskCtx, {{
                    type: 'radar',
                    data: {{
                        labels: ['持仓风险', '市场风险', '流动性风险', '集中度风险', '波动率风险'],
                        datasets: [{{
                            label: '当前风险',
                            data: [0, 0, 0, 0, 0],
                            backgroundColor: 'rgba(255, 99, 132, 0.2)',
                            borderColor: 'rgba(255, 99, 132, 1)',
                            borderWidth: 2
                        }}]
                    }},
                    options: {{
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {{
                            r: {{
                                beginAtZero: true,
                                max: 100
                            }}
                        }}
                    }}
                }});
                
                // 性能统计图表
                const perfCtx = document.getElementById('performanceChart').getContext('2d');
                this.charts.performance = new Chart(perfCtx, {{
                    type: 'line',
                    data: {{
                        labels: [],
                        datasets: [{{
                            label: '响应时间(ms)',
                            data: [],
                            borderColor: 'rgb(75, 192, 192)',
                            backgroundColor: 'rgba(75, 192, 192, 0.2)',
                            tension: 0.1
                        }}]
                    }},
                    options: {{
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {{
                            y: {{
                                beginAtZero: true
                            }}
                        }}
                    }}
                }});
            }}
            
            async loadInitialData() {{
                try {{
                    // 加载系统状态
                    const statusResponse = await axios.get('/api/system/status');
                    this.updateSystemStatus(statusResponse.data);
                    
                    // 加载告警
                    const alertsResponse = await axios.get('/api/alerts');
                    this.updateAlerts(alertsResponse.data);
                    
                    // 加载部署状态
                    const deploymentsResponse = await axios.get('/api/deployments');
                    this.updateDeployments(deploymentsResponse.data);
                    
                    // 加载性能统计
                    const perfResponse = await axios.get('/api/performance');
                    this.updatePerformance(perfResponse.data);
                    
                }} catch (error) {{
                    console.error('加载初始数据失败:', error);
                }}
            }}
            
            handleRealtimeUpdate(data) {{
                switch(data.type) {{
                    case 'system_status':
                        this.updateSystemStatus(data.data);
                        break;
                    case 'alert':
                        this.addNewAlert(data.data);
                        break;
                    case 'deployment_update':
                        this.updateDeploymentStatus(data.data);
                        break;
                    case 'performance_update':
                        this.updatePerformanceChart(data.data);
                        break;
                }}
            }}
            
            updateSystemStatus(data) {{
                document.getElementById('totalStrategies').textContent = data.total_strategies || 0;
                document.getElementById('activeAlerts').textContent = data.active_alerts || 0;
                document.getElementById('activeDeployments').textContent = data.active_deployments || 0;
                document.getElementById('avgResponseTime').textContent = data.avg_response_time || '-';
                
                // 更新风险图表
                if (data.risk_metrics) {{
                    this.charts.risk.data.datasets[0].data = [
                        data.risk_metrics.position_risk || 0,
                        data.risk_metrics.market_risk || 0,
                        data.risk_metrics.liquidity_risk || 0,
                        data.risk_metrics.concentration_risk || 0,
                        data.risk_metrics.volatility_risk || 0
                    ];
                    this.charts.risk.update();
                }}
            }}
            
            updateAlerts(alerts) {{
                const alertsList = document.getElementById('alertsList');
                
                if (!alerts || alerts.length === 0) {{
                    alertsList.innerHTML = '<div style="text-align: center; color: #27ae60; padding: 2rem;">✅ 暂无告警</div>';
                    return;
                }}
                
                alertsList.innerHTML = alerts.slice(0, 5).map(alert => {{
                    const alertClass = alert.level === 'critical' ? 'alert-critical' : 
                                     alert.level === 'warning' ? 'alert-warning' : 'alert-info';
                    const levelText = alert.level === 'critical' ? '🚨 严重' :
                                    alert.level === 'warning' ? '⚠️ 警告' : 'ℹ️ 关注';
                    
                    return `
                        <div class="alert-item ${{alertClass}}">
                            <div style="font-weight: 600; margin-bottom: 0.5rem;">
                                ${{levelText}} - ${{alert.metric_type}}
                            </div>
                            <div style="font-size: 0.9rem; color: #7f8c8d;">
                                ${{alert.message}}
                            </div>
                            <div style="font-size: 0.8rem; color: #95a5a6; margin-top: 0.5rem;">
                                ${{new Date(alert.timestamp).toLocaleString()}}
                            </div>
                        </div>
                    `;
                }}).join('');
            }}
            
            updateDeployments(deployments) {{
                const deploymentsList = document.getElementById('deploymentsList');
                
                if (!deployments || deployments.length === 0) {{
                    deploymentsList.innerHTML = '<div style="text-align: center; color: #7f8c8d; padding: 2rem;">暂无部署记录</div>';
                    return;
                }}
                
                deploymentsList.innerHTML = deployments.slice(0, 5).map(deployment => {{
                    const statusClass = deployment.status === 'success' ? 'status-success' :
                                     deployment.status === 'running' ? 'status-running' : 'status-failed';
                    const statusText = deployment.status === 'success' ? '成功' :
                                    deployment.status === 'running' ? '进行中' : '失败';
                    
                    return `
                        <div class="deployment-item">
                            <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 0.5rem;">
                                <div style="font-weight: 600;">${{deployment.strategy_id}}</div>
                                <div class="deployment-status ${{statusClass}}">${{statusText}}</div>
                            </div>
                            <div style="font-size: 0.9rem; color: #7f8c8d;">
                                版本: ${{deployment.version}} | 
                                开始时间: ${{new Date(deployment.start_time).toLocaleString()}}
                            </div>
                            ${{deployment.duration ? `<div style="font-size: 0.8rem; color: #95a5a6; margin-top: 0.25rem;">耗时: ${{deployment.duration.toFixed(2)}}s</div>` : ''}}
                        </div>
                    `;
                }}).join('');
            }}
            
            updatePerformance(data) {{
                if (data.global_stats && data.global_stats.avg_calculation_time) {{
                    const avgTime = parseFloat(data.global_stats.avg_calculation_time) * 1000;
                    document.getElementById('avgResponseTime').textContent = avgTime.toFixed(2);
                }}
            }}
            
            updatePerformanceChart(data) {{
                const chart = this.charts.performance;
                const now = new Date().toLocaleTimeString();
                
                chart.data.labels.push(now);
                chart.data.datasets[0].data.push(data.response_time || 0);
                
                // 保持最多50个数据点
                if (chart.data.labels.length > 50) {{
                    chart.data.labels.shift();
                    chart.data.datasets[0].data.shift();
                }}
                
                chart.update('none');
            }}
            
            addNewAlert(alert) {{
                // 如果有新告警，刷新告警列表
                this.loadInitialData();
            }}
            
            updateDeploymentStatus(deployment) {{
                // 如果有部署状态更新，刷新部署列表
                this.loadInitialData();
            }}
            
            startAutoRefresh() {{
                // 每30秒刷新一次数据
                setInterval(() => {{
                    this.loadInitialData();
                }}, 30000);
            }}
        }}
        
        // 启动仪表板
        document.addEventListener('DOMContentLoaded', () => {{
            new MonitoringDashboard();
        }});
    </script>
</body>
</html>
        """
    
    async def _get_system_status(self) -> Dict[str, Any]:
        """获取系统状态"""
        try:
            # 获取风险监控系统状态
            risk_status = risk_monitoring_system.get_system_status()
            
            # 获取部署系统状态
            deployment_history = deployment_pipeline.get_deployment_history(limit=10)
            active_deployments = len([
                d for d in deployment_history 
                if d.status in [DeploymentStatus.PENDING, DeploymentStatus.RUNNING]
            ])
            
            # 获取性能统计
            perf_stats = optimized_risk_monitoring_system.get_system_performance_stats()
            
            # 计算平均响应时间
            avg_response_time = 0
            if perf_stats['global_stats']['total_requests'] > 0:
                avg_response_time = float(
                    perf_stats['global_stats']['avg_calculation_time'].replace('s', '')
                ) * 1000
            
            return {
                "total_strategies": risk_status["monitoring_strategies"],
                "active_alerts": risk_status["active_alerts"],
                "active_deployments": active_deployments,
                "avg_response_time": f"{avg_response_time:.2f}",
                "risk_metrics": self._get_aggregated_risk_metrics(),
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logging.error(f"获取系统状态失败: {e}")
            return {"error": str(e)}
    
    async def _get_strategy_risk(self, strategy_id: str) -> Dict[str, Any]:
        """获取策略风险状态"""
        try:
            # 获取风险监控状态
            if strategy_id in risk_monitoring_system.monitors:
                risk_status = risk_monitoring_system.monitors[strategy_id].get_current_risk_status()
            else:
                risk_status = {"status": "not_monitored"}
            
            return risk_status
            
        except Exception as e:
            logging.error(f"获取策略风险状态失败 {strategy_id}: {e}")
            return {"error": str(e)}
    
    def _get_strategy_risk_history(self, strategy_id: str, hours: int) -> Dict[str, Any]:
        """获取策略风险历史"""
        try:
            if strategy_id in risk_monitoring_system.monitors:
                risk_history = risk_monitoring_system.monitors[strategy_id].get_risk_history(hours)
                return risk_history
            else:
                return {"status": "not_monitored"}
                
        except Exception as e:
            logging.error(f"获取策略风险历史失败 {strategy_id}: {e}")
            return {"error": str(e)}
    
    def _get_deployments(self) -> List[Dict[str, Any]]:
        """获取部署状态"""
        try:
            deployments = deployment_pipeline.get_deployment_history(limit=20)
            
            return [
                {
                    "deployment_id": d.deployment_id,
                    "strategy_id": d.strategy_id,
                    "version": d.version,
                    "status": d.status.value,
                    "start_time": d.start_time.isoformat(),
                    "duration": d.duration,
                    "steps_completed": d.steps_completed,
                    "total_steps": d.total_steps
                }
                for d in deployments
            ]
            
        except Exception as e:
            logging.error(f"获取部署状态失败: {e}")
            return [{"error": str(e)}]
    
    def _get_deployment_detail(self, deployment_id: str) -> Dict[str, Any]:
        """获取部署详情"""
        try:
            deployment = deployment_pipeline.get_deployment_status(deployment_id)
            
            if not deployment:
                return {"error": "部署不存在"}
            
            return {
                "deployment_id": deployment.deployment_id,
                "strategy_id": deployment.strategy_id,
                "version": deployment.version,
                "stage": deployment.stage.value,
                "status": deployment.status.value,
                "start_time": deployment.start_time.isoformat(),
                "end_time": deployment.end_time.isoformat() if deployment.end_time else None,
                "duration": deployment.duration,
                "steps_completed": deployment.steps_completed,
                "total_steps": deployment.total_steps,
                "error_message": deployment.error_message,
                "logs": deployment.logs
            }
            
        except Exception as e:
            logging.error(f"获取部署详情失败 {deployment_id}: {e}")
            return {"error": str(e)}
    
    def _get_alerts(self) -> List[Dict[str, Any]]:
        """获取告警信息"""
        try:
            all_alerts = []
            
            # 收集所有策略的告警
            for strategy_id, monitor in risk_monitoring_system.monitors.items():
                status = monitor.get_current_risk_status()
                
                if status.get("latest_alerts"):
                    for alert in status["latest_alerts"]:
                        all_alerts.append({
                            "strategy_id": strategy_id,
                            "metric_type": alert["metric_type"],
                            "level": alert["level"],
                            "message": alert["message"],
                            "timestamp": alert["timestamp"]
                        })
            
            # 按时间排序
            all_alerts.sort(key=lambda x: x["timestamp"], reverse=True)
            
            return all_alerts[:50]  # 返回最新50条告警
            
        except Exception as e:
            logging.error(f"获取告警信息失败: {e}")
            return [{"error": str(e)}]
    
    def _get_performance_stats(self) -> Dict[str, Any]:
        """获取性能统计"""
        try:
            return optimized_risk_monitoring_system.get_system_performance_stats()
            
        except Exception as e:
            logging.error(f"获取性能统计失败: {e}")
            return {"error": str(e)}
    
    def _get_aggregated_risk_metrics(self) -> Dict[str, float]:
        """获取聚合风险指标"""
        try:
            all_metrics = {}
            
            for strategy_id, monitor in risk_monitoring_system.monitors.items():
                status = monitor.get_current_risk_status()
                risk_metrics = status.get("risk_metrics", {})
                
                for metric_name, value in risk_metrics.items():
                    if value is not None:
                        if metric_name not in all_metrics:
                            all_metrics[metric_name] = []
                        all_metrics[metric_name].append(value)
            
            # 计算平均值
            avg_metrics = {}
            for metric_name, values in all_metrics.items():
                if values:
                    avg_metrics[metric_name] = sum(values) / len(values)
            
            return avg_metrics
            
        except Exception as e:
            logging.error(f"获取聚合风险指标失败: {e}")
            return {}
    
    async def _handle_websocket(self, websocket: WebSocket):
        """处理WebSocket连接"""
        await websocket.accept()
        self.connected_clients.append(websocket)
        
        try:
            while True:
                # 保持连接活跃
                await websocket.receive_text()
                
        except WebSocketDisconnect:
            self.connected_clients.remove(websocket)
        except Exception as e:
            logging.error(f"WebSocket处理错误: {e}")
            if websocket in self.connected_clients:
                self.connected_clients.remove(websocket)
    
    async def _broadcast_update(self, data: Dict[str, Any]):
        """广播更新到所有连接的客户端"""
        if not self.connected_clients:
            return
        
        message = json.dumps(data)
        disconnected_clients = []
        
        for client in self.connected_clients:
            try:
                await client.send_text(message)
            except Exception:
                disconnected_clients.append(client)
        
        # 清理断开的连接
        for client in disconnected_clients:
            if client in self.connected_clients:
                self.connected_clients.remove(client)
    
    def _start_background_tasks(self):
        """旧版入口已退役，不再自动启动独立后台推送任务。"""
        return
    
    async def _realtime_data_pusher(self):
        """实时数据推送器"""
        while True:
            try:
                # 每10秒推送一次系统状态更新
                system_status = await self._get_system_status()
                await self._broadcast_update({
                    "type": "system_status",
                    "data": system_status
                })
                
                await asyncio.sleep(10)
                
            except Exception as e:
                logging.error(f"实时数据推送失败: {e}")
                await asyncio.sleep(5)
    
    def run(self, host: str = "0.0.0.0", port: int = 8001):
        """旧版独立入口已退役。请改用 server.py + dashboard.html。"""
        raise RuntimeError(
            "Legacy monitoring_dashboard entrypoint has been retired. "
            "Use `python server.py` and open dashboard.html via the unified main server instead."
        )


# 保留实例仅用于兼容 import 场景，不再作为独立服务入口使用。
monitoring_dashboard = MonitoringDashboard()
