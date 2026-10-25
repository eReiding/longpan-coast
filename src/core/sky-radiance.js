export const CLOUD_BASE = 850;
export const CLOUD_TOP = 3100;

export function createSkyRadianceUniforms(env) {
  return {
    uLpCloudNoise: env.cloudNoise,
    uLpCloudEnabled: env.cloudEnabled || { value: 1 },
    uLpCloudTime: env.time,
    uLpCloudWind: env.windDirection,
    uLpCloudSun: env.sunDirection,
    uLpCloudSunColor: env.sunColor,
    uLpCloudDaylight: env.daylight,
    uLpSkyTop: env.skyTop,
    uLpSkyHorizon: env.horizonColor,
  };
}

export const SKY_RADIANCE_GLSL = /* glsl */`
uniform highp sampler3D uLpCloudNoise;
uniform float uLpCloudEnabled;
uniform float uLpCloudTime;
uniform vec2 uLpCloudWind;
uniform vec3 uLpCloudSun;
uniform vec3 uLpCloudSunColor;
uniform float uLpCloudDaylight;
uniform vec3 uLpSkyTop;
uniform vec3 uLpSkyHorizon;

#ifndef LP_SKY_REFLECTION_STEPS
#define LP_SKY_REFLECTION_STEPS 3
#endif

vec3 lpSkyBaseRadiance(vec3 rd) {
  float h = max(rd.y, 0.0);
  float horizon = pow(1.0 - h, 4.3);
  float mu = dot(rd, normalize(uLpCloudSun));
  float dusk = (1.0 - smoothstep(0.025, 0.40, uLpCloudSun.y)) * uLpCloudDaylight;
  vec3 horizonColor = mix(uLpSkyHorizon, vec3(0.86, 0.34, 0.14), dusk * 0.76);
  vec3 color = mix(uLpSkyTop * vec3(0.91, 0.97, 1.0), horizonColor, horizon);
  color *= 0.81 + 0.19 * 0.75 * (1.0 + mu * mu);
  float g = 0.76;
  float hg = (1.0 - g * g) / (4.0 * 3.14159265 * pow(max(1.0 + g * g - 2.0 * g * mu, 0.0001), 1.5));
  color += uLpCloudSunColor * hg * (0.013 + horizon * 0.028) * uLpCloudDaylight;
  color += uLpCloudSunColor * smoothstep(0.99993, 0.99997, mu) * 4.5 * smoothstep(0.0, 0.08, uLpCloudSun.y);
  if (rd.y < 0.0) color = mix(color, horizonColor * 0.77, smoothstep(0.0, 0.14, -rd.y));
  return color * mix(vec3(0.017, 0.025, 0.065), vec3(1.0), uLpCloudDaylight);
}

float lpCloudDensity(vec3 p) {
  if (uLpCloudEnabled < 0.5) return 0.0;
  vec2 drift = uLpCloudWind * uLpCloudTime * 1.95;
  vec3 q = p + vec3(drift.x, 0.0, drift.y);
  float evolution = uLpCloudTime * 0.0014;
  float weather = texture(uLpCloudNoise, vec3(q.x * 0.000067, q.z * 0.000067, 0.27 + evolution)).r;
  float clump = texture(uLpCloudNoise, vec3(q.x * 0.000185, q.z * 0.000185, 0.63 - evolution * 0.7)).g;
  float coverage = smoothstep(0.43, 0.70, weather) * smoothstep(0.27, 0.61, clump * 0.72 + weather * 0.28);
  float h = (p.y - ${CLOUD_BASE}.0) / 1700.0;
  float cumulus = 0.0;
  if (coverage > 0.002 && h > -0.03 && h < 1.04) {
    float cloudTop = 0.64 + 0.34 * smoothstep(0.30, 0.72, clump);
    float vertical = smoothstep(-0.015, 0.055, h) * (1.0 - smoothstep(cloudTop - 0.19, cloudTop + 0.015, h));
    vec3 shapeP = vec3(q.x * 0.00054, p.y * 0.00068, q.z * 0.00054);
    float shape = texture(uLpCloudNoise, shapeP + vec3(0.0, evolution * 0.35, 0.0)).r;
    float field = shape * 0.74 + clump * 0.26;
    float threshold = 0.59 - coverage * 0.22;
    float body = smoothstep(threshold, threshold + 0.145, field) * vertical;
    float erosion = texture(uLpCloudNoise, shapeP * 3.17 + vec3(7.3, evolution, 2.9)).g;
    body -= max(erosion - 0.46, 0.0) * mix(0.06, 0.40, clamp(h, 0.0, 1.0)) * smoothstep(0.04, 0.34, h);
    cumulus = clamp(body * 1.75, 0.0, 1.0) * coverage;
  }
  float thinH = (p.y - 2680.0) / 330.0;
  float thinProfile = smoothstep(0.0, 0.24, thinH) * (1.0 - smoothstep(0.52, 1.0, thinH));
  float wisp = texture(uLpCloudNoise, vec3(q.x * 0.00031, p.y * 0.0018 + evolution, q.z * 0.00031)).g;
  float thin = smoothstep(0.61, 0.80, wisp + weather * 0.10) * thinProfile * 0.16;
  return cumulus + thin;
}

vec3 lpCloudReflectionLight(vec3 p, vec3 rd, float density) {
  float h = clamp((p.y - ${CLOUD_BASE}.0) / 1700.0, 0.0, 1.0);
  float mu = max(dot(rd, normalize(uLpCloudSun)), 0.0);
  float silver = pow(mu, 12.0);
  vec3 base = mix(vec3(0.11, 0.16, 0.24), uLpSkyTop * 0.48 + uLpSkyHorizon * 0.24, sqrt(h));
  vec3 light = base * (0.30 + 0.70 * uLpCloudDaylight);
  light += uLpCloudSunColor * uLpCloudDaylight * (0.12 + h * 0.42 + silver * 0.85);
  return light * (0.72 + 0.28 * (1.0 - exp(-density * 3.0)));
}

vec3 lpSkyRadianceWithClouds(vec3 rd) {
  vec3 sky = lpSkyBaseRadiance(rd);
  if (rd.y < 0.012) return sky;
  vec3 sum = vec3(0.0);
  float transmittance = 1.0;
  for (int i = 0; i < 4; i++) {
    if (i >= LP_SKY_REFLECTION_STEPS) break;
    float h = 0.14 + float(i) * 0.235;
    float t = (${CLOUD_BASE}.0 + h * 1700.0 - cameraPosition.y) / max(rd.y, 0.012);
    if (t > 0.0 && t < 24000.0) {
      vec3 p = cameraPosition + rd * t;
      float density = lpCloudDensity(p);
      float alpha = 1.0 - exp(-density * 0.72);
      sum += transmittance * alpha * lpCloudReflectionLight(p, rd, density);
      transmittance *= 1.0 - alpha;
    }
  }
  float distanceFade = smoothstep(0.012, 0.075, rd.y);
  float alpha = (1.0 - transmittance) * distanceFade;
  return sky * transmittance + sum + sky * alpha * (1.0 - distanceFade);
}
`;
