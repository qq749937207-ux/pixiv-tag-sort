# Pixiv 标签热门排序

在 Pixiv 标签页 / 搜索页批量读取作品收藏数，按热度排序，并支持收藏范围、多标签、屏蔽和结果页预览。适用于桌面和手机（Tampermonkey / 浏览器油猴扩展，以及 iOS 的 Userscripts）。

当前版本：**1.12.0**

## 请先读：可能被限流（429）

扫描会向 Pixiv 发出大量 `/ajax/illust` 请求。即使使用默认的「标准 60 次/分」，也仍有可能触发限流。被限流后：

- 脚本会**立即停止，不会自动重试**
- 这段时间打开作品页，可能会显示「尚无此页」
- 请停下来等到冷却结束，不要立刻再扫、也不要反复刷新

根据使用中的观察，这种限流更像是按设备而不是按账号，换账号通常躲不掉。请只用脚本自带的限速档位，不要用其它手段绕过。

正式档位：

- **标准 60**（默认）：适合大量扫描
- **快速 80**：样本较小时可用
- **爆发**：前 100 次约 200 次/分，之后降到 60，更容易触发限流

默认开启自动保护：60 档每约 400 次请求暂停约 45 秒，80 档每约 200 次暂停约 60 秒。爆发档不暂停，只在遇到 429 时立刻停止。

## 安装

点击下面的安装链接，油猴扩展会弹出安装页：

**[安装 / 更新 pixiv-tag-sort.user.js](https://raw.githubusercontent.com/qq749937207-ux/pixiv-tag-sort/main/pixiv-tag-sort.user.js)**

### 电脑 Edge / Chrome

1. 安装 [Tampermonkey](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)（Chrome 则用 Chrome 网上应用店里的 Tampermonkey）。
2. 打开 `edge://extensions` 或 `chrome://extensions`，打开**开发人员模式**。
3. 点进 Tampermonkey 的「详细信息」，打开 **允许用户脚本**（Allow User Scripts）。这两项不是同一回事，只开开发人员模式脚本也不会运行。
4. 打开上面的安装链接，在油猴里点「安装」。
5. 打开任意 [Pixiv 标签页](https://www.pixiv.net/)，右侧应出现本脚本面板。

如果提示「没有访问此页面的权限」，点地址栏右侧拼图图标，把 Tampermonkey 设为「在此站点上允许」或「在所有站点上允许」，然后刷新。

### 安卓 Edge

安装 Tampermonkey 扩展后，用同一条安装链接即可。这是主要开发和测试环境。

### iPhone Safari

需要安装 [Userscripts](https://apps.apple.com/app/userscripts/id1462491918) 扩展，在 Safari 里启用后再导入同一脚本。这条路径验证较少，若有问题欢迎提 Issue。

## 能做什么

- 会员热门排序（默认），非会员或热门不可用时自动改用 `users入り` 等方式
- 按收藏数范围过滤；若热门排序没有应用这个范围，会抽查后改走带范围的搜索
- 多标签搜索、点选常用标签、屏蔽标签 / 画师 / AI 作品、保存搜索方案
- 结果页预览：电脑把鼠标放到缩略图上稍停即可放大；手机长按缩略图（点 ⋯ 或长按标题区仍是菜单）。多图可用按钮、滚轮或左右滑动。按 Esc 先关预览，再按一次退出结果页。预览用的是较大预览图，不是原图，也不会额外请求作品详情；动图目前只显示封面
- 批量下载原图，可打包 ZIP；动图可下原始帧 ZIP 或转 GIF / WebM

「最低收藏数」默认是 **100**，这项在「扫描设置」里，不是「屏蔽与过滤」。折叠标题里也能看到当前范围。

## 开发

```bash
npm install
npm test
```

测试在 jsdom 里跑，不访问真实 Pixiv。

## 许可

[MIT](LICENSE)

结果页预览的交互参考了 [Pixiv Previewer](https://github.com/Ocrosoft/PixivPreviewer) 的使用体验，但代码为独立实现，本仓库不包含其源码。Pixiv Previewer 使用 GPLv3 许可。
