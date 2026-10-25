# 龍磐 · 風入海岬 / Longpan Coast

以台湾垦丁龙磐公园为参考的可漫游海岸。Three.js + WebGL2 + Vite，真实 OSM 岸线/道路/步道、公开 DEM、FFT 海浪、翻卷碎浪、体积云与云影、本地植物、海鸟和潮池生态。**主场景没有人物模型**，支持第一人称与无人物第三观景。

这是依据公开地形、道路与照片进行的视觉重建，不是测绘、导航或工程施工模型。

## 运行

需要 Node.js 22.12+（或满足 Vite 7 的 20.19+）。

```bash
npm install
npm run dev
```

默认打开 `http://127.0.0.1:5173/`。

```bash
npm run build
npm run preview
```

`dist/` 可直接静态部署，`base: './'` 支持子目录。请使用 HTTP 服务，不要通过 `file://` 双击页面。未指定托管平台前不自动公开发布。

## 游线与操作

- 默认从台26公路附近开始，无标题开场和大型HUD；`H` 展开/收起完整工具。左上角圆形地图显示真实路线、目的地、当前位置与朝向。
- 地图右上角按钮切换地图/24小时时钟；点击或拖动表盘选时，方向键也可调整。时钟与太阳、天空和剧场共用时间，调时不改变相机视角。
- `W A S D` / 方向键：约 9 m/s；`Shift`：约 22.5 m/s。低帧率下按真实经过时间移动，并使用小步长碰撞。
- 鼠标拖动：环顾，灵敏度可调整。双指向内为拉远、向外为放大；触控板捏合与滚轮采用一致的缩放方向，速度已提高。
- `B`：切换斜俯视/返回；拉远时连续抬升并转向完整游线，最大高度根据精细建模范围限制。到达最大视野后同时锁定巡航高度和相机距离，W/S与相机按1:1水平位移前进/后退，W为60m/s、`Shift`为120m/s；手动移动会接管旧导览或剧场。鼠标上滑改为仰望真实天空，不继续升高。返回地面后恢复碰撞。主动进入俯瞰时根据当时太阳方位构图，之后调整时间只更新光照，不重新对准。
- `V`：第一人称 / 无人物第三观景；`M`：目的地列表；`G`：下一景点。
- `F`：从最近路段加入连续游线，约 18 m/s；再次按 `F` 或拖动画面停止。
- `P` 或双击画面：第一人称 Pointer Lock；`Esc` 退出。拒绝或不支持时仍可拖动。
- `R`：开始/停止实时录屏，录制按钮在展开的工具中。

完整游线约1.68km：台26公路 → 木栈道/公园入口 → OSM连接步道 → 海岸步道 → 高位左岸 → 下岸 → 潮池。最后下岸连接段按可通过地形生成，不冒充额外的OSM道路。目的地仍包括小径、台地、谷地、日出和日落等观察点。

可以走到水边，但深水、潮池和真正陡崖不能进入。大型露头和高大植株参与碰撞，植被按冠幅留出让步空间；空间哈希用于加速碰撞查询。小屏幕提供触摸方向键和拖动观察。推荐现代桌面 Chrome / Edge；需要支持 HalfFloat HDR 的 WebGL2。当前后端不是 WebGPU。

## 太阳与剧场

- 时刻滑块：改变太阳、天空、阴影和海面；“昼夜”：约 48 分钟完成一次循环，默认关闭。
- 点击 **“剧场”**：
  - **海上日出**：面向东方的太平洋，太阳从海平面方向升起。
  - **内陆日落**：面向西侧内陆，太阳向真实日落方向下降，不把海上落日当成龙磐实景。
- 两条时间轴默认约 90 秒，支持播放、暂停、重播、进度拖动和退出。退出后恢复之前的机位与时刻。
- 太阳由 `src/core/solar.js` 按纬度、经度、时区和日期计算。可用 `day=<1..365>` 改变年内日期。

## 声景与实时录屏

- 点击 **“声景”** 才会开启声音，不会自动播放。包含程序生成的浪涌、碎浪泡沫和阵风，音量随岸距和暴露程度变化。
- `R` 或“录屏”使用 `canvas.captureStream(60)` + MediaRecorder，优先 VP9，回退 VP8，输出 `.webm`。
- 声景开启时，录制流混入 **Opus 音轨**；静音时仅录视频。连续录制共享同一声景，不会关闭用户的音频上下文。
- 录屏是实时捕获，不是离线逐帧渲染，帧率取决于窗口分辨率、GPU 和画质。录制不包含麦克风或系统声音。

## 地形与 CAD

信息面板的“导出局部地形 OBJ”生成观察点周围约 220 m、2 m 网格的 OBJ，含法线。可导入 Blender 或支持 OBJ 的 CAD/DCC 工具。

```bash
npm run terrain:export
```

该命令使用与网站相同的 `field.heightAt()` 和真实 OSM 数据，输出 `exports/longpan-terrain-220m.obj`。当前示例为 **12,321 顶点、24,200 三角面**，已通过 Blender 5.1.2 实际导入。

OBJ 只含地形高度场，不含独立礁板、植物或动物，不是工程施工图。坐标为 +X 东、+Y 上、+Z 南，原点对应公开公园坐标。

## 数据更新

```bash
npm run terrain:update   # 公开 DEM Terrarium tiles
npm run geo:update       # OSM 岸线、道路与步道
```

输出分别位于 `src/data/elevation.json`、`src/data/osm-coast.json`。运行时全部使用本地 JSON，不需要 API key、在线地图或外部模型/照片。OSM 署名和 ODbL 说明随 `dist/THIRD_PARTY_NOTICES.txt` 一起部署。

## 可复现检查

```text
?view=entrance&time=10.5&t=8&freeze=1&hud=0
?view=overlook&time=10.5&t=8&freeze=1&debug=1
?view=trail&time=10.5&hud=0
?view=reef&time=10.5&t=8&freeze=1
?play=sunset&progress=0.5&freeze=1&hud=0
```

- `view=entrance|road|trail|meadow|overlook|valley|reef|sunrise|sunset`：目的地。
- `mode=third`：无人物第三观景，默认第一人称。
- `time=10.5`：时刻；`t=8`：动画时间；`freeze=1`：冻结动画，仍可控制相机。
- `play=sunset|sunrise`：进入剧场；`progress=0..1`：进度，`freeze=1`时暂停在该进度。日落剧场使用高位相机，避免近坡挡住太阳。
- `hud=0`：隐藏界面；`debug=1`：FPS、canvas/CSS 尺寸、GPU耗时、draw calls、三角形、相机、录制状态与错误数。普通游玩不执行GPU计时查询。
- `quality=low|high`：初始画质。运行时切换更新渲染器、后期分辨率、阴影和云步进；密度、FFT 尺寸及网格规模在构建时确定，完全降档请带参数重新载入。
- `aerial=1`：以受限斜俯视打开；`clouds=0`：诊断用关闭云及云影。云层直接在世界空间进行体积计算，不使用贴屏云代理或 `cloudScale`。
- `only=water,vegetation,flora,life` / `skip=water`：模块隔离。可选模块失败会显示诊断，不让其它模块静默失败。
- `refraction=0` / `reflection=0`：关闭对应水面光学；`waterDebug=normal|foam|refraction|depth|reflection`：隔离检查法线、泡沫、折射、深度和反射。

## 主要模块

- `src/world/`：地理投影、真实岸线、DEM、连续游线、生态遮罩和潮池。
- `src/road.js` / `src/trail.js`：台26公路、导览牌、红土小径、下岸连接与木栈道。
- `src/terrain.js` / `src/rocks.js`：加密台地网格、崩崖、石灰岩露头、湿礁和溶蚀材质。
- `src/water/`：Phillips FFT、动态天空反射、GGX高光、Snell折射、光程吸收、真实岸线碎浪和飞沫。
- `src/controls.js` / `src/controls-zoom.js`：步行、双指缩放、受限斜俯视与空间碰撞索引。
- `src/ui/navigation.js`：SVG圆形地图、位置朝向和可拖动选时的24小时时钟，不增加canvas。
- `src/sky.js` / `src/core/sky-radiance.js`：128³体积噪声、主场景世界空间raymarch云、共享云辐射与云影，不使用贴屏云代理。
- `src/vegetation/` / `src/flora/`：本地海岸植物、连续低灌丛片层、空间分块、视锥剔除、LOD与风场。
- `src/wildlife.js`：黑尾鸥/燕鸥的滑翔与俯冲、潮池鱼、蟹与远海鲸影。动物为氛围设计，不是精确物种导览。
- `src/audio.js`：程序浪涌与风声。
- `src/playback.js`：日出/日落时间轴与高位剧场机位。
- `src/core/post.js`：HalfFloat HDR、局部高光 bloom、FXAA、AgX 与 sRGB。

整个页面只有一个可见 `<canvas>` 和一个 WebGLRenderer。纹理、植物、动物与场景均在本地代码生成，不用照片背景。近岸水面沿真实岸线加密，远海与近岸共用同一FFT波面。

## 验证与视觉边界

- `npm run build` 通过，部署版 HTML、JS、CSS、数据与许可文件通过 HTTP 检查。
- 第一/第三视角、默认无大HUD、连续路线、鼠标拖动和水边碰撞均经过实际检查。
- 在1440×900、DPR1、Apple M5 Pro的浏览器中，稳定机位的可见页面曾测得约40–80fps；移动、云层和录制开销会改变帧率，后台节流读数不作为性能结论。
- `debug=1`可用原生GPU计时查询比较效果；启动编译、缓冲分配和稳定运行的耗时分别判断。
- 剧场内连续两次录制已验证：1440×900 VP9视频、48kHz双声道Opus，实际视频帧与非静音音频均存在。
- 地形 OBJ 已重新通过 Blender 5.1.2 实际导入：12,321顶点、24,200三角面。
- 本地 `qa/round4/` 保存本轮入口、俯瞰、叶片与海岸真实截图；`qa/round3/`保留上一轮对照。像素工具：`colorstats.mjs`、`satstats.mjs`、`crop.mjs`、`sample.mjs`。`qa/` 属于本地验收输出，不随公开发布包上传。

本项目是持续收敛的程序化视觉重建，不宣称与实拍无法区分。近景植物形态、云的自然程度和海岸材质仍有继续精修空间。帧率取决于分辨率、机位、GPU和画质，不能把后台节流或缩小面板后的读数冒充桌面性能。
