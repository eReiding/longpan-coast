export const OCEAN_FOAM_GLSL = /* glsl */`
float lpwHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float lpwNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(lpwHash(i), lpwHash(i + vec2(1.0, 0.0)), u.x),
    mix(lpwHash(i + vec2(0.0, 1.0)), lpwHash(i + vec2(1.0)), u.x),
    u.y
  );
}

float lpwFbm(vec2 p) {
  return lpwNoise(p) * 0.56 + lpwNoise(p * 2.03 + 7.1) * 0.29 + lpwNoise(p * 4.07 + 17.3) * 0.15;
}

vec4 lpwFoam(vec2 p, float depth, float shoreDistance, float time, float footprint, vec2 wind, float whitecap) {
  float offshore = max(0.0, -shoreDistance);
  float along = p.y;
  vec2 drift = wind * time;
  float warp = lpwFbm(p * 0.047 - drift * 0.011);
  float detail = lpwNoise(p * 0.19 - drift * 0.043 + 11.7);
  float disturbedDepth = max(0.0, depth + (warp - 0.5) * 1.15 + (detail - 0.5) * 0.24);
  float wet = smoothstep(0.035, 0.32, depth);
  float coastLimit = 1.0 - smoothstep(230.0, 370.0, offshore);
  float alongField = lpwFbm(vec2(along * 0.026 - time * 0.021, offshore * 0.010 + 3.7));
  float alongDetail = lpwNoise(vec2(along * 0.115 - time * 0.071, offshore * 0.038 + 9.1));
  float rupture = smoothstep(0.39, 0.67, alongField) * (0.50 + 0.50 * alongDetail);
  float widthNoise = lpwNoise(vec2(along * 0.019 + time * 0.008, 4.6));
  float breakerWidth = mix(0.55, 1.45, widthNoise);

  float localBreak = lpwFbm(vec2(along * 0.17 - time * 0.025, offshore * 0.071));
  float phase = offshore * 0.31 + disturbedDepth * 0.38 + time * 1.16 + warp * 4.5 + (alongField - 0.5) * 5.4 + localBreak * 3.2;
  float front = pow(0.5 + 0.5 * sin(phase), 2.65);
  float breakerEnvelope = smoothstep(0.24, 0.82 * breakerWidth, disturbedDepth) * (1.0 - smoothstep(3.1 * breakerWidth, 6.4 * breakerWidth, disturbedDepth));
  float breaker = breakerEnvelope * (0.05 + 0.95 * front) * mix(0.05, 1.25, rupture);

  float outerField = lpwFbm(vec2(along * 0.021 + time * 0.014 + 17.0, offshore * 0.014 + 1.3));
  float outerRupture = smoothstep(0.32, 0.64, outerField);
  float outerPhase = offshore * 0.125 + disturbedDepth * 0.51 + time * 0.93 + warp * 1.8 + (outerField - 0.5) * 2.6;
  float outerFront = pow(0.5 + 0.5 * sin(outerPhase), 2.15);
  float outerEnvelope = smoothstep(2.4 * breakerWidth, 4.2 * breakerWidth, disturbedDepth) * (1.0 - smoothstep(7.6 * breakerWidth, 12.0 * breakerWidth, disturbedDepth));
  float outerBreaker = outerEnvelope * (0.04 + 0.74 * outerFront) * mix(0.08, 1.15, outerRupture);

  float wash = (1.0 - smoothstep(0.10, 1.45 * breakerWidth, disturbedDepth)) * wet * mix(0.30, 1.0, rupture);
  float nearshore = max(wash * 0.96, max(breaker, outerBreaker)) * coastLimit;
  float caps = smoothstep(0.16, 0.68, whitecap) * smoothstep(2.5, 8.0, depth) * 0.68;
  float amount = clamp(max(nearshore, caps) * (0.84 + 0.32 * detail), 0.0, 1.0);

  float coarseLod = smoothstep(2.0, 8.0, footprint);
  float middleLod = smoothstep(0.35, 2.2, footprint);
  float fineFade = 1.0 - smoothstep(0.12, 0.55, footprint);
  float coarseNear = lpwFbm((p - drift * 0.31) * 0.105 + warp * 0.8);
  float coarseFar = lpwFbm((p - drift * 0.12) * 0.032 + 5.4);
  float coarse = mix(coarseNear, coarseFar, coarseLod);
  float middle = mix(
    lpwNoise((p + drift * 0.14) * 0.47 + 23.1),
    lpwNoise((p + drift * 0.09) * 0.09 + 41.7),
    middleLod
  );
  float bubbles = mix(0.5, lpwNoise((p - drift * 0.52) * 1.85 + middle * 1.7), fineFade);
  float lace = coarse * 0.62 + middle * 0.20 + bubbles * 0.18;
  float coverage = smoothstep(0.69 - amount * 0.43, 0.88 - amount * 0.40, lace + amount * 0.12);
  float poreField = lpwNoise((p - drift * 0.38) * 0.72 + coarse * 2.0);
  poreField = mix(poreField, middle, smoothstep(0.25, 1.2, footprint));
  float porous = mix(0.42, 1.0, smoothstep(0.16, 0.64, poreField));
  coverage *= smoothstep(0.025, 0.16, amount) * porous;
  return vec4(amount, clamp(coverage, 0.0, 0.96), lace, porous);
}
`;
