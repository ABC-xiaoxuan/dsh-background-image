# DeepSeek Harness 背景图片插件

适配当前 DeepSeek Harness 0.2.0-rc.2 的 Web / 桌面界面。

## 使用

安装并启用后刷新界面，打开 **设置 → 背景图片**，选择本地图片。

- 支持 JPG、PNG、WebP、GIF、AVIF、BMP，最大 20 MB。
- 图片存入当前浏览器来源的 IndexedDB，不上传服务器。
- 支持开关、主题遮罩、模糊、铺满／完整显示／平铺。
- 支持移除图片并恢复默认；禁用插件会移除其背景样式。
- 背景图片透明度：0% 为清晰显示，100% 为完全不可见。
- 界面面板透明度：0% 保留面板背景，100% 使面板背景透明；默认 80%。
- 首页／聊天主界面使用背景，侧栏、聊天、右侧面板、输入卡片与应用菜单通过背景色 token 透出图片，文字与图标不变透明。
- 打开设置时自动停用背景图片和透明度覆盖，整个界面恢复原始主题背景；关闭设置后自动恢复。背景图片的选择与调整入口仍保留在设置内。
- 深浅色切换后自动重新计算背景颜色；网页 iframe、PDF 等外部／嵌入内容不强制透明。

图片选择后自动保存。不同浏览器／来源之间不共享图片；清除浏览器站点数据会删除设置。

## 开发与安装

```powershell
node scripts/build.mjs
node --test tests/preferences.test.mjs
npm pack --ignore-scripts
```

将生成的本地 tgz 通过 DSH 插件管理器安装，并启用 `dsh-background-image`。

Host 入口为空，无工具或上传路由；Client 使用 DSH 内置 ModuleLoader 和 React。

## 版本限制

当前背景穿透使用从 0.2.0-rc.2 安装包核实的 CSS-module 类名（shell 和对话根）。这些类名不是稳定公共 API，DSH 升级后可能需要更新 `src/background.js` 中的选择器。插件不修改 DSH 安装文件。
