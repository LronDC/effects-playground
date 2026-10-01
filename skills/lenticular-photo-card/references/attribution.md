# 来源与边界

这个 Skill 从「最强效果光栅卡」提取可复用核心，不携带小红书 SDK、相机识别、GIF 编码器、账号信息或用户照片。模板的 A/B 校准图由本地 Canvas 绘制，明确作为检查图案，不冒充照片或光栅实拍。

## 引擎

本次分发的 `renderer.js` 修正了响应式场景的观看距离：布局缩放不再改变相对眼距，已认可的342px桌面基准保持。圆柱面求交、折射、固定印刷配准与shader没有改写。当前引擎SHA-256：

```text
a6ade7a4299461d6e4d9a142798f8fcdaa6b868c8040719c4f13714dd1f270a1
```

早期焦平面取样参考并改写自 [Stoatworks Labs Lenticular](https://github.com/stoatworks-labs/lenticular) 的 `source/Lens.h`，固定提交 `570d3d3837574f4634262115f4b0bfd37c15e4da`。现有核心使用圆柱表面求交、Snell 折射和固定观距的周期印刷配准；保留源文件 MIT 声明。[原项目交互说明](https://stoatworks-labs.com/software/lenticular/guide/) 可供对照。

配准和视区的背景资料包括 [DPL 印前说明](https://dplenticular.com/technology/prepress-process/) 与 [Parallax Printing 光栅说明](https://parallaxprinting.com/lenticular-printing)。本实现的虚拟参数不是这些厂商片材的测量数据。

引擎保留独立镭射分支，以维持验证过的核心。印墨、刻纹、局部反射分层参考 [Pokebox](https://github.com/selop/pokebox/tree/7f6b1b4b6bb4684f80b49d1318b2a1c90a357b80)；未附带宝可梦图像、遮罩、刻纹图或商标资产。内部微结构纹理由确定性公式生成。

## 保留的第三方许可

以下声明同时位于 `assets/template/renderer.js` 文件头，不替其它图像、商标或未标明资源授予许可；本次分享不新增整个 Playground 的许可承诺。

```text
MIT License
Copyright (c) 2026 Stoatworks Labs
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
