# 来源与第三方许可

## 本项目与演示图片

最强效果光栅卡是独立的数字光栅卡 / 镭射卡交互实验。默认 `assets/popcat-closed.png`、`assets/popcat-open.png` 为现有 Pop Cat 闭嘴/张嘴梗图，按原字节取自 [popcat.click](https://popcat.click/) 的配对素材，非本项目原创，也非本项目 AI 生成。用户可用自己的照片替换。

素材地址分别为 `https://popcat.click/img/p.1e9d00be.png` 和 `https://popcat.click/img/op.353767c3.png`。本项目保留来源，但不声称公开下载等于开放许可、商用授权或官方联名；下方代码许可不覆盖这些第三方照片。

此声明不向其他 Playground 演示、未知素材、商标或项目自身代码额外授予新的开源许可。以下 MIT 条款仅适用于明确列出的第三方组件。请自行确认上传、保存与分享的个人图片的使用权。

## 柱面透镜与交错印刷条模型

早期 `renderer.js` 的焦平面 / 印刷条采样思路参考并改写自 [Stoatworks Labs Lenticular](https://github.com/stoatworks-labs/lenticular)，固定提交 `570d3d3837574f4634262115f4b0bfd37c15e4da` 的 `source/Lens.h`。技术原理见作者的 [交互指南](https://stoatworks-labs.com/software/lenticular/guide/)。其 MIT 声明继续保留；没有搬运完整插件或 WebGL2 演示站。

当前选图核心已重新实现为圆柱表面求交、空气到塑料的 Snell 折射，以及固定设计观看距离的周期印刷对位。实际实现由 Opus 5.5 直接编写，运行时为本机离线 WebGL1 与 Canvas2D，不调用模型。工作区 `OPTICS.md` 记录虚拟镜片参数、公式、独立测试与近似范围。固定观看距离的印刷对位与重复视区也参考了 [DPL 印前说明](https://dplenticular.com/technology/prepress-process/) 和 [Parallax Printing 的光栅说明](https://parallaxprinting.com/lenticular-printing)；这些说明不是本项目镜片参数的实测来源。

这是视觉近似，不是某一实际 PET 光栅片的标定仿真；不生成照片内部的三维结构。窗光为程序生成的中性环境反射，没有使用第三方实拍作为发布素材。原 MIT 许可全文同样保留在 `renderer.js` 文件头，小工具 ZIP 也包含该声明。

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
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## 镭射参考与材质数据

印墨、刻纹、局部反射分层的思路参考 [Pokebox](https://github.com/selop/pokebox/tree/7f6b1b4b6bb4684f80b49d1318b2a1c90a357b80)，尤其 `src/shaders/flatsilver-reverse.frag`、`special-illustration-rare.frag` 和 `ultra-rare.frag`。Pokebox 代码为 MIT（Copyright 2026 Sergej Lopatkin），但此许可不授予 Pokémon 图像或商标使用权。

本项目没有复制它的卡面、遮罩、颗粒图、蚀刻贴图或完整 shader。512×512 双角度方向 / 周期 / 细粒数据在本机由固定公式一次生成，光照与光谱取样为本项目独立实现（开发中使用 Opus 5.5 复核方案）；不需要模型 API 或外部材质下载。微结构对应的制造尺寸、色谱和照明是视觉近似，未标定某一实物。浏览器降级采用较稀的同源材质采样，不能视为与 GPU 版相同精度。

## GIF 编码器

`vendor/gifenc.js` 来自 [mattdesl/gifenc](https://github.com/mattdesl/gifenc)，固定提交 `4dcb8e023b84824a315cbbf87c0f77c0e4ef93e4`。使用上游 CJS 构建，增加经典脚本包装、去除 source-map URL；完整 MIT 许可也保留在文件头。GIF 的卡片透视、逐帧渲染、取消与进度逻辑由本项目实现，编码在设备本地进行，不需要在线服务。

```text
The MIT License (MIT)
Copyright (c) 2017 Matt DesLauriers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
OR OTHER DEALINGS IN THE SOFTWARE.
```

## pico.js 与正脸检测模型

相机增强使用 Nenad Markus 的 pico.js 检测算法及 facefinder 级联模型，均为 MIT 许可。完整许可也保留在各 vendor 文件头部。

- `vendor/pico.js`：来自 [nenadmarkus/picojs](https://github.com/nenadmarkus/picojs)，固定版本 `afffa50ec4134a47005f2cbf8112eaa69f65f37e`。只对经典脚本闭包和变量声明作适配，保留算法。
- `vendor/face-model.js`：封装来自 [nenadmarkus/pico 的 facefinder 模型](https://github.com/nenadmarkus/pico/blob/c2e81f9d23cc11d1a612fd21e4f9de0921a5d0d9/rnt/cascades/facefinder) 的模型字节，固定版本 `c2e81f9d23cc11d1a612fd21e4f9de0921a5d0d9`。

检测与模型都在本机运行，不调用远程推理服务。这是正脸位置检测，不是眼球追踪或身份识别。

```text
The MIT License

Copyright (c) 2013 Nenad Markus

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
