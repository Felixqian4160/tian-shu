# 三省六部回测内阁 API 接口文档

本文档描述了如何通过 HTTP 接口与量化交易系统进行交互，适用于 OpenClaw 智能体或其他外部系统。

**基础地址 (Base URL):** `http://localhost:8000`

---

## 1. 策略热更新 (Hot Reload)

在不重启服务的情况下，重新加载 `src/strategies/` 目录下的策略代码。

- **接口地址:** `/api/control/reload_strategies`
- **请求方法:** `POST`
- **Content-Type:** `application/json` (可选，无请求体)

**请求示例 (cURL):**
```bash
curl -X POST http://localhost:8000/api/control/reload_strategies
```

**响应示例 (成功):**
```json
{
    "status": "success",
    "msg": "Successfully reloaded 8 strategies.",
    "strategies": ["01: 三周期共振", "02: 短线弱转强", "08: 神奇九转"]
}
```

---

## 2. 启动历史回测 (Start Backtest)

启动指定股票的历史数据回测任务。

- **接口地址:** `/api/control/start_backtest`
- **请求方法:** `POST`
- **Content-Type:** `application/json`

**请求参数 (JSON):**

| 参数名 | 类型 | 必填 | 说明 | 示例值 |
| :--- | :--- | :--- | :--- | :--- |
| `stock_code` | string | 是 | 股票代码 (Tushare 格式) | `"600036.SH"` |
| `strategy_id` | string | 否 | 策略ID，默认 "all" 运行所有策略 | `"all"` 或 `"08"` |

**请求示例:**
```json
{
    "stock_code": "600036.SH",
    "strategy_id": "all"
}
```

**响应示例:**
```json
{
    "status": "success",
    "msg": "Backtest started for 600036.SH"
}
```

---

## 3. 启动实盘/模拟盘 (Start Live Simulation)

启动对一个或多个股票的实时行情监控和策略信号扫描。

- **接口地址:** `/api/control/start_live`
- **请求方法:** `POST`
- **Content-Type:** `application/json`

**请求参数 (JSON):**

| 参数名 | 类型 | 必填 | 说明 | 示例值 |
| :--- | :--- | :--- | :--- | :--- |
| `stock_code` | string | 否 | 单个股票代码 | `"000001.SZ"` |
| `stock_codes` | string[] | 否 | 多个股票代码 | `["000001.SZ","600036.SH"]` |
| `strategy_id` | string | 否 | 对本次启动股票统一指定单策略 | `"08"` |
| `strategy_ids` | string[] | 否 | 对本次启动股票统一指定多策略 | `["08","34R1"]` |
| `stock_strategy_map` | object | 否 | 每个股票独立策略画像，key=股票代码，value=策略ID数组 | `{"000001.SZ":["08"],"600036.SH":["34R1"]}` |
| `replace_existing` | boolean | 否 | 是否替换当前已运行实盘任务（默认 true） | `true` |

**请求示例:**
```json
{
    "stock_codes": ["000001.SZ", "600036.SH"],
    "stock_strategy_map": {
        "000001.SZ": ["08"],
        "600036.SH": ["34R1", "34R1U"]
    },
    "replace_existing": true
}
```

**响应示例:**
```json
{
    "status": "success",
    "msg": "Live monitoring started for 000001.SZ,600036.SH",
    "started_codes": ["000001.SZ", "600036.SH"],
    "running_codes": ["000001.SZ", "600036.SH"],
    "strategy_profiles": {
        "000001.SZ": ["08"],
        "600036.SH": ["34R1", "34R1U"]
    }
}
```

---

## 4. 停止任务 (Stop Task)

停止当前正在运行的回测或实盘任务。

- **接口地址:** `/api/control/stop`
- **请求方法:** `POST`

**请求示例:**
```bash
curl -X POST http://localhost:8000/api/control/stop
```

**响应示例:**
```json
{
    "status": "success",
    "msg": "Task stopped"
}
```

---

## 5. 切换当前策略 (Switch Strategy)

在任务运行过程中，动态切换生效的策略组合。

- **接口地址:** `/api/control/switch_strategy`
- **请求方法:** `POST`
- **Content-Type:** `application/json`

**请求参数 (JSON):**

| 参数名 | 类型 | 必填 | 说明 | 示例值 |
| :--- | :--- | :--- | :--- | :--- |
| `strategy_id` | string | 否 | 单个策略ID | `"08"` |
| `strategy_ids` | string[] | 否 | 多策略ID | `["08","34R1"]` |
| `stock_codes` | string[] | 否 | 仅对指定股票切换策略，不传则作用于全部运行中的实盘任务 | `["000001.SZ"]` |
| `stock_strategy_map` | object | 否 | 按股票独立切换策略，优先于统一策略参数 | `{"000001.SZ":["08"],"600036.SH":["34R1"]}` |

**请求示例:**
```json
{
    "stock_strategy_map": {
        "000001.SZ": ["08"],
        "600036.SH": ["34R1", "34R1U"]
    }
}
```

---

## 6. 获取系统状态 (System Status)

查询当前系统是否正在运行任务。

- **接口地址:** `/api/status`
- **请求方法:** `GET`

**响应示例:**
```json
{
    "is_running": true,
    "backtest_running": false,
    "live_running": true,
    "live_running_codes": ["000001.SZ", "600036.SH"],
    "live_task_count": 2,
    "live_strategy_profiles": {
        "000001.SZ": ["08"],
        "600036.SH": ["34R1", "34R1U"]
    },
    "active_cabinet_type": "LiveCabinet"
}
```

---

## WebSocket 数据流 (可选)

如果调用方需要实时接收策略信号和日志，可以连接 WebSocket。

- **地址:** `ws://localhost:8000/ws`
- **启动实盘命令:** `{"type":"start_simulation","stocks":["000001.SZ","600036.SH"],"stock_strategy_map":{"000001.SZ":["08"],"600036.SH":["34R1"]},"replace_existing":true}`
- **停止实盘命令:** `{"type":"stop_simulation","stocks":["000001.SZ"]}` 或 `{"type":"stop_simulation"}`
- **切策略命令:** `{"type":"switch_strategy","stock_strategy_map":{"000001.SZ":["08"],"600036.SH":["34R1U"]}}`
- **消息类型:**
    - `log`: 系统日志
    - `kline`: 最新 K 线数据
    - `decision`: 最终交易决策 (圣旨)
    - 绝大多数实盘事件会携带 `stock_code` 字段用于多标的区分

---

## 7. Webhook 推送配置（飞书/通用）

在 `config.json` 中通过 `webhook_notification` 配置通知：

- `enabled`: 是否启用
- `event_types`: 需要推送的事件类型白名单
- `webhook_urls`: 通用 webhook 列表（POST JSON）
- `feishu_webhook_url`: 飞书机器人 webhook
- `feishu_secret`: 飞书签名密钥（可选）
- `max_retries` / `retry_backoff_seconds`: 首次发送重试策略
- `persist_failed_events`: 发送失败是否落盘
- `failed_events_file`: 失败事件队列文件（JSONL）
- `failed_retry_interval_seconds`: 失败队列重试间隔
- `failed_retry_batch_size`: 每轮补偿重试最大条数
- `failed_max_retry`: 失败队列单条最大重试次数

---

## 8. Webhook失败队列管理（前台重推）

用于页面手工补偿推送失败记录。

### 8.1 查询失败队列

- **接口地址:** `/api/webhook/failed?limit=200`
- **请求方法:** `GET`

**响应示例:**
```json
{
  "status": "success",
  "count": 2,
  "events": [
    {
      "event_id": "8f329ae71c5b7e11",
      "channel_type": "feishu",
      "event_type": "trade_exec",
      "stock_code": "600036.SH",
      "created_at": "2026-04-01T15:22:11",
      "retries": 1,
      "last_error": "http_error:429"
    }
  ]
}
```

### 8.2 手工重推失败队列

- **接口地址:** `/api/webhook/failed/retry`
- **请求方法:** `POST`
- **Content-Type:** `application/json`

**请求参数 (JSON):**

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `event_ids` | string[] | 否 | 指定要重推的记录ID；不传时按队列顺序处理 |
| `limit` | int | 否 | 最多重推条数，默认20 |

### 8.3 清理失败队列

- **接口地址:** `/api/webhook/failed/delete`
- **请求方法:** `POST`
- **Content-Type:** `application/json`

**请求参数 (JSON):**

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `event_ids` | string[] | 否 | 仅清理指定ID；不传则清空失败队列 |

---

## 9. 通达信与BLK能力

### 9.1 查询通达信编译能力

- **接口地址:** `/api/tdx/capabilities`
- **请求方法:** `GET`

**响应示例:**
```json
{
  "status": "success",
  "capabilities": {
    "supported_functions": ["ABS", "BARSLAST", "COUNT", "CROSS", "EMA", "HHV", "IF", "LLV", "MA", "MAX", "MIN", "REF", "SMA", "STD", "SUM", "UP", "WMA"],
    "series_alias": {"C": "close", "O": "open_", "H": "high", "L": "low", "V": "vol", "VOL": "vol", "AMOUNT": "amount"},
    "operators": ["=", "<>", "AND", "OR", "NOT"],
    "statement_separators": [";", "\\n"]
  }
}
```

### 9.2 编译通达信公式

- **接口地址:** `/api/tdx/compile`
- **请求方法:** `POST`
- **Content-Type:** `application/json`

**请求参数 (JSON):**

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `formula_text` | string | 是 | 通达信公式文本 |
| `strategy_id` | string | 否 | 策略ID，缺省自动生成 |
| `strategy_name` | string | 否 | 策略名称，缺省自动生成 |
| `kline_type` | string | 否 | K线周期，默认 `1min` |

**响应重点字段:**

- `code`: 生成的Python策略代码
- `used_functions`: 识别到且支持的函数
- `compile_meta.unsupported_functions`: 不支持函数列表（为空表示通过）

### 9.3 校验通达信公式

- **接口地址:** `/api/tdx/validate_formula`
- **请求方法:** `POST`
- **Content-Type:** `application/json`

**请求参数 (JSON):**

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `formula_text` | string | 是 | 通达信公式文本 |
| `strategy_id` | string | 否 | 仅用于校验上下文标识 |
| `strategy_name` | string | 否 | 仅用于校验上下文标识 |
| `kline_type` | string | 否 | K线周期，默认 `1min` |
| `strict` | bool | 否 | 是否严格模式，默认 `true` |
| `include_code` | bool | 否 | 是否返回编译后的代码，默认 `false` |

**响应重点字段:**

- `valid`: 校验结果，成功时为 `true`
- `compile_meta`: 包含 `called/supported/unsupported` 函数集合
- `warnings`: 预留告警列表

### 9.4 导入通达信策略

- **接口地址:** `/api/tdx/import_strategy`
- **请求方法:** `POST`
- **Content-Type:** `application/json`

**说明:**

- 会先执行编译校验，再写入策略仓库
- 若存在不支持函数，接口返回 `status=error`

### 9.5 批量导入通达信策略

- **接口地址:** `/api/tdx/import_pack`
- **请求方法:** `POST`
- **Content-Type:** `application/json`

**请求参数 (JSON):**

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `items` | object[] | 是 | 待导入公式列表，元素字段同 `/api/tdx/import_strategy` |
| `stop_on_error` | bool | 否 | 遇到失败是否立即停止，默认 `false` |
| `skip_existing` | bool | 否 | 策略ID冲突是否跳过，默认 `true` |

**响应重点字段:**

- `status`: `success` / `partial_success` / `error`
- `imported_count` / `skipped_count` / `failed_count`
- `failures`: 失败明细（含 `index` 与 `msg`）

**错误返回结构（TDX接口统一）:**

- `status`: 固定为 `error`
- `msg`: 兼容历史的错误消息
- `error_code`: 稳定错误码（前端建议优先使用）
- `details`: 结构化细节对象（无细节时为空对象）

常见 `error_code`：

- `TDX_PROMPT_REQUIRED`
- `TDX_FORMULA_REQUIRED`
- `TDX_ITEMS_REQUIRED`
- `TDX_COMPILE_FAILED`
- `TDX_IMPORT_FAILED`
- `TDX_IMPORT_PACK_FAILED`
- `TDX_CAPABILITIES_FAILED`

### 9.6 解析BLK

- **接口地址:** `/api/blk/parse`
- **请求方法:** `POST`
- **Content-Type:** `application/json`

**请求参数 (JSON):**

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `file_path` | string | 否 | 服务端可访问的BLK文件路径 |
| `content` | string | 否 | 直接传BLK文本 |
| `encoding` | string | 否 | `auto/gbk/utf-8` |
| `normalize_symbol` | bool | 否 | 是否规范化为 `600000.SH` 格式 |

### 9.7 BLK导入标的池

- **接口地址:** `/api/blk/import_stock_pool`
- **请求方法:** `POST`
- **Content-Type:** `application/json`

**请求参数补充:**

- `import_mode`: `append` 或 `replace`
- `market_tag` / `industry_tag` / `size_tag` / `enabled`
- `stock_pool_csv`: 自定义标的池路径

### 9.8 通达信终端桥接（Mock/适配层骨架）

用于终端级对接前置实现，支持 `mock`、`pytdx`、`broker_gateway` 适配器。

- `GET /api/tdx/terminal/status`: 查询桥接状态
- `POST /api/tdx/terminal/connect`: 建立桥接连接（支持切换 `adapter`）
- `POST /api/tdx/terminal/disconnect`: 断开桥接
- `POST /api/tdx/terminal/subscribe`: 订阅行情代码列表
- `GET /api/tdx/terminal/quotes`: 查询当前订阅行情快照
- `POST /api/tdx/terminal/place_order`: 提交模拟下单
- `GET /api/tdx/terminal/orders`: 查询模拟订单列表
- `POST /api/tdx/terminal/broker/login`: 券商登录
- `GET /api/tdx/terminal/broker/balance`: 查询资金
- `GET /api/tdx/terminal/broker/positions`: 查询持仓
- `POST /api/tdx/terminal/broker/cancel_order`: 撤单

`connect` 请求体示例：

```json
{
  "adapter": "broker_gateway",
  "host": "127.0.0.1",
  "port": 9001,
  "account_id": "demo",
  "api_key": "your_key",
  "api_secret": "your_secret",
  "sign_method": "hmac_sha256",
  "base_url": "http://broker-gateway.local",
  "timeout_sec": 10,
  "retry_count": 1
}
```

`place_order` 请求体示例：

```json
{
  "symbol": "600000.SH",
  "direction": "BUY",
  "qty": 100,
  "price": 10.2
}
```

说明：

- `pytdx` 适配器用于通达信行情连接，依赖 `pytdx` 包与可用的行情服务器地址。
- `pytdx` 不支持交易下单；调用 `place_order` 会返回错误，需接入券商交易网关完成实单。
- `broker_gateway` 为券商交易网关骨架适配器，当前提供统一下单与订单查询契约，便于后续对接真实柜台/OMS。
- `broker_gateway` 默认是骨架实现（不直连真实券商），用于先打通接口与流程编排。
- 签名/鉴权钩子：`api_key`、`api_secret`、`sign_method`（目前支持 `none/hmac_sha256`），下单与登录请求会附带签名元信息。
- HTTP网关模板参数：`base_url`、`timeout_sec`、`retry_count`，用于对接真实券商网关时的请求控制。
- 推荐流程：`connect -> broker/login -> place_order -> broker/cancel_order`。
- 可通过环境变量 `TDX_TERMINAL_ADAPTER` 或配置 `tdx_terminal.adapter` 设置默认适配器（如 `pytdx` / `broker_gateway`）。

生产可接券商配置模板（建议）：

`config.json`（非敏感）：

```json
{
  "private_config_path": "data/private.config.json",
  "tdx_terminal": {
    "adapter": "broker_gateway",
    "host": "127.0.0.1",
    "port": 9001,
    "account_id": "acct-demo",
    "base_url": "https://broker-gateway.example.com",
    "timeout_sec": 10,
    "retry_count": 1,
    "sign_method": "hmac_sha256",
    "hook_enabled": true,
    "hook_level": "INFO",
    "hook_logger_name": "TdxBrokerGatewayHook",
    "hook_log_payload": true
  }
}
```

`private_config_path` 指向文件（敏感）：

```json
{
  "tdx_terminal": {
    "api_key": "replace-with-real-key",
    "api_secret": "replace-with-real-secret"
  }
}
```
