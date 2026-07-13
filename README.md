# 鸣潮 · 矩阵叠兵

一个用于规划《鸣潮》角色编队的纯前端单页工具。支持角色池管理、拖拽编队、使用次数、搜索筛选、数据导入导出，以及桌面端和移动端操作。

## 在线使用

- **GitHub Pages**：<https://inoristory.github.io/wuwa-matrix/>
- **项目仓库**：<https://github.com/Inoristory/wuwa-matrix>

打开网页后即可使用，不需要注册账号，也不会上传你的编队数据。配置默认保存在浏览器的 `localStorage` 中。

## 快速开始

### 直接打开

下载或克隆项目后，直接打开根目录的 `index.html` 即可运行。

```bash
git clone https://github.com/Inoristory/wuwa-matrix.git
cd wuwa-matrix
```

### 本地开发服务器

如果浏览器限制了 `file://` 下的 JSON 请求，使用项目自带的开发服务器：

```bash
npm run dev
```

然后访问终端显示的本地地址。

### 运行测试

```bash
npm test
```

测试会检查角色数量、生成数据、JavaScript 语法和基础状态逻辑。

## 主要功能

### 编队规划

- 角色池按稀有度分组展示，并显示剩余使用次数。
- 从角色池拖入队伍，自动填入第一个空槽位。
- 支持队伍内换位、队伍间移动、移回角色池和拖拽排序。
- 每队最多 3 名角色，队伍数量不限。
- 支持双击角色快速创建队伍。
- 支持单列/双列布局和单队锁定。

### 角色管理

- 在“管理角色”中批量设置角色显示状态。
- 为每名角色设置 1～3 次使用上限。
- 使用中文、拼音全拼或拼音首字母搜索角色。
- 支持按属性筛选，并支持键盘操作角色卡片。

### 数据管理

- 所有操作自动保存到浏览器本地存储。
- 支持 JSON 格式导出和导入。
- 支持版本迁移，方便后续更新数据结构。
- JSON 数据加载失败时自动使用内置的离线兜底数据。
- 支持浅色/深色主题，偏好会保存在本地。

## 操作说明

| 操作 | 桌面端 | 移动端 |
| --- | --- | --- |
| 加入队伍 | 拖拽角色到槽位 | 长按约 180ms 后拖拽 |
| 队伍内换位 | 拖拽角色 | 拖拽角色 |
| 队伍间移动 | 拖拽到另一队 | 拖拽到另一队 |
| 移回角色池 | 拖拽到角色池 | 拖拽或双击 |
| 快速建队 | 拖到“+ 添加编队” | 双击角色卡片 |
| 重命名队伍 | 点击队伍标题 | 点击队伍标题 |
| 调整顺序 | 拖拽 ⋮⋮ 手柄 | 拖拽 ⋮⋮ 手柄 |
| 删除队伍 | 点击 × | 点击 × 并确认 |
| 锁定队伍 | 点击锁定图标 | 点击锁定图标 |

## 项目结构

```text
wuwa-matrix/
├── index.html                 # 页面入口
├── css/
│   └── style.css              # 页面样式与响应式布局
├── js/
│   ├── script.js              # 应用状态、渲染和事件编排
│   ├── ui/theme.js            # 主题切换与偏好保存
│   ├── background/            # 玄翎雀 × 重明鸟 Canvas 背景
│   ├── core/storage.js        # localStorage 读写与数据迁移
│   ├── data/loader.js         # 角色数据加载与校验
│   ├── interaction/drag.js    # 拖拽初始化
│   └── specks.js              # 低数量漂浮羽毛粒子
├── data/
│   ├── json/characters.json   # 角色数据源
│   └── js/data.generated.js   # 自动生成的离线兜底数据
├── assets/png/                # 本地角色头像资源
├── tools/mjs/                 # 数据构建、开发服务器和测试脚本
└── docs/md/                   # 版本顺序等补充文档
```

## 数据流程

```text
data/json/characters.json
          │
          ├── loader.js 加载、校验、构建派生数据
          │
          └── script.js 初始化界面和用户状态
                         │
                         └── 用户操作 → 保存 localStorage → 局部更新界面
```

## 技术特点

- 原生 HTML5、CSS3 和 Vanilla JavaScript，无前端框架依赖。
- 使用事件委托、局部渲染和 `requestAnimationFrame` 减少重复计算。
- 桌面端使用 HTML5 Drag API，移动端使用 Pointer Events。
- 头像优先使用 CDN WebP，失败时自动隐藏或回退到本地资源。
- 支持响应式布局、键盘访问和触摸操作。
- 使用 Canvas 绘制双主题羽流，并用少量漂浮羽毛强化主题识别，不影响核心功能使用。

## 维护角色数据

角色数据主要位于 `data/json/characters.json`，修改后运行：

```bash
npm run build:data
npm test
```

如果角色使用 CDN 头像，需要同步更新头像 ID 映射；没有 CDN 头像的角色则放入 `assets/png/` 并配置本地路径。

## GitHub Pages 部署

项目是静态网站，可以直接从 GitHub Pages 的 `main` 分支根目录发布：

1. 打开仓库的 `Settings → Pages`。
2. 在 **Source** 中选择 **Deploy from a branch**。
3. 选择分支 `main` 和目录 `/ (root)`。
4. 保存后等待 GitHub 完成首次构建。
5. 访问 <https://inoristory.github.io/wuwa-matrix/>。

## 许可证

本项目目前未声明单独的开源许可证。项目中的游戏角色名称、头像及相关素材版权归其原权利人所有。
