# 新功能说明：通达信公式转换 + BLK 解析 + 多策略组合回测

## 1. 功能总览

本次新增能力覆盖三条主线：

1. 通达信公式转换为 Python 策略代码（可直接入库并参与回测）。
2. BLK 板块文件解析（支持导入标的池）。
3. 多策略组合回测（AND / OR / Vote 加权投票）。

对应落地分期：

- P0：公式转换 + BLK 解析 + 一键导入策略 API。
- P1：组合信号过滤接入回测链路。
- P2：批量脚本支持 BLK 导入标的池、公式包导入策略池并串联任务生成。

## 2. 完成状态

当前状态：已完成开发并通过单测验证。

已验证测试集合：

- `tests/unit/test_tdx_formula_compiler.py`
- `tests/unit/test_blk_loader.py`
- `tests/unit/test_backtest_signal_combination.py`
- `tests/unit/test_batch_backtest_runner_imports.py`

最近回归结果：`8 passed`。

## 3. 服务端 API 新增

### 3.1 编译通达信公式

- 接口：`POST /api/tdx/compile`
- 用途：仅编译，不入库。

请求示例：

```json
{
  "formula_text": "MA5:=MA(C,5); MA10:=MA(C,10); CROSS(MA5,MA10)",
  "strategy_id": "TDX001",
  "strategy_name": "MA双均线",
  "kline_type": "1min"
}
```

返回重点字段：

- `code`：可执行策略代码。
- `class_name`：策略类名。
- `used_functions`：识别到的通达信函数。
- `warmup_bars`：建议热身K线数量。

### 3.2 一键导入策略

- 接口：`POST /api/tdx/import_strategy`
- 用途：编译并写入策略管理仓库（复用现有策略新增流程）。

请求示例：

```json
{
  "formula_text": "MA5:=MA(C,5); MA10:=MA(C,10); CROSS(MA5,MA10)",
  "strategy_name": "MA双均线导入版",
  "kline_type": "1min"
}
```

### 3.3 解析 BLK

- 接口：`POST /api/blk/parse`
- 用途：解析 BLK 文本/文件为股票代码列表。

请求示例：

```json
{
  "file_path": "D:/data/demo.blk",
  "encoding": "auto",
  "normalize_symbol": true
}
```

说明：

- 支持 `代码 名称` 与 `代码|名称`。
- 编码支持 `auto/gbk/utf-8`。
- 可输出规范化代码（如 `600000.SH`、`000001.SZ`）。

## 4. 回测组合能力（P1）

回测请求已支持 `combination_config`：

```json
{
  "stock_code": "600036.SH",
  "strategy_ids": ["01", "02", "03"],
  "combination_config": {
    "enabled": true,
    "mode": "vote",
    "weights": {"01": 2, "02": 1, "03": 1.5},
    "min_agree_count": 2,
    "tie_policy": "skip"
  },
  "start": "2024-01-01",
  "end": "2024-12-31"
}
```

参数说明：

- `mode=or`：任一策略信号通过（默认行为）。
- `mode=and`：要求可运行策略全部出信号且方向一致。
- `mode=vote`：按 `weights` 做方向投票。
- `min_agree_count`：最小同向策略数门槛。
- `tie_policy`：平票处理，支持 `skip/buy/sell`。

## 5. 批量脚本能力（P2）

脚本：`scripts/batch_backtest_runner.py`

新增参数：

- BLK 导入：
  - `--blk-file`
  - `--blk-encoding`
  - `--blk-import-mode append|replace`
  - `--blk-market-tag`
  - `--blk-industry-tag`
  - `--blk-size-tag`
  - `--blk-enabled`
- 公式包导入：
  - `--formula-pack-json`
  - `--formula-pack-import-mode append|replace`
  - `--formula-pack-enabled`
- 流程控制：
  - `--run-after-import`

公式包 JSON 格式支持：

- 字符串数组：`["S1", "S2"]`
- 对象数组：`[{"strategy_id":"S1"},{"strategy_id":"S2"}]`
- 或 `{"strategies":[...]}`

## 6. 端到端示例

### 6.1 仅导入 BLK 到标的池

```bash
python scripts/batch_backtest_runner.py --blk-file "D:/data/demo.blk"
```

### 6.2 仅导入公式包到策略池

```bash
python scripts/batch_backtest_runner.py --formula-pack-json "D:/data/formula_pack.json"
```

### 6.3 导入 + 生成任务 + 覆盖率 + 回测

```bash
python scripts/batch_backtest_runner.py ^
  --blk-file "D:/data/demo.blk" ^
  --formula-pack-json "D:/data/formula_pack.json" ^
  --run-after-import ^
  --generate-tasks --generate-mode replace --run-after-generate ^
  --coverage-check --coverage-hard-gate --run-after-coverage-check
```

## 7. 注意事项

1. `--blk-import-mode replace` 会重建标的池，请先备份原 CSV。
2. `--formula-pack-import-mode replace` 会重建策略池，请先确认策略清单。
3. 导入后若未指定 `--run-after-import`，脚本会在导入完成后直接退出。
4. 组合回测参数仅在多策略场景有意义，单策略时等价于原行为。
5. 通达信转换当前为最小可用版本，复杂语法建议先通过 `/api/tdx/compile` 检查生成代码。

## 8. 代码定位（便于二次开发）

- 公式编译：`src/tdx/formula_compiler.py`
- BLK 解析：`src/utils/blk_loader.py`
- 组合回测：`src/core/backtest_cabinet.py`
- 回测参数透传：`server.py`
- 批量导入与任务编排：`scripts/batch_backtest_runner.py`

## 9. 前台界面操作手册（含示例）

本节面向前台用户，按“最短路径”说明如何完成从导入到回测。

### 9.1 入口位置

1. 底部主操作区点击 `操作工作台`，打开右侧抽屉。
2. 抽屉内包含三块：
   - 回测组合参数
   - 策略与板块工具
   - 系统与辅助操作
3. 右上角图钉可固定抽屉为常驻工具栏，叉号可关闭抽屉。

### 9.2 通达信公式 → 策略导入（前台）

步骤：

1. 在抽屉 `策略与板块工具` 中点击 `打开公式工具`。
2. 输入公式文本（如 MA5/MA10/CROSS）。
3. 可先点 `编译预览` 检查生成代码和函数映射。
4. 点 `一键导入策略`，成功后策略会出现在策略列表。

示例公式：

```text
MA5:=MA(C,5);
MA10:=MA(C,10);
CROSS(MA5,MA10)
```

成功标志：

- 状态提示出现“导入成功: TDXxxx”。
- 回测策略列表可勾选该策略。

### 9.3 BLK 导入 → 标的池 → 一键生成任务（前台）

步骤：

1. 在抽屉 `策略与板块工具` 中点击 `打开BLK导入`。
2. 三选一提供数据源：
   - 填 `BLK 文件路径`（服务端可访问路径）
   - 本地上传 `.blk/.txt`
   - 直接粘贴 BLK 文本
3. 先点 `解析预览`，确认代码数量与样例。
4. 点 `写入标的池`。
5. 按弹窗提示确认是否 `立即生成任务`：
   - 确认：自动触发批量任务生成
   - 取消：稍后手动点 `一键生成任务`

BLK 内容示例：

```text
600000 测试
000001|平安银行
300750 宁德时代
```

建议参数：

- 导入模式：默认 `append`
- 编码：默认 `auto`
- 规范代码：勾选（推荐）

### 9.4 组合回测参数（前台）

位置：`操作工作台` -> `回测组合参数`

参数说明：

- 组合模式：
  - `任一满足（OR）`
  - `全部满足（AND）`
  - `投票模式（VOTE）`
- 最小同向数：信号通过的最小策略数
- 平票策略：`跳过信号 / 按买入处理 / 按卖出处理`
- 权重：格式 `策略ID=权重`，示例 `01=2,02=1`

注意：

- 前台显示为中文，后端提交值仍按 `or/and/vote`、`skip/buy/sell`，兼容 API。

### 9.5 前台一条龙示例（推荐）

目标：从板块 + 策略快速得到回测结果。

1. 打开 `操作工作台`。
2. 在 `策略与板块工具` 打开公式工具并导入策略。
3. 打开 BLK 工具，解析并写入标的池。
4. 在确认弹窗中选择“立即生成任务”。
5. 回到主界面，设置股票/区间/资金。
6. 在 `回测组合参数` 选择组合模式（如 VOTE）并设置权重。
7. 点击 `立即回测`。

### 9.6 常见问题与处理

1. 勾选免责协议后按钮仍灰色：
   - 先普通刷新页面再试
   - 如强刷（Ctrl+F5）后需要重新勾选属于预期行为
2. 抽屉关不掉：
   - 点右上角叉号
   - 点击抽屉外暗区
   - 按 `Esc`
3. BLK 导入后没有任务：
   - 检查是否点击了“立即生成任务”或“一键生成任务”
   - 检查任务模式是否 `replace` 导致旧任务被覆盖
4. VOTE 模式未触发：
   - 检查是否设置了过高的“最小同向数”
   - 检查权重格式是否正确（`ID=数值`）
