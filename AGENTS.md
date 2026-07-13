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

### Entry Points
- CLI: `src/blrec/cli/main.py` → `blrec` command
- ASGI: `src/blrec/web/__init__.py` → `blrec.web:app`
- Settings: `~/.blrec/settings.toml` (TOML format)

### Key Modules
- `src/blrec/core/` - 核心录制逻辑
- `src/blrec/flv/` - FLV 流处理
- `src/blrec/hls/` - HLS 流处理
- `src/blrec/danmaku/` - 弹幕处理
- `src/blrec/web/` - FastAPI 路由和中间件
- `src/blrec/task/` - 任务管理
- `src/blrec/setting/` - 配置管理

### Frontend Structure
- `webapp/src/app/` - Angular 组件和服务
- 构建产物复制到 `src/blrec/data/webapp/` 供后端打包

## Common Gotchas

1. **Python version**: Requires 3.10+ (pyproject.toml: `requires-python = ">= 3.10"`)
2. **ffmpeg/ffprobe**: 必须系统安装，用于 FLV→MP4 转换
3. **Settings file**: 首次运行自动创建，可通过 `-c` 指定路径
4. **Docker volumes**: `/cfg` (settings), `/log` (logs), `/rec` (recordings)
5. **Port**: 默认 2233，可通过 `--port` 修改

## Testing

- 无自动化测试套件
- 前端有 Karma 单元测试框架（`npm test`）

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
- `src/blrec/setting/` - 配置模型定义
- `Dockerfile` - Docker 构建配置
- `.github/workflows/` - CI/CD 流水线
