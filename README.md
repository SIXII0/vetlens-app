# VetLens（宠医透镜）

> 🐱 把一次就诊变成可解释、可追踪、可证明、可协同决策的结构化记录。

VetLens 是一个宠物医疗账单解读与保险预检的 Web 应用。

- 📸 **OCR 扫描**：上传账单照片，自动识别费用项目
- 📋 **逐项解读**：每项收费的通俗解释 + 必要性判断 + 价格评估
- 🛡️ **保险预检**：关联保单，自动判断可赔付性
- 🏥 **医院推荐**：基于价格透明度 + 用户评价的推荐列表
- 🔌 **知识库可扩展**：预留多通道更新接口

## 快速开始

### 一键部署（新电脑）

**Windows (PowerShell 管理员)：**
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
.\setup.ps1
```
自动安装 Node.js / Python / Tesseract / 中文语言包 / 所有依赖。

**macOS / Linux：**
```bash
bash setup.sh
```

### .env 配置

部署后编辑 `.env`，至少填入：

```env
DOUBAO_API_KEY=你的豆包API Key        # OCR智能提取（必填）
AMAP_WEB_KEY=你的高德Web端Key          # 地图显示
AMAP_SERVICE_KEY=你的高德Web服务Key    # 附近医院搜索
```

### 启动

```bash
npm run dev:all    # 一键启动 Web + OCR 服务器
npm run dev        # 仅 Web 服务器
```

访问 http://localhost:3000

### 环境依赖

| 组件 | 用途 | 必需 |
|------|------|------|
| Node.js >= 18 | Web 服务器 | ✅ |
| Python >= 3.11 | OCR 服务器 + PDF 管线 | ✅ |
| Tesseract OCR | 图片文字识别 | ✅ |
| Tesseract chi_sim | 中文识别语言包 | ✅ |
| Pillow / Flask | OCR 服务依赖 | ✅ |
| MiKTeX / XeLaTeX | PDF 编译 | ❌ 可选 |
| 豆包 API Key | OCR 智能提取 | ❌ 建议 |
| 高德 API Key | 地图+医院搜索 | ❌ 可选 |

## 技术栈

| 层级 | 选型 |
|------|------|
| Web 框架 | SvelteKit 2.x |
| UI | Tailwind CSS |
| 数据库 | SQLite (better-sqlite3) + FTS5 |
| OCR | PaddleOCR (Docker) / Tesseract.js |
| LLM | 可选：Claude / Ollama / OpenAI |
| 部署 | Docker + Docker Compose |

## 知识库

当前种子数据：
- 25 条术语（常见检查/药品/耗材）
- 4 城市价格参考（北/上/广/深）
- 10 组品种-疾病关联
- 5 款保险产品条款

扩展通道：内置 JSON → git pull → 自动上传 → 合作方 API → Webhook → 社区共建

## 架构

```
用户 → 上传账单照片
  → OCR 识别（PaddleOCR / Tesseract）
  → 知识库匹配（FTS5 + 编辑距离）
  → 价格评估（规则引擎，不依赖 LLM）
  → 解释生成（模板 + 可选 LLM 润色）
  → 逐项解读 + 保险预检 + 医院推荐
  → 归档就诊记录
```

核心逻辑不依赖 LLM，离线可用。LLM 仅用于未知项目的 fallback 推断和 AI 增强解释。

## 许可

MIT
