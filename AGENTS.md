# AGENTS.md

## Project Overview

Bilibili Live Streaming Recorder (blrec) - 前后端分离的 B 站直播录制工具

- **Backend**: Python (FastAPI + uvicorn) in `src/blrec/`
- **Frontend**: Angular 15 (ng-zorro-antd) in `webapp/`
- **Package**: Published to PyPI as `blrec`

## Quick Start

```bash
# 安装开发环境
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e .[dev]

# 运行应用
python -m blrec  # 默认访问 http://localhost:2233

# 或直接运行 ASGI
uvicorn blrec.web:app
```

## Development Commands

### Backend (Python)
```bash
# 安装依赖（含开发工具）
pip install -e .[dev]

# 代码格式化
black src/
isort src/

# 类型检查
mypy src/

# Lint 检查
flake8 src/
```

### Frontend (Angular)
```bash
cd webapp
npm install
npm start        # 开发服务器 http://localhost:4200
npm run build    # 生产构建
npm test         # 单元测试
```

## Code Style & Tools

### Python
- **Formatter**: Black (line-length=88, skip-string-normalization, skip-magic-trailing-comma)
- **Import sorting**: isort (profile=black)
- **Linting**: flake8 (ignore: D203, W504, W503, E203)
- **Type checking**: mypy (strict mode, pydantic plugin)

### Angular
- ESLint configured in `.eslintrc.json`
- TypeScript ~4.9.5
- Angular 15 with ng-zorro-antd 15

## Architecture Notes

### 文档维护约定

这份文档是**活文档**，覆盖率不要求一次到位。任何 agent 在任务过程中发现"这里有个功能/模块，文档没写"时，**有义务顺手补上**，不要只在回复里提一句就过。判断依据与落点如下：

| 你发现了什么 | 写到哪里 | 写法要求 |
|---|---|---|
| 一个新的包、模块、或某个文件在模块里承担的角色 | `### Key Modules` 对应职责分组 | 一句话说清**职责**，关键文件点出**类名/函数名**；不确定就只写职责，别猜 |
| 一条新的 HTTP 路由或中间件 | `### 后端 Web 层` 的路由表 / 中间件列表 | 补 `前缀` 或 `文件名 - 作用`；路由表按模块名排序对齐 |
| 一个新的前端页面、服务、组件、管道 | `### 前端结构` | 归到对应小节（顶层模块 / `settings/` 子组件 / `core/services/` / `shared/`），并写清**路由 path 与组件名的差异**（如有） |
| 一条前后端之间的数据链路或字段约定 | `### 设置读写链路` 或新开同类小节 | 写清**方向**（谁调谁）、**关键函数名**、以及双方的**字段名映射** |
| 一个会导致人踩坑的行为、时序、pydantic/框架陷阱 | `## Common Gotchas` 对应分组 | 症状 + 原因 + 正确做法三者齐全；只写"注意 X"没有价值 |
| 一个反复要读的入口文件 | `## Important Files` | 一行说明它的职责，别只写文件名 |

补充时的硬性要求：

- **必须核实**再写。用 `ls` / `grep` / `Read` 确认文件、类名、函数名、路由 prefix 与文档描述一致，不要凭记忆或推测下笔。
- **发现文档与代码不符时一并修正**（不只是"缺"，"错"同样要改）。例如路由表里的 prefix 变了、模块被重命名、小节里引用的文件已不存在 —— 改完顺手核对同一主题的其他小节是否也过时。
- **不要写本机绝对路径**（如 `C:\Users\...`）。这份文档是共享的，路径要写成仓库相对路径或通用描述。
- **不写决策溯源**（谁在什么时候定的、原来是什么样）。只写**现在是什么**和**为什么**；改动历史交给 git。
- **不重复**已有表述。补之前先搜一遍关键词，已有覆盖就只做修正、不加一段同义话。
- 拿不准某段该放哪，**就近放在最相关的小节末尾**，宁可位置不完美，也别放弃补充。
- 单次补充**不要重排或整段重写**无关内容，控制 diff 范围，方便 review。

### Entry Points
- CLI: `src/blrec/cli/main.py` → `blrec` command
- ASGI: `src/blrec/web/__init__.py` → `blrec.web:app`
- Settings: `~/.blrec/settings.toml` (TOML format)

### Key Modules

后端顶层包（`src/blrec/`，按职责分类）：

**录制与媒体**
- `core/` - 核心录制逻辑。`recorder.py` 是录制主控，驱动 `stream_recorder.py`（FLV/HLS 两种实现由 `flv_stream_recorder_impl.py` / `hls_stream_recorder_impl.py` 提供）、`danmaku_receiver.py` / `raw_danmaku_receiver.py`（弹幕与原始弹幕的接收侧，cmd → 领域消息）、`danmaku_dumper.py`（弹幕→XML）、`raw_danmaku_dumper.py`（原始弹幕→JSONL）、`cover_downloader.py`（封面下载）、`metadata_provider.py`、`path_provider.py`、`stream_param_holder.py`、`statistics.py`
- `flv/` - FLV 流解析与元数据注入。含 AMF/AVC 编解码、`metadata_analysis.py` / `metadata_injection.py`（在 FLV 中读写 keyframe 元数据）、`bits_io.py` / `struct_io.py` 等底层 IO
- `hls/` - HLS 流处理（TS 分片）
- `danmaku/` - 弹幕文件层。`io.py` 负责 XML 读写（`<d>` / `<gift>` / `<guard>` / `<sc>` / `<toast>`）、`combination.py` 与 `concatenation.py` 处理多分片弹幕的合并
- `postprocess/` - 后处理。`postprocessor.py` 编排、`remux.py`（FLV→MP4）、`ffmpeg_metadata.py`

**B 站接口**
- `bili/` - B 站 API 与弹幕协议。`api.py`（`WebApi` / `AppApi`）、`danmaku_client.py`（WS 客户端，16 字节包头解包 + `DanmakuCommand` 枚举）、`live.py` / `live_monitor.py`（直播间信息与开播监听）、`wbi.py`（wbi 签名）、`gift_v2.py`（protobuf 礼物消息）、`net.py`（HTTP 会话）、`helpers.py`（含 `get_nav` 等）。`test/` 是该模块内嵌的测试目录

**应用与配置**
- `task/` - 任务管理。`task_manager.py`（`RecordTaskManager`）、`task.py`（`RecordTask`，每个 room_id 一个）
- `setting/` - 配置模型与读写。`models.py`（pydantic 模型）、`setting_manager.py`（`change_settings` + `apply_*_settings` + TOML 落盘）
- `application.py` - 应用总控（`Application`），持有 settings_manager / task_manager / space_monitor / space_reclaimer / notifiers / webhooks
- `cli/` - CLI 入口，用 **typer**（非 click）。所有参数最终转成 `BLREC_*` 环境变量供应用读取

**磁盘与清理**
- `disk_space/` - `space_monitor.py`（剩余空间监控）、`space_reclaimer.py`（按保留策略删旧录像）、`stats.py`（`aggregate_recording_stats`，文件统计页的数据源，口径见下）

**事件与通知**
- `event/` - 事件中心。基于 reactivex `Subject`，`event_center.py`（`EventCenter` 单例）、`event_submitters.py`（各业务事件 → `Event`）、`event_emitter.py`、`models.py`、`typing.py`
- `webhook/` - 订阅 EventCenter 并向配置的 URL 推送
- `notification/` - 通知渠道。`notifiers.py`（Email/Serverchan/Pushdeer/Pushplus/Telegram/Bark/Gotify 业务封装）、`providers.py`（SMTP、HTTP 等通道实现）
- `exception/` - 异常中心。`exception_center.py`（`ExceptionCenter` 单例）、`exception_handler.py`、`exception_submiter.py`

**基础设施**
- `logging/` - loguru 配置。`configure_logging.py`、`context.py`（`async_task_with_logger_context`，给异步任务绑定 room_id 日志上下文）
- `path/` - 路径拼装（`cover_path` / `danmaku_path` / `playlist_path` 等）
- `update/` - 查询 PyPI 最新版本
- `utils/` - 通用工具。`ffprobe.py`、`libc.py`（`malloc_trim`，任务销毁后归还内存）、`io.py`、`hash.py`、`string.py`、`url.py`、`patterns.py`、`mixins.py`、`operators/`（子包）

### 组件关系

```
RecordTaskManager
  └── RecordTask (per room_id)
        ├── Live                    # 直播间信息、API 调用
        │     ├── webapi (WebApi)   # ─┐ 共享引用
        │     └── appapi (AppApi)   # ─┤
        ├── DanmakuClient           # 弹幕 WebSocket 客户端
        │     ├── webapi (WebApi)   # ─┤ 同一对象
        │     └── appapi (AppApi)   # ─┘
        ├── LiveMonitor             # 通过 DanmakuClient 监听直播状态
        ├── Recorder                # 录制核心，驱动 StreamRecorder/DanmakuDumper 等
        └── Postprocessor           # 后处理（转码/注入元数据）
```

### 后端 Web 层（`src/blrec/web/`）

- `main.py` - 创建 FastAPI 实例 `blrec.web:app`，注册中间件、路由器，并把 `Application` 注入各 router 的模块级 `app` 变量（`tasks.app = app` 这种写法）
- `dependencies.py` - FastAPI 依赖（从 `app` 里取 `Application` / 各 manager）
- `schemas.py` - 请求/响应体的 pydantic 模型
- `responses.py` - 响应封装辅助
- `security.py` - API Key 鉴权。仅当设置了 `BLREC_API_KEY`（或 `--api-key`）时才挂载 `Depends(security.authenticate)`
- `middlewares/base_herf.py` - 注入 `<base href>`
- `middlewares/route_redirect.py` - **SPA 顶级路由白名单**，见 Common Gotchas
- 静态资源通过 `WebAppFiles` 挂载在 `/`，指向打包进 `src/blrec/data/webapp/` 的前端产物

路由清单（`web/routers/`）：

| 模块 | 前缀 |
|---|---|
| `tasks.py` | `/api/v1/tasks` |
| `settings.py` | `/api/v1/settings` |
| `application.py` | `/api/v1/app` |
| `validation.py` | `/api/v1/validation` |
| `login.py` | `/api/v1/login` |
| `update.py` | `/api/v1/update` |
| `recordings.py` | `/api/v1/recordings` |
| `websockets.py` | 无前缀，`/ws/v1/events`、`/ws/v1/exceptions` |

### 前端结构（`webapp/src/app/`）

顶层模块：
- `tasks/` - 任务列表与详情（含 `add-task-dialog`、`task-detail`、`task-settings-dialog`、`toolbar`）
- `settings/` - 设置页，每个分组一个子组件（见下）
- `stats/` - 文件统计页
- `about/` - 关于页
- `shared/` - 通用组件、指令、管道、工具
- `core/` - HTTP 服务、拦截器、模型

`settings/` 子组件（`settings-routing.module.ts` 里是**平铺路由**，没有嵌套）：
- 组件目录：`output-settings`、`recorder-settings`、`danmaku-settings`、`post-processing-settings`、`disk-space-settings`、`bili-api-settings`、`header-settings`、`logging-settings`、`notification-settings`（内含 email / serverchan / pushdeer / pushplus / telegram / bark / gotify 共 7 个渠道子页）、`webhook-settings`（内含 `webhook-manager`）
- 路由 path 与组件名不同名，需要对照：`''` → `SettingsComponent`（主页），`email-notification` / `serverchan-notification` / `pushdeer-notification` / `pushplus-notification` / `telegram-notification` / `bark-notification` / `gotify-notification`，以及 **`webhooks`（复数）** → `WebhookManagerComponent`
- 每个子路由都配了对应的 Resolver（`settings/shared/services/*.resolver.ts`），靠 `resolve: { settings: ... }` 在进入组件前预取设置

`core/services/` 主要服务：
- `setting.service.ts` - 设置读写（`getSettings` / `changeSettings` / `changeTaskOptions`）
- `url.service.ts` - 拼 API 与 WebSocket URL（`makeApiUrl` / `makeWebSocketUrl`）
- `auth.service.ts` - API Key 存 `localStorage`（键 `app-api-key`），由 `storage.service.ts` 封装
- `event.service.ts` / `exception.service.ts` - 订阅 `/ws/v1/events` 与 `/ws/v1/exceptions`
- `validation.service.ts` - 目录与 cookie 校验
- `login.service.ts` - 扫码登录
- `app.service.ts` - 应用信息/状态/重启/退出
- `update.service.ts` - 查询新版本
- `router-scroll.service.ts` - 路由切换时的滚动位置恢复（接口在 `router-scroll.service.intf.ts`）

`shared/components/`：`input-filesize`、`input-duration`、`page-section`、`sub-page`
`shared/pipes/`：`datarate`、`dataurl`、`duration`、`filename`、`filesize`、`filestatus`、`progress`、`quality`

### 设置读写链路（前端 → 后端）

1. 前端 `SettingsResolver` 路由守卫调 `GET /api/v1/settings?include=...`
2. 表单变更经 `SettingsSyncService.syncSettings()` 做深度 diff，只 PATCH 变化的字段
3. 后端 `SettingsManager.change_settings()`：逐字段比较 → `apply_{name}_settings()` → `dump_settings()` 写 TOML

几个约定：
- 前端模型 `webapp/src/app/settings/shared/setting.model.ts` 与后端 `setting/models.py` 字段名一一对应（后端 snake_case，前端 camelCase，由 pydantic 的 `camel_case` alias generator 转换）
- `SettingsIn` 是**输入侧**模型，`SettingsOut` 是**输出侧**模型，二者形状按此分工：客户端不该能写的字段，不进 `SettingsIn`；服务端写、客户端只读的元数据（如 `cookie_updated_at` / `login_info`），靠 `SettingsOut` 下发。具体做法与坑见 Common Gotchas 第 11 条
- 任务级设置（`TaskOptions`）会 shadow 全局设置，显式传 `null` 表示取消 shadow

### 文件统计页数据口径（`disk_space/stats.py`）

- 以输出目录的**一级子目录为房间**，只统计 `.flv/.mp4/.ts/.m4s`；根目录散落录像归入空名房间
- 录像时间**优先取文件名时间戳**（`YYYY-MM-DD-HHMMSS` 或 14 位紧凑格式），解析不出才退回 `mtime`

## Common Gotchas

### 环境与部署

1. **Python version**: Requires 3.10+ (pyproject.toml: `requires-python = ">= 3.10"`)
2. **ffmpeg/ffprobe**: 必须系统安装，用于 FLV→MP4 转换
3. **Settings file**: 首次运行自动创建，可通过 `-c` 指定路径
4. **Docker volumes**: `/cfg` (settings), `/log` (logs), `/rec` (recordings)
5. **Port**: 默认 2233，可通过 `--port` 修改

### 后端

6. **循环导入**：`blrec.core.__init__` → `recorder` → `setting` → …… 直接 `import blrec.core`（不经 `blrec.setting`）会触发 `ImportError: cannot import name 'Recorder' from partially initialized module`。**必须先 `import blrec.setting`**，再 `import blrec.core.*`
7. **新增 SPA 顶级路由**：必须同步更新 `web/middlewares/route_redirect.py` 里的 `_pattern`（当前为 `^/(tasks|settings|about|stats)($|/.*$)`），否则直接刷新该 URL 会被重定向到 `/`（表现为 404）
8. **环境变量开关**：`BLREC_CONFIG` / `BLREC_OUT_DIR` / `BLREC_LOG_DIR` / `BLREC_API_KEY` / `BLREC_IPV4` / `BLREC_DANMAKU_ONLY` / `BLREC_PROGRESS` 等，CLI 参数只是这些环境变量的前置写法
9. **pydantic validator 不能重复注册**：在同一进程内删掉 `blrec.setting` 的 `sys.modules` 条目后重新导入，会报 `ConfigError: duplicate validator function ... set allow_reuse=True`。写验证脚本时每个导入场景要用独立进程
10. **设置变更的时序**：`SettingsManager.change_settings()` 里若要在写入后拿到"旧值"，必须在 `update_settings()` **之前**读取 `dst_*`。写入之后 `dst` 已被覆盖，`dst.cookie != src.cookie` 之类的新旧比较恒为 False
11. **服务端写入的元数据要挡住客户端伪造**：`SettingsIn` 是客户端可控的输入模型。像"cookie 上次更新时刻""最近一次登录结果"这类只应由服务端写的字段，不能出现在 `SettingsIn` 所接受的子模型里 —— 做法是让 `SettingsIn.header` 用更窄的 `HeaderOptions`（只含 `user_agent` / `cookie`），同时在 `SettingsOut` 显式声明 `header: HeaderSettings`。若只在 `SettingsIn` 收窄而不覆盖 `SettingsOut`，pydantic 会把子类**静默降级**成父类，字段被丢掉

### 前端

12. **`tsc` 不检查 Angular 模板**：模板绑定错误（如 TS2322）只在 build 时暴露。静态覆盖模板用 `./node_modules/.bin/ngc -p tsconfig.app.json`（cwd = `webapp/`），产物落 `webapp/out-tsc`（已被 `webapp/.gitignore` 忽略）
13. **`FormGroup.setValue` vs `patchValue`**：`setValue` 要求 key 完全匹配，表单对象上多出（或少）任何字段都会抛错。服务端可能返回比表单更多的字段，此时必须用 `patchValue` 并显式列出表单字段
14. **`Nullable<T>` 是字段级映射**（`{ [K in keyof T]: T[K] | null }`），不是整体 nullable。给标量加 null 用 `number | null`，别写 `Nullable<number>`。此外 `Nullable<Pick<T, ...>>` 也可用来从宽模型里裁出窄形状（对应后端"收窄输入模型"的写法）
15. **Annotated FormControl 布局**：`nz-form-item` 里 `nz-form-label` + `nz-form-control` 的组合受 `settings/shared/styles/_setting.scss` 控制；`.setting-value` 靠 `margin-left: auto` 右对齐

### 验证手段

16. **隔离验证**：跑真实代码做验证时，建议用独立 venv + `PYTHONPATH` 指向本仓库 `src/`，避免污染开发环境。注意某些工具链下 **stdout/stderr 不被捕获**，脚本结果宜写文件再读回
17. **mock 位置**：`unittest.mock.patch` 要打在**函数被定义的地方**，不是被使用的地方。例如 `setting_manager._check_cookie_login_info` 内写的是 `from ..bili.helpers import get_nav`，则应 patch `blrec.bili.helpers.get_nav`
18. **不要在一个事件循环里反复 `asyncio.run()`**：循环内多次创建/销毁事件循环会在几百次后硬崩。应写成一个 `async def main()`，在单次 `asyncio.run(main())` 里跑完所有用例

## Build & Release

```bash
# 构建分发包
python -m build --sdist --wheel

# 发布到 PyPI（需要 token）
twine upload dist/*
```

CI/CD: GitHub Actions 自动发布到 PyPI（推送 `v*.*.*` 标签触发）

## Important Files

- `pyproject.toml` - 项目元数据和依赖
- `settings.toml` - 示例配置文件
- `src/blrec/setting/models.py` - 全部配置模型（`Settings` / `SettingsIn` / `SettingsOut` 及各分组）
- `src/blrec/setting/setting_manager.py` - 设置读写与热应用（`change_settings` / `apply_*_settings`）
- `src/blrec/web/main.py` - FastAPI 装配（中间件、路由、静态资源）
- `src/blrec/web/middlewares/route_redirect.py` - SPA 顶级路由白名单
- `webapp/src/app/settings/shared/setting.model.ts` - 前端设置模型
- `webapp/src/app/settings/shared/services/settings-sync.service.ts` - 前端设置同步（diff + PATCH）
- `Dockerfile` - Docker 构建配置
- `.github/workflows/` - CI/CD 流水线
