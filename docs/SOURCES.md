# 参考、数据与许可

## 地貌与地形

- 用户提供的小红书链接：<https://xhslink.cn/o/3uWjeoFJ9cy>，笔记《在垦丁度过一个离太平洋最近的夏天》。用于地貌与构图研究，原素材不进入网页，也不重新发布。2026-10-25 可读取公开笔记文字；`yt-dlp` 无可用视频格式，未绕过访问限制。
- 用户随请求提供的海岸照片：`refs/ref-coast-montage.jpg`，仅内部学习。
- 坐标与地质概览：<https://en.wikipedia.org/wiki/Longpan_Park>。
- 地方地质介绍：<https://www.i-pingtung.com/pingtung/view/%E9%BE%8D%E7%A3%90%E5%85%AC%E5%9C%92>。
- 台湾 20 m DTM 数据说明：<https://data.gov.tw/en/datasets/175239>。本实现没有把粗分辨率 DTM 当作米级真实礁岩。
- 小范围高程：Mapzen / Tilezen Terrain Tiles，AWS Open Data，Terrarium PNG。<https://registry.opendata.aws/terrain-tiles/>。实际瓦片 URL 与解码元数据在 `src/data/elevation.json` 中。
- Terrain Tiles 来源与署名要求：<https://github.com/tilezen/joerd/blob/master/docs/attribution.md>。本区域使用的上游资料署名包括 `SRTM data courtesy of the U.S. Geological Survey`；瓦片还包含 `Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration`。页面 credits 保留 Mapzen/Tilezen、AWS Open Data 与这些来源。

## 第二轮：游线、植被与太阳

- 真实岸线、台26公路、步道与木栈道：OpenStreetMap 官方 API `https://api.openstreetmap.org/api/0.6/map?bbox=120.842,21.918,120.858,21.938`。本地筛选文件 `src/data/osm-coast.json` 保存way id、标签和原始URL。`© OpenStreetMap contributors`，ODbL 1.0：<https://www.openstreetmap.org/copyright>。
- 公路入口、红土步道与海边崩崖：<https://bookmarktrip.com/pingtung-travel/hengchun-longpan-park/>。停车与周边景点介绍：<https://natsuphil.com/pingdong/dragon-park/>，内部参考图 `refs/public-overlook.jpg`、`refs/public-grassland.jpg`。
- 龙磐官方景观与日出说明：<https://www.dbnsa.gov.tw/zh-TW/attraction/articles?a=233>。
- 垦丁海岸植物带：<https://www.kt.com.tw/%E5%A2%BE%E4%B8%81%E5%B0%8E%E8%A6%BD>。马鞍藤/海埔姜为草本带，林投/草海桐为低矮防风灌丛，白水木/黄槿可作为小乔木。恒春琼麻：<https://www.dbnsa.gov.tw/zh-tw/attraction/articles?a=224>。
- 海鸟形态参考：黑尾鸥 <https://zh.wikipedia.org/wiki/%E9%BB%91%E5%B0%BE%E9%B8%A5>；场景不声称是精确物种导览。
- 太阳动画以纬度、经度、时区和日期的赤纬/均时差计算：朝东为太平洋日出，朝西为内陆日落，不把海上落日当作当地实景。

## 程序技术参考

- Three.js，MIT：<https://github.com/mrdoob/three>。
- Athenaion，MIT，Copyright (c) 2026 Leon Lin：<https://github.com/Leonxlnx/athenaion>。参考 FFT 波谱、材质 hooks、植被与后期设计。凡实质复用源码均保留其 MIT 许可；见 `public/THIRD_PARTY_NOTICES.txt`。
- `tools/colorstats.mjs`、`satstats.mjs`、`crop.mjs`、`sample.mjs` 来自同一 MIT 工具链，供像素统计验收。
- 程序噪声含 Ashima / webgl-noise 的 Simplex 实现，MIT：<https://github.com/ashima/webgl-noise/blob/master/LICENSE>。完整许可随静态站一起发布。
- 用户提供的 `ocean-surface-effects.zip`：第三轮用于FFT位移/导数一致性、Fresnel、GGX、Snell折射、光程吸收和距离过滤的技术参考。其原生WebGPU/WGSL自研引擎未直接加入Three.js运行时；参考摘录存于 `refs/ocean-surface-effects/`，附原许可与来源说明。

## 运行时素材

所有可见地形、植物、动物、纹理与水体均在本地代码生成；主场景不创建人物。不加载 Poly Haven 贴图、Rocketbox 角色、卫星照片或原参考图作为场景材质。运行不需要 API key、登录或第三方在线请求。
