# 企业采购订单采集工作台

基于 React + Ant Design 的企业采购订单采集工作台。当前为 v0.1.0 占位版本：工作台框架与采集占位页面已就绪，具体采集方式待后续需求讨论后实现。

## 技术栈

- React 19 + TypeScript
- Ant Design 6.7.1
- React Router 6
- Vite 6
- Vitest + Testing Library（单元测试 / 冒烟测试）

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 构建生产包
npm run build

# 本地预览构建产物
npm run preview

# 运行测试
npm test
```

> 环境要求：Node.js 20.19+ 或 22.12+。
> antd 6 的依赖链路在测试环境需要 Node 支持 `require(ESM)`，Node 18 会在运行测试时报错。
> 如使用 nvm，可执行 `nvm use 22` 切换版本。

## 第一次使用（给同事看这里）

这套仓库带了一个"新手入口"技能：装好之后，新开一个会话跟 AI 打个招呼，它就会给出三个可点击的快捷选项——

- **启动项目**：帮你跑起本项目，并在浏览器打开 `http://localhost:5173`
- **项目介绍**：用大白话讲清楚这个项目是做什么的、现在到哪一步
- **项目开发**：直接说"我要加个功能"或"这里有个 bug"，进入开发对话

安装（每台电脑装一次即可）：

```bash
npm install
npm run skill:install
```

装完**重新开一个会话**才生效（技能在会话开始时加载）。如果打招呼后没看到选项，说明本机的技能目录不在 `~/Doubao/skills`，换目录重装：

```bash
npm run skill:install -- --target "$HOME/.agents/skills" --force
```

说明：
- 技能源文件就在 `skills/po-workbench-entry/`，装的是**软链接**，仓库是唯一真源，改完立即生效
- 不需要了：`npm run skill:uninstall`（只删链接，不动仓库）
- 想改三个选项的文案或行为，改 `skills/po-workbench-entry/SKILL.md`
- 想改"项目介绍"的口径，改 `skills/po-workbench-entry/project-intro.md`

## 目录结构

```
po-workbench/
├── public/
│   └── favicon.svg
├── scripts/
│   ├── check-node.mjs               # Node 版本校验（测试前执行）
│   └── install-skill.sh             # 安装新手入口技能（软链接到本机技能目录）
├── skills/
│   └── po-workbench-entry/
│       ├── SKILL.md                 # 新手入口技能：三个快捷选项与执行流程
│       └── project-intro.md         # 「项目介绍」使用的口径，改动请同步这里
├── src/
│   ├── components/
│   │   └── ErrorBoundary.tsx        # 全局错误边界
│   ├── layouts/
│   │   └── WorkbenchLayout.tsx      # 工作台布局（侧边栏 + 顶栏 + 内容区）
│   ├── pages/
│   │   ├── dashboard/index.tsx      # 工作台概览
│   │   ├── collection/index.tsx     # 采购订单采集（占位）
│   │   └── NotFound.tsx             # 404 页面
│   ├── styles/global.css            # 全局样式
│   ├── test/                        # 测试环境配置与用例
│   ├── App.tsx                      # 路由表
│   └── main.tsx                     # 应用入口
├── index.html
├── vite.config.ts
└── tsconfig.json
```

## 页面说明

### 工作台概览 `/dashboard`

- 核心指标卡片：今日采集订单、待审核订单、已入库订单、异常订单（当前为占位数据）
- 采集任务 / 采集趋势占位面板
- 最近订单列表占位表格

### 采购订单采集 `/collection`

占位页面，包含：

- 采集功能建设中提示
- 规划中的采集流程：配置数据源 → 获取订单数据 → 数据校验 → 写入订单库
- 禁用的采集入口按钮（开始采集 / 导入 Excel / 配置数据源）

## 后续规划（待讨论）

1. 确定采集方式：接口对接、文件导入或页面抓取
2. 设计订单数据模型与来源企业配置
3. 接入后端接口，补充完整的异常处理与加载状态
4. 增加订单审核、异常处理与导出功能
5. 补充采集流程的单元测试与接口测试

## 开发约定

- 代码注释使用中文，保持可读性
- 所有接口调用需包含完整的异常处理
- 使用 `@/` 别名引用 `src` 下的模块
- 修改代码后同步更新测试用例
