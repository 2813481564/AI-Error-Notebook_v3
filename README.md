<div align="center">
  <img src="./logo.png" width="110" alt="AI 智能错题本" />

  <h1>AI 智能错题本 · AI Error Notebook</h1>

  <p><strong>拍照即录入 · AI 诊断错因 · 举一反三变式 · 学情报表 · 多角色协同教学</strong></p>

  <p>
    <a href="./README.en.md">English</a> | 简体中文
  </p>
</div>

---

> **English Summary**
> AI Error Notebook is a self-hosted, AI-powered mistake-book system for schools and tutoring teams.
> Students upload photos of their wrong answers; the system extracts the questions via vision models,
> diagnoses the root cause, tags knowledge points, generates variant exercises, and produces
> daily / weekly / monthly learning reports. It ships with a four-role permission model
> (admin / academic staff / teacher / student), an async AI task queue, and an admin console
> where the model provider can be switched at runtime. Backend: Express + SQLite (better-sqlite3),
> frontend: React 19 + Vite + Tailwind CSS 4.

## 这个项目解决什么问题

学生整理错题，长期停留在「抄一遍题目 + 抄一遍答案」，抄完不会再看，错因从未被分析。
老师想看班级薄弱点，只能靠手工统计。

本项目把整条链路自动化：**拍照上传 → AI 识别抽取 → 错因诊断 → 归类错题本 → 生成变式题 → 汇总学情报表**，
让「整理错题」从体力活变成一次自动化的学习闭环。全部数据保存在本机 SQLite 与本地目录，无需外部数据库，适合私有化部署。

## 核心功能

### 学生端
- **拍照录入错题**：支持单题、多题、跨页三种上传模式，AI 自动切题、OCR 抽取题干 / 学生答案 / 标准答案
- **错因诊断**：输出标准解法、步骤诊断、错误原因与知识点考点方向
- **举一反三**：按原题生成同考点变式题，一键加入错题本
- **错题本管理**：多本分类、掌握度标记、原图回显
- **费曼学习**：学生用自己的话讲解题目，AI 给出评价与补充
- **学情报表**：日 / 周 / 月报，薄弱点列表、高频错题、雷达图可视化
- **试卷生成与打印**：错题自动排版为 A4 试卷，支持几何图形精确绘制
- **会员与兑换**：AI 学习额度、卡券兑换、套餐购买

### 教学端
- **教学老师工作台**：快速答题（仅出答案与关键步骤）、作业批改、批改审查
- **学生管理**：名下学生列表、编辑学生、查看与维护学生错题本
- **题目列表**：跨老师共享的题目库联合查询

### 教务端
- **角色创建**：创建教学老师、创建学生账号（自动建立错题本）
- **报表中心**：按班级 / 学生生成日报、周报、月报
- **学生时效管理**：账号有效期续期、过期拦截

### 管理端
- **AI 渠道配置**：OpenAI 兼容接口 / Gemini 随时切换，支持连通性测试与配置历史回滚
- **配额管理**：按角色设定每日 AI 调用上限
- **系统设置**：公告轮播、VIP 客服、SMTP 邮件、兑换码生成
- **用户管理**：账号增删改查、周维度使用统计

## 技术栈

| 层次 | 选型 |
| --- | --- |
| 前端 | React 19、Vite 6、Tailwind CSS 4、Recharts、KaTeX、lucide-react |
| 后端 | Node.js、Express 4、TypeScript、tsx |
| 数据库 | SQLite（better-sqlite3），启动时自动建表与迁移 |
| AI | 兼容 OpenAI Chat Completions 协议的服务、Google Gemini |
| 其他 | SSE 流式推送、异步任务队列、sharp 图片处理、nodemailer 邮件 |

## 快速开始

**环境要求**：Node.js 18 / 20 LTS

```bash
# 1. 安装依赖
npm install

# 2. 准备环境变量
cp .env.example .env

# 3. 启动开发服务（前端热更新 + 后端 API）
npm run dev

# 4. 构建生产版本
npm run build

# 5. 启动生产服务
npm start
```

启动后访问 `http://localhost:9088/notebook/`。
首次启动会自动生成数据库文件并初始化超级管理员账号：`admin / admin123`（**部署后请立即修改密码**）。

> 也可以在 `.env` 中留空 API Key，登录后进入「系统设置」页面在线配置模型渠道与密钥。

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PORT` | 服务监听端口 | `9088` |
| `GEMINI_API_KEY` | Gemini 接口密钥 | 空 |
| `GEMINI_MODEL` | Gemini 默认模型 | `gemini-3.0` |
| `APP_URL` | 对外访问地址，用于生成自引用链接 | 空 |
| `REPORT_PATH_PREFIX` | 报表链接路径前缀（反向代理子路径部署时使用） | 空 |

完整的生产部署、Nginx 反向代理与备份方案见 [部署文档.md](./部署文档.md)。

## 项目结构

```
├── src/
│   ├── components/          # 前端页面与组件（学生端、教学端、教务端、管理端）
│   ├── lib/                 # 前端工具与接口封装
│   ├── types/               # 共享类型定义（含几何图形数据结构）
│   └── server/
│       ├── config/          # 数据库初始化与配置
│       ├── controllers/     # 业务控制器（AI、题目、任务、角色、报表）
│       ├── middleware/      # 鉴权与 AI 配额限流
│       ├── routes/          # 路由注册
│       ├── services/        # AI 服务封装（多渠道适配）
│       └── utils/           # 通用工具
├── server.ts                # 服务入口（Express + Vite 中间件）
├── index.html
└── 部署文档.md
```

## 设计说明

- **异步任务队列 + SSE**：图片识别与批量批改耗时较长，统一走后台任务队列，前端通过 SSE 实时接收进度，避免请求超时
- **结构化输出与前端兜底**：大模型只负责结构化推理，数学公式与表格排版交给 KaTeX / 前端渲染器处理，降低幻觉对版式的影响
- **几何图形确定性渲染**：题目中的几何图不依赖图片，AI 输出结构化坐标，前端按坐标精确绘制
- **零外部数据库**：SQLite 单文件存储，备份只需复制 `questions.db` 与 `uploads/` 目录

## 常见问题

见 [部署文档.md](./部署文档.md) 第六节「常见问题与排除」。

## 贡献

欢迎提交 Issue 与 Pull Request。提交前请确保 `npm run lint`（`tsc --noEmit`）通过。
