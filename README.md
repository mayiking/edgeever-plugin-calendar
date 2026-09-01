# 驻村日历 · EdgeEver 插件

在 EdgeEver 侧边栏挂一个**日历视图**，按日期显示当天笔记数；点击日期查看该日所有笔记，点击笔记直接跳转。

## 功能

- 🗓️ 月历视图，今天高亮
- 📌 有笔记的日期角标显示数量
- 📝 点击日期下方列出当天所有笔记标题 + 摘要
- 🔗 点击笔记标题跳转打开
- ⌘K 命令面板输入"打开驻村日历"

## 安装

1. 打开 EdgeEver，进入"插件市场"页面
2. 粘贴本仓库 URL：`https://github.com/zhangyan/edgeever-plugin-calendar`
3. 点击安装，确认权限
4. 在侧边栏找到"🗓️ 驻村日历"，或用 ⌘K 召唤

## 权限说明

- `notes:read` — 读取笔记标题、摘要、更新时间（用于日历聚合）
- `ui:panels` — 注册侧边栏面板
- `ui:commands` — 注册命令面板命令
- `ui:notices` — 加载提示

## 隐私

- 插件完全在浏览器端运行
- **不上传任何笔记到外部服务器**
- 数据来自 EdgeEver MCP API（用户登录态）

## 开发

```bash
git clone https://github.com/zhangyan/edgeever-plugin-calendar
cd edgeever-plugin-calendar
# 编辑 main.js 或 manifest.json
git add -A
git commit -m "feat: xxx"
git push origin main
git tag v1.0.1
git push origin v1.0.1
# GitHub → Releases → Draft new release → 选择 tag v1.0.1
# 上传 manifest.json + main.js + styles.css
```

## License

MIT