# 接入独立光栅引擎

## 文件与默认状态

以经典脚本加载 `assets/template/renderer.js`。它向 `window` 暴露 `TiltRenderer`，不依赖小红书、React、相机或网络。模板的 `card.js` 是交互示例，不是引擎依赖。

```js
const state = {t: -1, y: 0, mode: 'lenticular', flipRange: 1, viewRepeats: 1, foil: 0.35};
const renderer = new TiltRenderer(host, {
  onChange: function () { requestDraw(); }
});
renderer.setImage('a', croppedA);
renderer.setImage('b', croppedB);
```

`host` 必须有布局宽度；不要在 `display:none` 节点内测量后永久沿用默认值。回调可能在构造过程中触发，`requestDraw()` 应延后到动画帧，并检查实例已经赋值。

## 参数

| 字段 | 范围 / 默认 | 含义 |
| --- | --- | --- |
| `t` | −1…1 | 水平姿态，对应 −22°…22° |
| `y` | −1…1 | 俯仰输入，CSS X 旋转为 `−14 × y` 度 |
| `viewRepeats` | 1 / 2 / 3，默认 1 | 配准周期内 A/B 重复组数；后续换面约 28° / 15° / 10°，不是严格恒定角度 |
| `flipRange` | 0…1，默认 1 | 印刷边缘采样半宽从 0.015p 到 0.056p；越大，单次换面越柔和 |
| `mode` | `lenticular` | 双图光栅；引擎也保留独立 `foil` 模式，不是光栅的必需层 |
| `foil` | 0…1 | 仅对 `foil` 生效；光栅不要叠加彩虹代替折光 |

缩短换面间隔不意味着增加手势灵敏度。重复组数为 2/3 时，±22° 不一定对应最干净的 A/B 视区，不要把左右端点硬标成 A/B。

## 画面与姿态共用坐标

```js
function draw() {
  const width = host.clientWidth;
  if (width <= 0) return;
  renderer.resize(width, width * 4 / 3);
  const p = TiltRenderer.pose(state);
  support.style.perspective = p.perspective + 'px'; // 1500px
  card.style.transform = 'rotateX(' + p.rx + 'deg) rotateY(' + p.ry + 'deg)';
  renderer.render(state);
}
```

实际接入时仅在布局宽度改变时 `resize`，不要每帧重设画布；上例将依赖写在一起便于理解。禁止把截图宽度、canvas.width 或 DPR 当布局宽度：引擎以 `1500 / CSS宽度` 求相对眼距。

保持模板 3:4 盒子、旋转顺序和原点。透视设在父容器。前层 `translateZ(1.1px)`、后层 `translateZ(-1.1px)` 与独立软影只负责实体薄片外观，不参与 A/B 选图。

## 先裁切，再送入引擎

引擎不会自行判断主体位置。将图片 cover-crop 到 768×1024（或同为 3:4 的画布）：

```js
const out = document.createElement('canvas');
out.width = 768; out.height = 1024;
const scale = Math.max(out.width / image.naturalWidth, out.height / image.naturalHeight);
const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
out.getContext('2d').drawImage(image, (out.width-w)/2, (out.height-h)/2, w, h);
renderer.setImage('a', out);
```

需要定位人物时由宿主加裁切控件，不在 shader 中针对人物或样图写阈值。远端图片必须满足同源/CORS，否则 WebGL 纹理和截图可能被限制；本地文件与页面生成的 Canvas 不需要上传。异步换图要忽略过期请求，失败保留可用照片，并释放 object URL。

## 捕获与生命周期

- `renderer.snapshot(state, width)` 返回 3:4 卡面 Canvas，宽度最多 1024。不带 DOM 的透视、背板、地面阴影，不等于完整屏幕截图。
- `renderer.getInfo()` 返回 backend、画布尺寸、lenses、distance 等状态。`canvas2d` 是低精度回退，不报告成完整 GPU 质量。
- 裸引擎没有公共 `destroy()`。模板的 `LenticularDemo.destroy()` 是宿主生命周期包装。接入 SPA 时停止监听、RAF、URL 与 GPU 资源，不能假设 `TiltRenderer.destroy()` 存在。
- 保留可中断、可逆的手动操作。空闲时不必循环 RAF；页面隐藏时暂停，恢复后重绘。减弱动态偏好可以取消自动播放，但不要只关闭 CSS 转动而让光学输入继续假装转动。
- 可包装 React/Vue 或移植 shader。先跑数值检查和相同姿态的像素对照，再改外观；不要将约 28° 写成某款镜片的标称参数。

模板的 `window.LenticularDemo` 提供 `setPose(t,y)`、`setOptions({viewRepeats,flipRange})`、异步 `setImages(aUrl,bUrl)`、`getState()`、`snapshot(width)`、`destroy()`。这是模板接口，裸引擎仍按上面的实例 API 接入。

`setImages` 成对提交照片：新请求取代旧请求时，旧 Promise 以 `AbortError` 结束；解码失败不替换现有照片。模板只接受本地 file/data/blob 或同源 HTTP(S) 图片，跨域图片需宿主另外处理。`snapshot` 默认宽 768，要求 1…1024，加载中或页面隐藏时不捕获。姿态与参数会限制在合法范围内，非有限数字会报错。
