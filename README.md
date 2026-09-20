# 纸张直线裁切试排工具（Sheet Layout）

面向小型印刷店的纸张试排网页：输入纸张尺寸、刀缝宽度和多种成品（宽 × 高 × 数量），
自动生成纸内可执行的**断头台式（guillotine）直线裁切布局**。支持两种模式：

- **单张排样**：在一张纸内试排，排不下的件数单独列出；
- **批量排产**：设置最多用纸张数，服务端按同一断头台规则逐张排样，并从剩余需求中
  扣减每张已排数量，直到全部完成、达到用纸上限、或某张纸排不进任何成品（无进展立即
  停止，不会生成空白纸或死循环）。

## 裁切规则

- 每一刀都沿直线**切透当前矩形区域，将其一分为二**；
- 成品允许旋转 90°（图中以 `⟳90°` 标注，放置尺寸与规格互换）；
- **刀缝按实际宽度占位，切割不侵占任何成品**（刀缝带与成品只共边、不重叠）；
- 排不下的件数按成品规格单独列出；
- 输出 SVG：成品块（名称、规格、旋转状态、件号）、带序号的裁切中心线（序号即下刀顺序）、
  余料区，以及已排面积占比、刀缝面积、余料面积、总刀数等统计。

排样采用“大件优先 + 最佳适配（BSSF 变体）+ 较短余料优先切分”的贪心断头台启发式算法，
属快速试排工具，不保证全局最优。

## 单条命令启动（需要 Docker + Docker Compose）

```bash
docker compose up -d --build
```

启动后浏览器访问： **http://localhost:3000**

停止：

```bash
docker compose down
```

镜像构建时会通过 `npm ci` 自动备齐全部依赖（仅 Express），**无需任何外部服务或数据库**。

### 必要配置

| 配置 | 方式 | 默认值 | 说明 |
| --- | --- | --- | --- |
| 宿主机访问端口 | 环境变量 `PORT` | `3000` | 如 `PORT=8080 docker compose up -d --build`，则访问 http://localhost:8080 |

容器内固定监听 3000 端口，不挂载卷、不依赖外部存储。

## 本地直接运行（不用 Docker）

要求 Node.js ≥ 18。

```bash
npm install
npm start          # 默认 http://localhost:3000，可用 PORT=8080 npm start 改端口
```

## 使用说明

1. 在顶部选择**单张排样**或**批量排产**模式；
2. 填写纸张宽、高（mm）和刀缝宽度（mm，可为 0），也可从“常用纸度”下拉选择 A3/A2/A1、正度/大度全张；
3. 在成品清单中逐行填写名称（可留空）、宽、高、数量，可随时增删行；
4. 批量排产时再填写「最多用纸张数」（1–1000 的整数）；
5. 点击「生成裁切方案 / 开始批量排产」：
   - 左侧/下方 SVG 显示纸面布局；红色虚线带圆形序号即裁切中心线，按序号顺序逐刀切割；
   - 「下刀顺序」表列出每一刀的方向（竖切/横切）、被切区域和切线长度；
   - 单张模式：「排不下的成品」表列出每种规格的已排/需求数量和剩余件数；
   - 批量模式：顶部显示用纸数、累计完成件数、总刀数、完成率与**终止原因**，
     可用「上一张/下一张」或下拉切换查看每张纸的独立布局；底部另列批量结束后的剩余需求。

批量排产的终止原因有三种：

| stopReason | 含义 |
| --- | --- |
| `completed` | 全部需求已完成 |
| `max_sheets` | 已达到设定的最多用纸张数，仍有剩余 |
| `no_progress` | 下一张纸排不进任何成品（立即停止，不产生空白纸） |

## HTTP 接口

- `GET /api/health` — 健康检查，返回 `{"ok":true}`
- `POST /api/layout` — 单张排样（行为保持不变）
- `POST /api/batch-layout` — 批量排产

### 单张排样

请求示例：

```json
{
  "paperW": 889,
  "paperH": 1194,
  "kerf": 3,
  "products": [
    { "name": "封面", "width": 210, "height": 285, "quantity": 12 },
    { "name": "名片", "width": 90, "height": 54, "quantity": 80 }
  ]
}
```

返回包含 `paper`、`stats`（含 `areaRatio` 已排面积占比 0–1）、`items`（成品摆放坐标与旋转状态）、
`cuts`（刀序、方向、被切区域、刀缝带、切线长）、`frees`（余料矩形）、`unplaced`（排不下的件数）。

### 批量排产

请求在单张参数基础上增加 `maxSheets`：

```json
{
  "paperW": 889,
  "paperH": 1194,
  "kerf": 3,
  "maxSheets": 10,
  "products": [
    { "name": "封面", "width": 210, "height": 285, "quantity": 12 },
    { "name": "名片", "width": 90, "height": 54, "quantity": 500 }
  ]
}
```

返回：

```json
{
  "mode": "batch",
  "paper": { "width": 889, "height": 1194, "kerf": 3 },
  "maxSheets": 10,
  "sheets": [ { "sheet": 1, "...": "与 /api/layout 完全同构的独立布局" } ],
  "remaining": [
    { "id": "P2", "name": "名片", "width": 90, "height": 54,
      "total": 500, "placed": 430, "quantity": 70 }
  ],
  "stats": {
    "totalDemand": 512,
    "totalPlaced": 442,
    "sheetsUsed": 10,
    "maxSheets": 10,
    "completionRate": 0.863,
    "totalCuts": 128,
    "stopReason": "max_sheets"
  },
  "stopReason": "max_sheets"
}
```

- `sheets[]`：每张纸一个独立布局，结构与 `/api/layout` 返回完全一致（额外带从 1 开始的 `sheet` 序号）；
- `remaining[]`：排产结束后仍未完成的需求（总量 `total`、累计已排 `placed`、剩余 `quantity`）；
- `stats`：用纸数 `sheetsUsed`/`maxSheets`、总需求与已排件数、完成率 `completionRate`（0–1）、
  各张刀数之和 `totalCuts`、终止原因 `stopReason`。

非法输入（含 `maxSheets` 非 ≥1 的整数或超过 1000）返回 HTTP 400 与错误信息。

## 项目结构

```
.
├── server.js            # Express 入口：静态页面 + /api/layout + /api/batch-layout
├── src/packer.js        # 断头台二分排样核心算法（layout 单张 / batchLayout 批量）
├── public/
│   ├── index.html       # 单页界面（单张 / 批量模式切换）
│   ├── style.css
│   └── app.js           # 表单交互 + SVG 渲染 + 逐张布局切换（原生 JS）
├── test/smoke.test.js   # 算法不变量测试（node:test，无额外依赖）
├── Dockerfile
└── docker-compose.yml
```

## 测试

```bash
npm test
```

覆盖：成品不重叠且在纸面内、刀缝不侵占成品、旋转放置、二分区域几何一致、
面积守恒（成品 + 刀缝 + 余料 = 纸面）、未排件确实放不进任何余料区、非法输入校验，
以及批量排产的逐张扣减、完成率与三种终止原因（完成 / 达到上限 / 无进展不产生空白纸）等。
