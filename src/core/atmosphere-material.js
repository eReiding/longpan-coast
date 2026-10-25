import * as THREE from 'three';

// Analytic Rayleigh/Mie atmosphere with exponential air mass, in linear HDR.
// Physical lighting is sampled from the Preetham environment separately.
export function createAtmosphereMaterial(engine) {
  const { env } = engine;
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      sunPosition: { value: env.sunDirection.value.clone() },
      time: env.time,
      turbidity: { value: 3.3 }, rayleigh: { value: 2.1 },
      mieCoefficient: { value: 0.003 }, mieDirectionalG: { value: 0.78 },
      uZenith: env.skyTop,
      uHaze: env.horizonColor,
      uSunColor: env.sunColor, uDaylight: env.daylight,
      uRadiance: { value: Number(engine.params.get('skyRadiance') || 1) },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorldPosition;
      void main(){
        vWorldPosition=(modelMatrix*vec4(position,1.0)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        gl_Position.z=gl_Position.w;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vWorldPosition;
      uniform vec3 sunPosition;
      uniform vec3 uZenith;
      uniform vec3 uHaze;
      uniform vec3 uSunColor;
      uniform float uDaylight;
      uniform float uRadiance;
      float hg(float mu,float g){
        float g2=g*g;
        return (1.0-g2)/(4.0*3.14159265*pow(max(1.0+g2-2.0*g*mu,0.0001),1.5));
      }
      void main(){
        vec3 d=normalize(vWorldPosition-cameraPosition);
        float h=max(d.y,0.0);
        float zenithAngle=acos(h)*57.2957795;
        float airMass=1.0/(h+0.15*pow(93.885-zenithAngle,-1.253));
        vec3 extinction=exp(-vec3(5.8,13.5,33.1)*airMass*0.025);
        float horizon=pow(1.0-h,4.3);
        float mu=dot(d,normalize(sunPosition));
        float rayPhase=0.75*(1.0+mu*mu);
        float dusk=(1.0-smoothstep(0.025,0.40,sunPosition.y))*uDaylight;
        vec3 horizonColor=mix(uHaze,vec3(0.86,0.34,0.14),dusk*0.76);
        vec3 c=mix(uZenith*vec3(0.91,0.97,1.0),horizonColor,horizon);
        c*=(0.81+0.19*rayPhase)*mix(vec3(1.0),extinction,0.14);
        c+=uSunColor*hg(mu,0.76)*(0.013+horizon*0.028)*uDaylight;
        float disc=smoothstep(0.99993,0.99997,mu);
        c+=uSunColor*disc*4.5*smoothstep(0.0,0.08,sunPosition.y);
        if(d.y<0.0)c=mix(c,horizonColor*0.77,smoothstep(0.0,0.14,-d.y));
        c*=mix(vec3(0.017,0.025,0.065),vec3(1.0),uDaylight);
        gl_FragColor=vec4(c*uRadiance,1.0);
      }
    `,
  });
}
