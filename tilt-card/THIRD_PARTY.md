# 来源与第三方许可

## 本项目与演示图片

转转卡是独立的数字光栅卡 / 镭射卡交互实验。默认 `assets/day.jpg`、`assets/night.jpg` 是为本示例生成的 AI 图像，并非实拍；日夜图使用一致构图展示换面效果。页面明确标识 AI 样例，用户可用自己的照片替换。

此声明不向其他 Playground 演示、未知素材、商标或项目自身代码额外授予新的开源许可。以下 MIT 条款仅适用于明确列出的第三方组件。请自行确认上传、保存与分享的个人图片的使用权。

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
