#!/bin/bash
# 1. 在 GitHub 网页上登录后访问：
#    https://github.com/new
#    Repository name: edgeever-plugin-calendar
#    Public 勾上
#    不要勾 README / .gitignore / license
#    点 Create repository

# 2. 把脚本里 GITHUB_USER 改成你的用户名（mayiking）
# 3. 执行此脚本

set -e

GITHUB_USER="mayiking"
REPO="edgeever-plugin-calendar"
LOCAL="/Users/mayikingmac/edgeever-plugins/calendar"

# 添加远程仓库
cd "$LOCAL"
git remote remove origin 2>/dev/null || true
git remote add origin "git@github.com:${GITHUB_USER}/${REPO}.git"

# 推送
git push -u origin main

# 打 tag
git tag v1.0.0
git push origin v1.0.0

echo "✅ 代码已推送"
echo ""
echo "📦 接下来创建 Release："
echo "   1. 浏览器打开：https://github.com/${GITHUB_USER}/${REPO}/releases/new"
echo "   2. Choose a tag: 选 v1.0.0"
echo "   3. Release title: 驻村日历 v1.0.0"
echo "   4. Description 留空或随便写"
echo "   5. 上传这 3 个文件（在 Attach binaries 处拖拽）："
echo "      - manifest.json"
echo "      - main.js"
echo "      - styles.css"
echo "   6. 点 Publish release"
echo ""
echo "🌟 完成后你的安装 URL 是："
echo "   https://github.com/${GITHUB_USER}/${REPO}"
echo "   粘到 EdgeEver 插件市场即可装"