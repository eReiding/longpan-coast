import { proceduralMaterial, BUMP_GLSL } from '../core/materials.js';

export function createGroundMaterial(options = {}) {
  return proceduralMaterial({
    env: options.env,
    clouds: Boolean(options.env),
    params: { color: 0xffffff, roughness: 0.94, metalness: 0 },
    vertexHead: 'attribute vec4 aTerrain; varying vec4 vTerrain;',
    vertexPre: 'vTerrain=aTerrain;',
    head: /* glsl */`
      varying vec4 vTerrain;
      ${BUMP_GLSL}
      float gHeight;
      float gWet;
    `,
    color: /* glsl */`
      vec3 p=cgP;
      float footprint=max(length(fwidth(p)),0.001);
      float macro=cgSnoise(vec3(p.x*0.019,1.7,p.z*0.019));
      float vegetationPatch=cgSnoise(vec3(p.x*0.065,8.1,p.z*0.065));
      float fine=cgSnoise(p*1.7)*(1.0-smoothstep(0.03,0.2,footprint));
      vec3 grass=mix(vec3(0.020,0.036,0.012),vec3(0.050,0.076,0.022),smoothstep(-0.55,0.65,macro));
      grass=mix(grass,vec3(0.018,0.028,0.011),smoothstep(0.02,0.7,vegetationPatch)*0.6);
      float straw=smoothstep(0.25,0.74,cgSnoise(vec3(p.x*0.047,3.8,p.z*0.047)))*0.22;
      grass=mix(grass,vec3(0.165,0.140,0.081),straw);
      float litter=smoothstep(0.20,0.65,cgSnoise(p*vec3(2.1,0.4,2.1)));
      float grit=smoothstep(0.28,0.72,cgSnoise(p*17.0));
      grass*=0.86+fine*0.17+litter*0.12+grit*0.06;
      grass=mix(grass,vec3(0.120,0.098,0.065),litter*0.10);
      vec3 soil=mix(vec3(0.105,0.072,0.043),vec3(0.225,0.162,0.094),macro*0.5+0.5);
      soil*=0.87+grit*0.18+cgSnoise(p*6.3)*0.10;
      vec3 rock=mix(vec3(0.040,0.047,0.052),vec3(0.115,0.125,0.128),cgSnoise(p*0.42)*0.5+0.5);
      float strata=sin(p.y*9.0+cgSnoise(p*0.23)*2.5);
      rock*=0.86+0.14*smoothstep(-0.4,0.6,strata);
      float pits=smoothstep(0.24,0.67,cgSnoise(p*3.9));
      rock*=1.0-pits*0.31*(1.0-smoothstep(0.04,0.18,footprint));
      vec3 sand=vec3(0.57,0.48,0.325)*(0.94+0.10*fine);
      float r=${options.rock ? '1.0' : 'clamp(vTerrain.y+smoothstep(0.36,0.77,vegetationPatch)*0.17,0.0,1.0)'};
      float fissure=0.0;
      if(r>0.25){
        vec3 joint=cgVoronoi2(p.xz*0.78+vec2(p.y*0.31,p.y*0.13));
        fissure=(1.0-smoothstep(0.004,0.022,joint.y-joint.x))*smoothstep(0.72,0.92,joint.z);
        fissure*=mix(0.16,1.0,smoothstep(0.10,0.55,1.0-abs(cgN.y)));
        rock*=1.0-fissure*0.28;
      }
      vec3 c=mix(grass,soil,vTerrain.z*0.85);
      c=mix(c,rock,r);
      c=mix(c,sand,vTerrain.x);
      gWet=(1.0-smoothstep(0.30,${options.rock ? '4.2' : '3.4'},p.y+cgSnoise(p*0.7)*0.15));
      vec3 wetTint=${options.rock ? 'vec3(0.24,0.30,0.275)' : 'vec3(0.36,0.43,0.40)'};
      c=mix(c,c*wetTint,gWet);
      c=mix(c,vec3(0.035,0.065,0.041),gWet*smoothstep(0.2,0.8,macro)*0.35);
      diffuseColor.rgb=c;
      float bumpDetail=1.0-smoothstep(0.03,0.24,footprint);
      gHeight=(cgSnoise(p*3.5)*0.035+cgSnoise(p*13.0)*0.007-fissure*0.05)*bumpDetail;
      gHeight+=strata*0.018*r;
    `,
    roughness: 'roughnessFactor=mix(0.94,0.34,gWet);',
    normal: 'cgBump=cgBumpField(cgP,cgN,gHeight)-cgN;',
    ao: 'cgAO=0.91+0.09*cgN.y;',
  });
}
