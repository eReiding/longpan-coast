# 模块工程契约 · 第四轮

## 运行与检查

- `npm run dev -- --host 127.0.0.1`：开发页；`npm run build`：必过构建；`npm run preview`：部署版验证。
- `?view=road|entrance|trail|meadow|overlook|valley|reef|sunrise|sunset&time=10.5&t=8&freeze=1&hud=0&debug=1`：可复现机位。默认机位为road。
- `?play=sunset|sunrise&progress=0.5&freeze=1&hud=0`：剧场固定进度；日落相机抬高16m并按事件时刻计算太阳朝向。
- `?aerial=1`：受限斜俯视；`?refraction=0` / `?reflection=0`：水面光学隔离；`debug=1`启用原生GPU计时与录制状态显示。
- `only=water,vegetation,flora,life` / `skip=water`：隔离模块；错误进入engine.errors并显示，不能静默失败。
- 模块返回 `{group,update?(t,dt),stats}`，隔离测试返回 `{position,target,fov}`。
- 截图写 `qa/round4/<view>.png`，浏览器/GPU由导演串行使用。
- 固定1440×900、DPR1检查实际帧率；不能用fit缩放后的分辨率冒充桌面性能。
- 云直接使用主场景的三维raymarch网格，不允许恢复cloudProxy/cloudTarget/renderClouds贴屏代理。叶片必须有UV和aLeaf，UV.x为叶宽方向、UV.y为叶长方向。
- `controls-zoom.js`负责双指、滚轮和受限轨道相机：最大视野锁定cruiseHeight与cruiseDistance，W/S仅水平移动且相机1:1跟随，`aerialPitch`独立控制仰望；`spatial-obstacles.js`负责碰撞索引；`ui/navigation.js`负责SVG地图与可选时钟。

## 第三轮文件所有权

- 导演：`src/main.js`、`src/core/**`（除明确新增的天空共享模块）、`src/terrain.js`、`src/rocks.js`、`src/materials/**`、`src/road.js`、`src/trail.js`、`src/audio.js`、`src/playback.js`、`src/capture.js`、`src/wildlife.js`、数据、文档和发布产物。
- route-ui专家：`src/world/field.js`、`src/controls.js`、`src/ui.js`、`src/style.css`、`index.html`。
- flora专家：`src/flora/**`、`src/vegetation/**`。可以新增独立的地被生成器，不改field；需要新生态接口在报告中请求。
- ocean-sky专家：`src/water/**`、`src/sky.js`，可新增自己独占的 `src/core/sky-radiance.js`。自行完成水体折射pass的封装，由导演在main统一调用。

其他文件不得由非owner修改。共享API和常量需要变化时在最终报告提出；不整体重写他人文件。

## 共享 API

`createField(dem, osm)`：
- `heightAt(x,z)`、`normalAt(x,z)`、`elevationAt(x,z)`、`coastX(z)`、`shoreDistance(x,z)`、`beachAt(x,z)`、`maskAt(x,z)`、`isWalkable(x,z)`。
- `distanceToPath(x,z)`、`ecologyAt(x,z)`、`createShoreData(size)`。
- `config` 含 `origin / paths / road / viewpoints / tidePools / connection`；路线新增字段由route-ui专家维护，flora可读但不能修改。
- `ecologyAt()` 返回 `{height,shore,slope,exposure,shelter,pathDistance,roadDistance,zone}`。
- `createShoreData()` 返回 `{texture,bounds,coastLut,coastRange}`。水体必须使用真实岸线LUT，不允许复制正弦岸线。

`engine`：`{renderer,scene,camera,quality,params,time,env,registry,modules,errors,rng(label),onUpdate(fn)}`。
- env.time/sunDirection/sunColor/windDirection/windStrength/daylight/skyTop/horizonColor为uniform对象。
- `env.cloudNoise` 为共享 `{value:Data3DTexture|null}`，由sky初始化。天空、地面阴影和海水反射使用相同时间和风向。
- `createUI()` 必须返回同一个ui对象；`Object.assign(ui,{controls,sky,post})` 后按钮仍引用同一对象。

## 性能与确定性

- RNG来自 `engine.rng(label)`；动画只用统一t/dt；禁止 `Math.random()` / `Date.now()`。
- 高档总目标 <220 draw calls、约500万三角形（阴影另报）；不得把全部植物实例禁用视锥裁剪后无差别绘制。
- 默认桌面1440×900、DPR1目标30fps以上；GPU昂贵的云和折射采用有界的步数、低分辨率/更新频率，不允许无上限pass。
- 单一可见canvas、单一WebGLRenderer；材质保持线性HDR，不自行tone-map或引入冲突雾效。
- 主场景没有人物；不加载参考照片作为场景材质，不依赖在线服务。

## 模块顺序

`field/controls/UI` → `terrain/road/trail` → `vegetation/flora` → `rocks` → `water` → `sky` → `wildlife/audio/playback/capture` → `post` → 浏览器验收。
模块失败由installModule捕获并显示；主流程不能悄悄跳过错误。

## 交付

每个agent报告：建了什么、文件、签名级API、耗时与资源、已知缺口、跨模块请求。完成前 `npm run build` 通过；自己造成的console/shader error清零。实际视觉、交互与音轨由导演验收，不能只凭Node构建称为完成。
