# Timesheet Management System

基于 **Vue 3 + Vite + Pinia + Supabase** 的企业工时管理系统。项目覆盖员工周工时填报、提交、两级审批、项目工时报表、组织与用户管理，并通过 Supabase Auth、PostgreSQL、RLS、RPC 与 Edge Function 实现前后端一体化权限控制。

> 显示日期统一为 `DD/MM/YYYY`；数据库日期统一存储为 `YYYY-MM-DD`。

---

## 目录

- [核心能力](#核心能力)
- [已验证功能](#已验证功能)
- [技术栈](#技术栈)
- [角色与权限](#角色与权限)
- [业务流程](#业务流程)
- [项目结构](#项目结构)
- [本地运行](#本地运行)
- [Supabase 配置与迁移](#supabase-配置与迁移)
- [Edge Function：员工管理](#edge-function员工管理)
- [数据库模型](#数据库模型)
- [关键 RPC 与触发器](#关键-rpc-与触发器)
- [测试账号与验证路径](#测试账号与验证路径)
- [安全边界](#安全边界)
- [常见问题](#常见问题)
- [当前边界与后续建议](#当前边界与后续建议)

---

## 核心能力

### 1. 登录与会话管理

- 使用 Supabase Auth 的邮箱 + 密码登录。
- 登录后自动加载 `profiles` 中的员工资料、角色、状态与组织信息。
- Pinia 统一维护 Session、当前用户、Profile 与角色。
- 浏览器刷新后自动恢复会话。
- 已停用账户无法继续使用系统。
- Vue Router 统一处理未登录跳转、角色访问控制与受保护页面。

### 2. 个人周工时

- 按周查看个人工时单，周一至周日共 7 天。
- URL 保存当前周，例如：

```text
/timesheet?week=2026-06-01
```

- 切换上一周 / 下一周。
- 当周工时单不存在时，调用 RPC 自动创建 Draft。
- 7 日卡片显示每天累计小时数和状态：
  - `≥ 8h`：完成；
  - `0 < h < 8`：提醒；
  - `0h`：未填报。
- 点击日期查看当天条目和每日合计。
- 显示本周累计工时、当前工时单状态。
- 已提交或审批中的工时单自动锁定，不允许继续编辑或删除。

### 3. 工时条目新增、编辑与删除

每条工时记录包含：

- 工作日期；
- 项目；
- 项目角色；
- 工作类型；
- 任务性质；
- 项目模块；
- Jira Ticket；
- 工时；
- 工作说明。

实现规则：

- 日期选择使用 `flatpickr`。
- 项目下拉仅显示当前员工已分配的项目。
- 模块随项目动态加载。
- 工时必须大于 0、小于等于 24，并以 `0.25` 小时为步长。
- 单日累计超过 8 小时时提示警告，但不阻止保存。
- 数据库会验证员工、项目、角色、模块、工时单周期和当前状态是否匹配。
- 删除操作要求二次确认。
- `timesheets.total_hours` 由数据库 Trigger 自动重算，前端不可手动篡改。

### 4. 工时单提交

- 展示本周每天工时、校验结果和周总计。
- 支持填写员工备注。
- 调用 `submit_timesheet` RPC 提交工时单。
- 提交后写入 `submitted_at`，状态切换为 `submitted`。
- 已提交、审批中、最终审批完成的工时单均为只读。
- 被拒绝后，员工修改任意条目时，数据库会将工时单自动恢复为 `draft`，支持重新提交。

### 5. 两级审批

#### 审批收件箱

- Supervisor / Admin 可访问。
- 支持按状态、部门、员工名称、提交周期筛选。
- 支持 20 条分页。
- 支持批量审批可操作工时单。
- 支持查看 Pending L1、Pending L2、Approved、Rejected 等状态。

#### 审批详情

- 展示员工、部门、周期间、周总计、员工备注和按日期分组的全部工时条目。
- 展示审批步骤条与审批历史。
- 一级审批：直属主管或 Admin。
- 二级审批：指定二级主管或 Admin。
- 审批通过：
  - L1：`submitted → approved_l1`
  - L2：`approved_l1 → approved_l2`
- 拒绝：任一级均可变更为 `rejected`，拒绝必须填写评论。
- 所有审批动作写入 `approval_records`，由数据库 RPC 原子完成，前端不能伪造审批历史。

### 6. Project Hours Report

- 只统计最终审批完成的 `approved_l2` 工时。
- 支持筛选：
  - 日期范围；
  - 项目；
  - 部门；
  - 员工；
  - 模块；
  - 工作类型；
  - 任务性质；
  - Jira Ticket 关键字。
- 显示 KPI：总已审批工时、项目工时、内部工时、员工数量。
- 显示按项目汇总的纯 CSS 横向工时条。
- 显示工时明细表，20 条分页。
- 浏览器原生生成 UTF-8 BOM CSV，可直接供 Excel 正确打开中文内容。
- 报表数据由 Supabase RPC 聚合，RLS / 权限函数决定当前用户实际可见范围。

### 7. Organisation & Users

- 仅 Admin 可访问。
- 递归组织树，支持按部门筛选员工。
- 员工列表支持按姓名、员工编号、邮箱搜索。
- 支持查看和编辑：
  - 姓名；
  - 员工编号；
  - 部门；
  - 直属主管；
  - 二级主管；
  - 角色；
  - 账户状态。
- 组织页面已避免依赖 PostgREST 对 `profiles → profiles` 自关联的嵌套查询；主管名称由前端基于已加载的 Profile 数据映射，因此不会受 schema cache 自关联问题影响。
- 支持通过 Edge Function 新增员工：创建 Supabase Auth 账号后，再创建对应 `profiles` 记录。
- 浏览器不直接访问 `auth.users`；员工邮箱目录由受保护的 Edge Function 提供。

---

## 已验证功能

当前环境已人工验证：

- 使用测试用户成功登录；
- Chris 可正常读取 `2026-06-01` 周的 38.5 小时工时与条目；
- Project Hours Report 可查询并成功导出 CSV；
- Organisation Tree 可正常展开；
- 选择组织节点后可展示员工资料。

建议继续按下文的“测试账号与验证路径”完成新增条目、提交、L1/L2 审批和新增员工的完整回归测试。

---

## 技术栈

| 类别 | 技术 |
|---|---|
| 前端框架 | Vue 3，Composition API，`<script setup>` |
| 构建工具 | Vite |
| 路由 | Vue Router 4，History 模式 |
| 状态管理 | Pinia |
| 日期组件 | flatpickr |
| 后端平台 | Supabase |
| 认证 | Supabase Auth（Email + Password） |
| 数据库 | Supabase PostgreSQL |
| 权限 | Row Level Security（RLS）+ 数据库函数 |
| 服务端扩展 | Supabase Edge Functions（JavaScript / Deno） |
| 报表导出 | 浏览器原生 Blob + CSV |
| UI | 原型 CSS 变量与自定义组件，无额外 UI 组件库 |

---

## 角色与权限

| 功能 | Employee | Supervisor | Project Manager | Admin |
|---|---:|---:|---:|---:|
| 查看 / 编辑自己的工时 | ✅ | ✅ | ✅ | ✅ |
| 提交自己的工时 | ✅ | ✅ | ✅ | ✅ |
| 一级审批直属下属 | ❌ | ✅ | ❌ | ✅ |
| 二级审批指定员工 | 仅指定二级主管 | 仅指定二级主管 | 仅指定二级主管 | ✅ |
| 查看报表 | 仅权限范围内 | 部门 / 审批范围 | 分配项目范围 | 全部 |
| 查看组织与员工 | ❌ | ❌ | ❌ | ✅ |
| 编辑组织与员工资料 | ❌ | ❌ | ❌ | ✅ |
| 新增 Auth 员工账号 | ❌ | ❌ | ❌ | ✅ |

> `profiles.role` 是单一主角色枚举：`employee`、`supervisor`、`project_manager`、`admin`。当前 UI 使用单选角色，而不是原型中的多选角色复选框。

---

## 业务流程

```text
员工创建 / 编辑 Draft 工时
        ↓
提交工时单（submitted）
        ↓
直属主管 L1 审批
        ↓
approved_l1
        ↓
指定二级主管或 Admin L2 审批
        ↓
approved_l2（最终完成，可进入正式报表）
```

拒绝路径：

```text
submitted 或 approved_l1
        ↓
rejected + 必填审批评论
        ↓
员工修改工时条目
        ↓
draft
        ↓
重新提交
```

---

## 项目结构

```text
timesheet-app/
├── index.html
├── vite.config.js
├── package.json
├── .env.example
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   └── 002_step8_report.sql
│   └── functions/
│       └── manage-employees/
│           └── index.js
└── src/
    ├── main.js
    ├── App.vue
    ├── assets/
    │   └── styles.css
    ├── lib/
    │   └── supabase.js
    ├── router/
    │   └── index.js
    ├── stores/
    │   ├── pinia.js
    │   ├── auth.js
    │   └── timesheet.js
    ├── utils/
    │   └── date.js
    ├── components/
    │   ├── AppShell.vue
    │   ├── ApprovalStepper.vue
    │   ├── DayBar.vue
    │   ├── EntriesTable.vue
    │   ├── OrgTree.vue
    │   ├── OrgTreeNode.vue
    │   └── StatusBadge.vue
    └── views/
        ├── SignIn.vue
        ├── MyTimesheet.vue
        ├── AddEntry.vue
        ├── SubmitTimesheet.vue
        ├── ApprovalInbox.vue
        ├── ApprovalDetail.vue
        ├── Report.vue
        ├── Organisation.vue
        └── SystemReady.vue
```

---

## 本地运行

### 环境要求

- Node.js 20 或更高版本；
- 已创建 Supabase 项目；
- 已完成数据库 Schema、RLS、RPC 和报表迁移；
- 已存在可登录的 Supabase Auth 用户及对应 `profiles` 记录。

### 安装依赖

```bash
npm install
```

### 配置前端环境变量

复制环境变量模板：

```bash
copy .env.example .env
```

macOS / Linux：

```bash
cp .env.example .env
```

编辑 `.env`：

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_or_anon_key
```

> `VITE_SUPABASE_ANON_KEY` 必须使用浏览器可公开使用的 Anon Key 或 Publishable Key。绝不能填写 `sb_secret_...` 或 Legacy Service Role Key。

### 启动开发环境

```bash
npm run dev
```

### 生产构建

```bash
npm run build
npm run preview
```

---

## Supabase 配置与迁移

### 1. 基础 Schema

项目依赖的基础数据库内容包括：

- Enum 类型；
- 核心业务表；
- 索引；
- RLS 策略；
- 数据校验函数；
- 工时合计触发器；
- 工时单创建、提交、审批、报表 RPC。

基础表包括：

```text
departments
profiles
projects
project_members
modules
timesheets
time_entries
approval_records
```

### 2. Step 8 报表迁移

在 Supabase Dashboard → SQL Editor 中执行：

```text
supabase/migrations/002_step8_report.sql
```

该迁移新增或更新：

```text
get_report_kpis(...)
get_report_project_summary(...)
```

迁移可重复执行，不会操作 `auth.users`、不会删除用户、不会改写现有业务数据。

### 3. Auth 用户与 Profile 的一致性

每位可登录员工必须同时满足：

```text
Supabase Auth 中存在用户
        ↓
public.profiles 中存在相同 UUID 的记录
        ↓
profiles.status = active
```

若 Auth 用户缺少对应 Profile，前端登录后会提示无法读取员工资料。

> 不建议通过 SQL 直接插入或更新 `auth.users`、`auth.identities`。生产环境新增员工请使用下文的 `manage-employees` Edge Function 或 Supabase Auth Admin API。

---

## Edge Function：员工管理

`supabase/functions/manage-employees/index.js` 提供两个受保护操作：

| Action | 用途 |
|---|---|
| `list` | 返回 Auth 用户 ID 与邮箱，供组织员工表展示邮箱 |
| `create` | 创建 Auth 用户，并同步创建对应 `profiles` 记录 |

函数内部会：

1. 读取当前请求的 Bearer Token；
2. 验证当前登录用户；
3. 检查其 `profiles.role = admin` 且 `status = active`；
4. 仅通过后才调用 Supabase Auth Admin API；
5. 创建 Profile 失败时回滚刚创建的 Auth 用户。

### 部署前的 CORS 配置

浏览器从 Vite 本地地址调用函数时，会先发送 `OPTIONS` 预检请求。由于函数代码本身已处理 CORS 和管理员校验，应在 `supabase/config.toml` 使用：

```toml
[functions.manage-employees]
verify_jwt = false
entrypoint = './functions/manage-employees/index.js'
```

`verify_jwt = false` 仅表示 Supabase 网关不在函数代码之前阻断 CORS 预检；并不等于不鉴权。函数内部仍会验证 Bearer Token，并检查调用者是否为 Active Admin。

### 部署命令

```bash
npx supabase@latest login
npx supabase@latest link --project-ref YOUR_PROJECT_REF
npx supabase@latest functions deploy manage-employees --no-verify-jwt
```

部署后，Admin 可在 **Organisation & Users** 页面：

- 看到员工邮箱；
- 创建新员工；
- 同时生成 Auth 账户和 Profile。

> 不要把 Supabase Secret Key 或 Service Role Key 放进 Vite `.env`。托管 Edge Function 在服务端读取 Supabase 提供的受保护环境变量。

---

## 数据库模型

| 表 | 用途 |
|---|---|
| `departments` | 支持层级的组织单元 / 部门树 |
| `profiles` | Auth 用户扩展资料、角色、状态、直属主管和二级主管 |
| `projects` | 项目主数据 |
| `project_members` | 员工项目分配与项目角色，控制员工可选项目 |
| `modules` | 项目模块 |
| `timesheets` | 每位员工每周一张工时单 |
| `time_entries` | 每日工时条目 |
| `approval_records` | 多级审批历史 |

核心约束：

- 每个员工每周只能有一张工时单：`unique(profile_id, week_start)`；
- `week_start` 必须是周一；
- `week_end` 由数据库自动生成；
- 工时必须大于 0、小于等于 24、且为 0.25 的整数倍；
- 条目日期必须落在对应工时单周期内；
- 模块必须属于已选项目；
- 已提交或审批中的工时单不可修改；
- 拒绝必须填写审批评论；
- 主管不能是本人，直属主管和二级主管不能相同。

---

## 关键 RPC 与触发器

### RPC

| RPC | 说明 |
|---|---|
| `get_or_create_timesheet(p_week_start)` | 获取或为当前员工创建指定周 Draft 工时单 |
| `submit_timesheet(p_timesheet_id, p_employee_note)` | 提交 Draft / Rejected 工时单 |
| `act_on_timesheet(p_timesheet_id, p_action, p_comment)` | 完成单笔 L1 / L2 审批或拒绝 |
| `bulk_approve_timesheets(p_timesheet_ids, p_comment)` | 批量审批工时单 |
| `get_project_hours_report(...)` | 项目工时汇总 |
| `get_approved_time_entry_details(...)` | 已审批工时明细 |
| `get_report_kpis(...)` | 报表 KPI 汇总 |
| `get_report_project_summary(...)` | 报表项目聚合 |

### 触发器 / 数据库逻辑

| 名称 | 说明 |
|---|---|
| `sync_timesheet_total()` | 工时条目新增、修改、删除后自动更新周总计 |
| `validate_time_entry()` | 验证条目所属人、项目成员资格、模块、日期周期与锁定状态 |
| `validate_timesheet_write()` | 限制工时单状态流转与提交行为 |
| `set_updated_at()` | 自动刷新 `updated_at` |
| `validate_department_hierarchy()` | 防止部门树循环引用 |

---

## 测试账号与验证路径

如果当前 Supabase 项目保留了 Demo 数据，可使用以下账号：

| 用户 | 角色 | 邮箱 | 密码 |
|---|---|---|---|
| System Administrator | Admin | `admin@company.test` | `Password123!` |
| Mary Chan | Supervisor | `mary.chan@company.test` | `Password123!` |
| David Lee | Supervisor | `david.lee@company.test` | `Password123!` |
| Chris Wong | Employee / Draft | `chris.wong@company.test` | `Password123!` |
| Amy Lau | Employee / Submitted | `amy.lau@company.test` | `Password123!` |
| Jason Ho | Employee / Approved L2 | `jason.ho@company.test` | `Password123!` |
| Sophia Lee | Employee / Rejected | `sophia.lee@company.test` | `Password123!` |

### 员工流程

1. 使用 Chris 登录；
2. 打开：

```text
/timesheet?week=2026-06-01
```

3. 查看现有 38.5 小时条目；
4. 新增、编辑或删除 Draft 条目；
5. 提交该周工时单；
6. 确认工时单进入只读状态。

### 两级审批流程

1. 使用 Amy 的 `submitted` 工时单；
2. 用 Mary 登录并进行一级审批；
3. 退出后用 David 登录并完成二级审批；
4. 再进入 Report，确认已审批工时出现在报表；
5. 使用 Sophia 的 `rejected` 工时单测试拒绝、修改、重新提交流程。

### 报表流程

1. 使用 Admin 登录；
2. 打开 **Project Hours Report**；
3. 将日期设置为：

```text
01/06/2026 - 30/06/2026
```

4. 验证 KPI、项目横条、明细分页；
5. 点击 Export CSV，检查导出文件内容。

### 组织管理流程

1. 使用 Admin 登录；
2. 打开 **Organisation & Users**；
3. 展开组织树并选择部门；
4. 选择员工，编辑部门、主管、角色或状态；
5. Edge Function 部署后测试员工邮箱展示和 `+ Add Employee`。

---

## 安全边界

- 前端只使用 Supabase Publishable / Anon Key。
- `sb_secret_...`、Legacy Service Role Key 仅能存在于服务器或 Edge Function 环境。
- 所有公开业务表启用 RLS。
- 数据库是最终权限裁决层；隐藏按钮不等于权限控制。
- 工时单状态流转由 RPC 与 Trigger 验证。
- 审批历史仅由审批 RPC 写入。
- 浏览器不会直接查询 `auth.users`。
- 新建员工只允许 Active Admin 通过 Edge Function 操作。
- CSV 导出仅导出当前用户在 RLS / 报表函数权限范围内可见的已审批数据。

---

## 常见问题

### 1. 登录后提示缺少 Profile

确认 Auth 用户 UUID 与 `profiles.id` 相同，并确认：

```text
profiles.status = active
```

### 2. Organisation Tree 为空，或报 profiles 与 profiles 关系错误

应使用已修复的 `Organisation.vue`：不要对 `profiles` 使用自关联嵌套 select。组织页面应加载普通 Profile 字段后，在 Vue 内映射直属主管、二级主管和部门名称。

### 3. manage-employees 出现 CORS preflight 错误

检查：

```toml
[functions.manage-employees]
verify_jwt = false
```

并重新部署：

```bash
npx supabase@latest functions deploy manage-employees --no-verify-jwt
```

同时保留函数内的 `OPTIONS` 响应和 `requireAdmin()` 校验。

### 4. Report 页面提示缺少 RPC

执行：

```text
supabase/migrations/002_step8_report.sql
```

### 5. 新增工时条目被拒绝

检查：

- 当前工时单是否为 `draft` 或 `rejected`；
- 工作日期是否属于工时单周期间；
- 当前用户是否已分配到所选项目；
- 所选项目角色是否与 `project_members.role_in_project` 一致；
- 模块是否属于当前项目。

### 6. 新增员工失败

检查：

- 当前登录账号是否为 Active Admin；
- Edge Function 是否已部署；
- 员工编号是否唯一；
- 邮箱是否已在 Supabase Auth 存在；
- 临时密码是否至少 8 位；
- Edge Function 的服务端密钥环境变量是否可用。

---

## 当前边界与后续建议

当前版本已经具备完整的工时管理主链路，但在正式生产上线前，建议继续完善：

- 增加部门、项目、模块的完整 CRUD 管理页；
- 为项目成员分配提供专用管理界面；
- 增加审计日志、登录日志和敏感变更记录；
- 新增密码重置、首次登录改密、邮箱变更流程；
- 增加节假日、标准工时、请假规则与跨周校验；
- 增加审批超时提醒、邮件或消息通知；
- 增加导入导出、附件、Jira API 实际联动；
- 增加 E2E 测试、权限回归测试与生产错误监控；
- 在真实生产环境使用独立的管理员初始化流程，不复用旧的直接写入 Auth 表的 Seed 脚本。

---

## License

内部系统项目。请根据组织的软件许可、数据安全与部署规范进行管理。
