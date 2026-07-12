# 鸣潮 · 矩阵叠兵编队规划器

纯前端单页应用，零外部依赖，双击 `index.html` 即用。

## 快速开始

```bash
git clone <repo>
cd 鸣潮/矩阵叠兵
# 直接双击 index.html 在浏览器打开
```

部署时保留整个项目目录，或上传 `index.html`、`css/`、`js/`、`data/`、`assets/` 目录即可。

## 功能

### 编队
- **角色池** — 按稀有度分组展示已拥有角色及剩余使用次数（次数 / 上限），支持折叠分组
- **拖拽编队** — 从池拖入编队自动填入首个空槽；编队间拖拽自动交换/移动；移回角色池释放
- **无限编队** — 每队最多 3 人，数量不限，支持拖拽排序
- **自动建队** — 拖角色到 "+ 添加编队" 按钮，或双击角色池卡片
- **双列布局** — 编队列表可切换单/双列，偏好持久化至 localStorage
- **上锁** — 单队锁定，锁定后拒绝拖入/拖出/删除/重排/重命名，管理模态框操作不受影响

### 角色管理
- **拥有状态** — 弹窗批量切换，支持分组全选/清空
- **点数设置** — 1~3 次使用上限，弹窗调整个别角色，归零自动从角色池消失
- **搜索** — 中文 / 拼音全拼 / 拼音首字母，叠加属性筛选
- **键盘操作** — TabIndex + Enter/Space 操作所有角色卡片

### 数据
- **自动保存** — 所有操作即时写入 `localStorage`
- **导出 / 导入** — JSON 格式，含数据版本迁移
- **重置** — 确认弹窗保护，一键恢复默认
- **`data/json/characters.json`** — 外部数据源，`file://` 失败自动使用内置兜底数据

## 操作

| 操作 | 桌面 | 移动端 |
|------|------|--------|
| 加入编队 | 拖拽到槽位 | 长按 180ms 启动拖拽 |
| 编队内换位 | 拖拽 | 拖拽 |
| 编队间移动 | 拖拽到另一队 | 拖拽 |
| 移回角色池 | 拖拽到角色池区域 | 拖拽或双击 |
| 快速建队 | 拖到 "+" 按钮 | 双击角色池卡片 |
| 重命名 | 点击标题 | 点击标题 |
| 排序 | 拖拽 ⋮⋮ 手柄 | 拖拽 ⋮⋮ 手柄 |
| 删除编队 | 点击 × 按钮 | 点击 × 按钮（确认弹窗） |
| 锁定/解锁 | 点击 🔒 图标 | 点击 🔒 图标 |

## 技术栈

| 项目 | 说明 |
|------|------|
| 框架 | 无（HTML5 + CSS3 + Vanilla JS） |
| 设计模式 | 事件委托、rAF 节流、局部渲染、生成计数器 |
| 拖拽 | HTML5 Drag API（桌面）+ Pointer Events（移动端） |
| 持久化 | `localStorage` + `DATA_VERSION` 迁移 |
| 头像 | CDN WebP + onerror 隐藏回退 + 本地 PNG |
| 搜索 | 中文 + `splitPinyin()` 拼音映射 |
| 星域背景 | Canvas 三层叠加（径向光晕 + 网格线 + 顶点闪烁）+ specks.js 四角星粒子 |

### 文件结构

```
矩阵叠兵/
├── index.html           # 入口
├── css/
│   └── style.css        # 全部样式（双主题、8 级响应式）
├── js/
│   ├── script.js        # 应用编排与页面逻辑
│   ├── core/
│   │   └── storage.js   # 统一存储读写
│   ├── data/
│   │   └── loader.js    # 数据加载与校验
│   ├── interaction/
│   │   └── drag.js      # 拖拽交互初始化
│   └── specks.js        # 四角星粒子动画
├── data/
│   ├── json/
│   │   └── characters.json # 角色静态数据
│   └── js/
│       └── data.generated.js # 离线兜底数据（自动生成）
├── assets/
│   └── png/卫星图片/    # 测试服/卫星角色本地头像
├── tools/mjs/            # 构建、开发服务器和测试脚本
└── docs/md/              # 项目文档
```

### 数据流

```
data/js/data.generated.js → js/data/loader.js
      ↓                             ↓
fetch(data/json/characters.json) → applyData()
      ↓
validate + buildDerivedData()
      ↓
startApp() → loadState() + 事件绑定
      ↓
用户操作 → 修改 state → saveState() → renderAll()
```

## 维护

### 添加新角色

1. 在 `ALL_CHARACTERS` 数组末尾插入
2. 若 CDN 有头像，在 `NANOKA_IDS` 添加 ID 映射
3. 若无 CDN 头像，在 `LOCAL_IMAGES` 添加路径并将 PNG 放入 `assets/png/卫星图片/`
4. 可选同步更新 `data/json/characters.json`，然后运行 `npm run build:data`

### 稀有度分组

| 分组 | `rarity` | 说明 |
|------|----------|------|
| 5★ 限定 | `'limited'` | — |
| 5★ 常驻 | `'standard'` | — |
| 漂泊者 | `'rover'` | 4 形态互通 |
| 4★ | `'four'` | — |
| 测试服 | `'beta'` | 未上线 |
| 卫星 | `'satellite'` | 未实装 |

### 数据迁移

1. 递增 `DATA_VERSION`
2. 在 `migrateState()` 添加逻辑
3. 迁移自动应用于 `loadState()` 和 `importData()`

## 设计细节

- **主题**：浅色（暖米色）/ 深色（深灰黑），`data-theme` 属性切换
- **响应式**：480px–1600px 共 8 个断点
- **深色背景**：Canvas 三层（径向光晕 + 网格 + 闪烁节点）+ 四角星粒子（`#4c50be` 径向渐变 + 描边辉光）
- **防误触**：拖拽阈值 8px、长按 180ms、确认弹窗覆盖所有破坏性操作
- **性能**：rAF 节流指针事件、`passive: true` 监听器、`cancelAnimationFrame` 防抖 canvas 重建、`requestIdleCallback` 低优先级任务
- **锁定保护**：Lock 图标直接渲染在 SVG 中，锁定态阻止所有拖拽/删除/重命名，保留管理模态框操作路径
