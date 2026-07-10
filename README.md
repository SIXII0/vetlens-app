# VetLens（宠医透镜）

> 🐱 把一次就诊变成可解释、可追踪、可证明、可协同决策的结构化记录。

VetLens 是站在宠物主一方的医疗账单解读工具。上传一张宠物医院账单，逐项看懂——每一笔费用是什么、价格合不合理、保险能不能赔。

---

## 功能

### 核心流程

| 功能 | 说明 |
|------|------|
| 📸 **OCR 账单扫描** | 上传账单照片，自动识别费用项目（PaddleOCR + 豆包 AI 提取） |
| 🔍 **逐项解读** | 知识库匹配 → 通俗解释 + 必要性判断 + 价格评估（参考同城数据） |
| 🛡️ **保险预检** | 关联保单，逐项判断可赔付性，预估赔付金额，列出缺失材料 |
| 📄 **PDF 报告** | 一键生成结构化的账单解释报告，含可直接发给医院的核实模板 |
| 🏥 **医院查询** | 基于价格透明度 + 用户评价的推荐列表，支持高德地图定位 |

### 宠物健康管理

| 功能 | 说明 |
|------|------|
| 🐾 **宠物档案** | 管理多只宠物的品种、年龄、体重、病史信息 |
| 🩺 **健康监测** | 录入血常规/生化指标，自动生成肾功能、胰腺、血常规评分和综合等级 |
| 💉 **疫苗日历** | 记录疫苗接种和驱虫时间，自动推算下一针日期，到期前提醒 |
| 💊 **用药提醒** | 支持 6 种频次（每天/8h/12h/周/2周/月），自动推算下一剂，到时提醒 |

### AI 增强

| 功能 | 说明 |
|------|------|
| 🤖 **AI 账单助手** | 侧边栏对话面板，基于当前账单/宠物档案/知识库回答你的问题 |
| 🧠 **多模型支持** | Claude Code CLI / Claude API / DeepSeek / Ollama / OpenAI 兼容接口 |
| ⚡ **离线可用** | 核心解释逻辑不依赖 LLM，离线可用；LLM 用于增强解释和对话 |

### 知识库

| 功能 | 说明 |
|------|------|
| 📚 **知识库浏览** | 按疾病、药品、术语、症状、品种风险、护理指南分类检索 |
| 📤 **社区共建** | 遇到未知项目可自动上传（仅项目名+金额，不上传任何隐私信息） |

---

## 快速开始

### 环境要求

| 组件 | 用途 | 必需 |
|------|------|------|
| Node.js ≥ 18 | Web 服务器 | ✅ |
| Python ≥ 3.11 | OCR 服务 + PDF 报告管线 | ✅ |
| Tesseract OCR | 图片文字识别 | ✅ |
| Tesseract chi_sim | 中文识别语言包 | ✅ |
| MiKTeX / XeLaTeX | PDF 编译 | ❌ 可选 |
| 豆包 API Key | OCR 智能提取 | ❌ 建议 |
| 高德 API Key | 地图 + 医院搜索 | ❌ 可选 |

### 一键安装

**Windows (PowerShell 管理员)：**

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
.\setup.ps1
```

**macOS / Linux：**

```bash
bash setup.sh
```

### 手动安装

```bash
npm install
pip install flask pillow pytesseract
```

### 配置

编辑 `.env`，核心配置：

```env
# 数据库
VETLENS_DB_PATH=./data/vetlens.db

# OCR 智能提取（强烈建议）
DOUBAO_API_KEY=your-doubao-api-key
DOUBAO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
DOUBAO_MODEL=doubao-1-5-pro-32k-250115

# 高德地图（医院搜索/定位）
AMAP_WEB_KEY=your-amap-web-key
AMAP_SERVICE_KEY=your-amap-service-key

# LLM（可选，用于 AI 助手和增强解释）
LLM_PROVIDER=claude-code          # claude-code | claude | openai | ollama | none
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-chat
```

### 启动

```bash
npm run dev:all    # Web + OCR 一键启动
npm run dev        # 仅 Web
npm run ocr        # 仅 OCR 服务
```

访问 **http://localhost:3000**

---

## 技术栈

| 层级 | 选型 |
|------|------|
| 框架 | SvelteKit 2.x + Svelte 5 |
| UI | Tailwind CSS + Lucide Icons |
| 数据库 | SQLite (better-sqlite3) + FTS5 全文搜索 |
| OCR | PaddleOCR (Docker) / Tesseract.js + 豆包 API |
| LLM | Claude Code CLI / Claude API / DeepSeek / Ollama / OpenAI 兼容 |
| 报告 | Python pet-vault-skill → LaTeX → XeLaTeX → PDF |
| 部署 | Docker Compose / @sveltejs/adapter-node |
| 测试 | Vitest |

---

## 项目结构

```
vetlens-app/
├── src/
│   ├── routes/                    # SvelteKit 页面路由
│   │   ├── +page.svelte           # 首页（仪表盘）
│   │   ├── upload/                # 账单上传
│   │   ├── analysis/[id]/         # 分析结果详情
│   │   ├── records/               # 就诊记录列表
│   │   ├── reports/               # 报告列表 + 详情
│   │   ├── pets/                  # 宠物档案
│   │   ├── health/                # 健康监测
│   │   ├── vaccines/              # 疫苗日历
│   │   ├── medications/           # 用药提醒
│   │   ├── hospitals/             # 医院查询
│   │   ├── insurance/             # 保单管理
│   │   ├── knowledge/             # 知识库（疾病/药品/术语/品种/护理）
│   │   ├── settings/              # 设置（城市 + LLM 配置）
│   │   └── api/                   # 后端 API
│   │       ├── analyze/           # 账单分析
│   │       ├── chat/              # AI 对话（含历史）
│   │       ├── settings/llm/      # LLM 配置读写 + 测试
│   │       ├── report/pdf/        # PDF 生成
│   │       ├── ocr/               # OCR 识别
│   │       ├── pets/              # 宠物 CRUD
│   │       ├── records/           # 就诊记录 CRUD
│   │       ├── vaccines/          # 疫苗日程 CRUD
│   │       ├── medications/       # 用药提醒 CRUD
│   │       ├── health-scores/     # 健康评分
│   │       ├── insurance/         # 保单 CRUD + 预检
│   │       ├── hospitals/         # 医院查询 + 高德地图
│   │       └── knowledge/         # 知识库搜索/贡献/审核
│   └── lib/
│       ├── components/
│       │   ├── layout/            # AppShell / Sidebar / Header / MobileNav
│       │   ├── ChatPanel.svelte   # AI 助手对话面板
│       │   └── ui/                # EmptyState / ErrorState / LoadingState
│       ├── stores/                # Svelte stores（pets / settings / chat / analysis）
│       ├── utils/                 # format / markdown / safe-markdown / ocr-client
│       └── server/
│           ├── db/                 # SQLite（schema / pets / records / chat / hospitals / insurance）
│           ├── engine/             # 核心引擎
│           │   ├── matcher.ts      # 知识库匹配（FTS5 + 编辑距离）
│           │   ├── explainer.ts    # 解释生成
│           │   ├── reporter.ts     # 报告编排（5 章节 + 账单 7 章节）
│           │   ├── agent-pipeline.ts # LLM Agent 报告生成管线
│           │   ├── python-bridge.ts  # Python pet-vault-skill 调用桥接
│           │   ├── skill_bridge.py   # Python 报告编译（LaTeX → PDF）
│           │   ├── chat-*.ts         # AI 助手（safety/context/router/prompt/retrieval）
│           │   ├── health-scoring.ts # 健康评分
│           │   ├── insurance.ts      # 保险预检
│           │   └── price.ts          # 价格评估
│           ├── llm/                # LLM 适配器（Claude/DeepSeek/Ollama）
│           ├── knowledge/         # 知识库加载/导入/更新
│           └── ocr/               # OCR 预处理 + PaddleOCR
├── data/                          # 种子数据 + SQLite 数据库
├── static/                        # 静态资源（Logo / Tesseract WASM）
├── ocr_server/                    # Python OCR 服务
├── scripts/                       # 数据导入/迁移脚本
├── tests/                         # 测试用例
├── docker-compose.yml
└── Dockerfile
```

---

## API 概览

### 核心业务

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/analyze` | POST | 提交账单分析（OCR + 匹配 + 解释） |
| `/api/analyze/insurance` | POST | 保险理赔预检 |
| `/api/report/pdf` | POST | 生成 PDF 报告 |
| `/api/ocr/extract` | POST | OCR 文字提取 |

### 资源 CRUD

| 端点 | 说明 |
|------|------|
| `/api/pets` | 宠物档案 |
| `/api/records` | 就诊记录 |
| `/api/vaccines` | 疫苗日程 |
| `/api/medications` | 用药提醒 |
| `/api/health-scores` | 健康评分 |
| `/api/insurance` | 保单管理 |
| `/api/hospitals` | 医院查询 |
| `/api/reports` | 报告存取 |

### AI 与知识库

| 端点 | 说明 |
|------|------|
| `/api/chat` | AI 助手对话 |
| `/api/chat/history` | 对话历史 |
| `/api/settings/llm` | LLM 配置读写 |
| `/api/settings/llm/test` | LLM 连接测试 |
| `/api/knowledge/search` | 知识库搜索 |
| `/api/knowledge/contribute` | 贡献未知项目 |
| `/api/knowledge/review` | 审核贡献 |

---

## LLM 配置

AI 助手和增强解释支持以下后端，在设置页面可视化配置：

| 后端 | 配置项 | 说明 |
|------|--------|------|
| Claude Code CLI | `LLM_PROVIDER=claude-code` | 本地 claude 命令，自动探测 PATH |
| Claude API | `LLM_PROVIDER=claude` + `ANTHROPIC_API_KEY` | 云端或本地端点 |
| DeepSeek | `LLM_PROVIDER=openai` + `OPENAI_API_KEY` | 性价比高，中文友好 |
| Ollama | `LLM_PROVIDER=ollama` | 本地模型，完全离线 |
| 关闭 | `LLM_PROVIDER=none` | 纯规则引擎，模板回复 |

配置通过设置页面或直接编辑 `.env` 文件生效，需重启服务。

---

## 许可证

MIT
