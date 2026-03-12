# ♠️ 麻将房动态二维码系统

一个面向小型门店的动态二维码后台系统。

## ✨ 这个项目解决什么问题

它解决的是这个实际问题：
- 打印一个固定二维码，二维码本身不变
- 员工按房间开局，系统生成当局口令
- 顾客扫码后输入房间、姓名、手机号后 4 位和口令
- 系统按规则校验后，再跳转到目标表单或问卷页面
- 后台可以随时改目标链接，不需要重印二维码

正式问卷数据仍然由外部表单平台保存，这个系统只负责：
- 扫码控制
- 房间管理
- 牌局规则
- 最小化扫码日志

## 🎯 适用场景

### ✅ 适合
- 单人管理后台
- 小型门店或内部工具
- 不想维护数据库
- 只需要固定二维码 + 后台动态控制

### ⚠️ 不适合
- 多机器同时高并发写同一个本地文件
- 大规模多管理员协作
- 未配置持久化就直接部署到无状态平台

## 🧩 当前能力

- 固定二维码入口：`/r/default`
- 房间管理：
  - 单个新增
  - 批量导入
  - 拖动排序
  - 启用 / 停用
  - 删除房间
- 牌局管理：
  - 开局生成口令
  - 自定义人数上限
  - 支持自动失效
  - 支持直接结束本局
- 扫码校验：
  - 房间是否启用
  - 是否存在进行中的牌局
  - 口令是否正确
  - 人数是否已满
  - 同一访客是否重复登记
- 后台看板：
  - 房间状态
  - 当前局参与人
  - 最近扫码日志
- 打印页：
  - 生成固定二维码
  - 显示当前扫码地址
- 存储模式：
  - 本地 `data/store.json`
  - 配置 `BLOB_READ_WRITE_TOKEN` 后可切到 Vercel Blob

## 🛠️ 技术栈

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Zod
- Jose
- bcryptjs
- qrcode
- @vercel/blob

## 🏗️ 系统架构

### 🖥️ 前端页面

- `/`：项目首页
- `/r/default`：顾客扫码页
- `/staff/login`：后台登录页
- `/staff`：后台管理页
- `/staff/print`：二维码打印页

### 🔌 API 路由

主要由 Next.js Route Handlers 提供：
- 登录 / 退出
- 活动配置
- 房间管理
- 开局 / 结束本局
- 扫码校验
- 后台看板数据

### 💾 数据层

核心逻辑集中在 `src/lib/store.ts`。

默认使用本地文件：
- `data/store.json`

如果部署到 Vercel 并配置：
- `BLOB_READ_WRITE_TOKEN`

则自动改用 Vercel Blob。

### 🔐 会话与权限

- 后台使用签名 Cookie 保存会话
- `ADMIN` 可以管理活动配置和房间
- `STAFF` 可以登录后台并操作牌局

## 🔄 核心流程

### 👔 员工流程

1. 登录后台
2. 选择房间
3. 设置人数上限和可选失效时间
4. 点击“新开一局”
5. 系统生成当局口令
6. 把口令告诉现场顾客
7. 在后台查看房间状态和扫码日志

### 📱 顾客流程

1. 扫固定二维码，进入 `/r/default`
2. 选择房间
3. 输入姓名
4. 输入手机号后 4 位
5. 输入本局口令
6. 系统校验
7. 校验通过后跳转到目标表单页

## 🚀 本地运行

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制示例文件：

```bash
copy .env.example .env
```

最小本地配置：

```env
AUTH_SECRET="change-me-to-a-long-random-secret"
DEFAULT_TARGET_URL="https://docs.qq.com/form/page/example"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
STORE_FILE="./data/store.json"
```

说明：
- `SEED_ROOMS` 可不填
- 本地开发如果不填后台账号，系统默认提供测试账号

### 3. 启动开发环境

```bash
npm run dev
```

启动后访问：
- 首页：`http://localhost:3000`
- 扫码入口：`http://localhost:3000/r/default`
- 后台登录：`http://localhost:3000/staff/login`
- 打印页：`http://localhost:3000/staff/print`

## 🔑 默认账号

仅本地开发环境自动提供：
- 管理员：`admin / Admin@123456`
- 员工：`staff / Staff@123456`

生产环境建议显式配置：
- `SEED_ADMIN_USERNAME`
- `SEED_ADMIN_PASSWORD`
- `SEED_STAFF_USERNAME`
- `SEED_STAFF_PASSWORD`

## ⚙️ 环境变量

参考 `.env.example`。

### 基础

- `AUTH_SECRET`
- `DEFAULT_TARGET_URL`
- `NEXT_PUBLIC_APP_URL`
- `STORE_FILE`

### 可选房间种子

- `SEED_ROOMS`

示例：

```env
SEED_ROOMS="A1,B1,C1"
```

### ☁️ Vercel Blob

- `BLOB_READ_WRITE_TOKEN`
- `STORE_BLOB_PATH`

### 🧑‍💼 生产环境后台账号

- `SEED_ADMIN_USERNAME`
- `SEED_ADMIN_PASSWORD`
- `SEED_STAFF_USERNAME`
- `SEED_STAFF_PASSWORD`

## 📌 常用操作

### 修改目标链接

登录后台后，在“活动配置”里修改目标链接即可。

特点：
- 二维码本身不变
- 保存后立即生效
- 不需要重印二维码

### 从空数据重新开始

删除本地数据文件后重启：

```bash
npm run dev
```

系统会重新初始化默认数据。

### 查看扫码日志

登录后台后可以查看：
- 最近扫码记录
- 哪个房间有顾客扫码
- 是否通过
- 拒绝原因是什么

## ☁️ Vercel 部署说明

如果只是自己电脑长期运行，最简单的是继续使用本地文件模式。

如果部署到 Vercel：
- 不能依赖 `data/store.json`
- 必须配置 `BLOB_READ_WRITE_TOKEN`
- 必须显式配置后台账号
- 必须设置正式域名到 `NEXT_PUBLIC_APP_URL`

推荐的生产环境变量：

```env
AUTH_SECRET="your-long-random-secret"
DEFAULT_TARGET_URL="https://your-form-link"
NEXT_PUBLIC_APP_URL="https://your-domain.com"
BLOB_READ_WRITE_TOKEN="your-vercel-blob-token"
STORE_BLOB_PATH="mahjong-qr-system/store.json"
SEED_ADMIN_USERNAME="admin"
SEED_ADMIN_PASSWORD="change-this-password"
SEED_STAFF_USERNAME="staff"
SEED_STAFF_PASSWORD="change-this-password-too"
```

## 📁 目录结构

```text
src/
  app/
    api/          API 路由
    r/default/    顾客扫码页
    staff/        后台页面
  components/     页面组件
  lib/            业务逻辑与存储层

data/
  store.json      本地运行数据（已忽略，不提交）
```

## 🧠 关键文件

- `src/lib/store.ts`
- `src/lib/session.ts`
- `src/app/api/public/entry/route.ts`
- `src/app/api/staff/dashboard/route.ts`
- `src/components/staff-dashboard.tsx`
- `src/components/entry-form.tsx`
- `src/components/print-panel.tsx`

## 📦 GitHub 提交前注意

确认以下文件不要提交：
- `.env`
- `data/store.json`
- 其他本地私有文件

这些文件已经在 `.gitignore` 里处理。

## 📝 License

当前仓库未附带开源许可证。
如果你准备公开发布到 GitHub，建议补一个 `LICENSE` 文件后再开放给别人使用。
