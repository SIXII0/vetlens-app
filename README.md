# VetLens（宠医透镜）

> 🐱 把一次就诊变成可解释、可追踪、可证明、可协同决策的结构化记录。

VetLens 是一个宠物医疗账单解读与保险预检的 Web 应用。

- 📸 **OCR 扫描**：上传账单照片，自动识别费用项目
- 📋 **逐项解读**：每项收费的通俗解释 + 必要性判断 + 价格评估
- 🛡️ **保险预检**：关联保单，自动判断可赔付性
- 🏥 **医院推荐**：基于价格透明度 + 用户评价的推荐列表
- 🔌 **知识库可扩展**：预留多通道更新接口

## 快速开始

### Docker 部署（推荐）

```bash
docker-compose up -d
```

访问 http://localhost:3000

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

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
