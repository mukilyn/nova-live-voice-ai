// Strands WebGL Effect using OGL
import { Renderer, Program, Mesh, Color, Triangle, RenderTarget } from '/vendor/ogl/index.js';

const MAX_STRANDS = 12;
const MAX_COLORS = 8;

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColors[${MAX_COLORS}];
uniform int uColorCount;
uniform int uStrandCount;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWaviness;
uniform float uThickness;
uniform float uGlow;
uniform float uTaper;
uniform float uSpread;
uniform float uHueShift;
uniform float uIntensity;
uniform float uOpacity;
uniform float uScale;
uniform float uSaturation;

out vec4 fragColor;

const float PI = 3.14159265;

vec3 spectrum(float t) {
  return 0.5 + 0.5 * cos(2.0 * PI * (t + vec3(0.00, 0.33, 0.67)));
}

vec3 samplePalette(float t) {
  t = fract(t);
  float scaled = t * float(uColorCount);
  int idx = int(floor(scaled));
  float blend = fract(scaled);
  int nextIdx = idx + 1;
  if (nextIdx >= uColorCount) nextIdx = 0;
  return mix(uColors[idx], uColors[nextIdx], blend);
}

vec3 strandColor(float t) {
  if (uColorCount > 0) return samplePalette(t);
  return spectrum(t);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  uv /= max(uScale, 0.0001);

  float e = 0.06 + uIntensity * 0.94;
  float env = pow(max(cos(uv.x * PI * 1.3), 0.0), uTaper);

  vec3 col = vec3(0.0);

  for (int i = 0; i < ${MAX_STRANDS}; i++) {
    if (i >= uStrandCount) break;

    float fi = float(i);
    float ph = fi * 1.7 * uSpread;
    float freq = (2.0 + fi * 0.35) * uWaviness;
    float spd = 1.4 + fi * 1.2;

    float tt = uTime * uSpeed;
    float w = sin(uv.x * freq + tt * spd + ph) * 0.60
            + sin(uv.x * freq * 1.1 - tt * spd * 0.7 + ph * 1.7) * 0.40;

    float amp = (0.1 + 0.02 * e) * env * uAmplitude;
    float y = w * amp;

    float d = abs(uv.y - y);
    float thick = (0.001 + 0.05 * e) * (0.35 + env) * uThickness;
    float g = thick / (d + thick * 0.45);
    g = g * g;

    float h = fi / float(uStrandCount) + uv.x * 0.30 + uTime * 0.04 + uHueShift;
    col += strandColor(h) * g * env;
  }

  col *= 0.45 + 0.7 * e;
  col = 1.0 - exp(-col * uGlow);

  float gray = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(gray), col, uSaturation), 0.0);

  float lum = max(max(col.r, col.g), col.b);
  float alpha = clamp(lum, 0.0, 1.0) * uOpacity;

  fragColor = vec4(col * uOpacity, alpha);
}
`;

const GLASS_FRAG = `#version 300 es
precision highp float;

uniform sampler2D uScene;
uniform vec2 uResolution;
uniform float uRadius;
uniform float uRefraction;
uniform float uDispersion;

out vec4 fragColor;

vec2 toUv(vec2 p) {
  return p * (uResolution.y / uResolution) + 0.5;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float d = length(p);
  float r = uRadius;

  float edge = fwidth(d) * 1.5;
  float mask = 1.0 - smoothstep(r - edge, r + edge, d);
  if (mask <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  // sphere height: 0 at the rim, 1 at the center
  float z = sqrt(max(r * r - d * d, 0.0)) / r;
  float nd = d / r; // 0 at the center, 1 at the rim

  // refraction is confined to a narrow band near the rim; the rest stays undistorted
  vec2 dir = d > 0.0 ? p / d : vec2(0.0);
  float lens = smoothstep(0.85, 1.0, nd) * pow(nd, 6.0);
  vec2 offset = -dir * lens * uRefraction * 0.15;
  vec2 disp = -dir * lens * uDispersion * 0.012;

  vec3 light;
  light.r = texture(uScene, toUv(p + offset - disp)).r;
  light.g = texture(uScene, toUv(p + offset)).g;
  light.b = texture(uScene, toUv(p + offset + disp)).b;

  // neutral fresnel rim (no color tint so the glass stays clear)
  float fres = pow(1.0 - z, 3.0);
  vec3 rim = vec3(1.0) * fres * 0.18;

  // specular highlight from the upper-left
  vec2 lightDir = normalize(vec2(-0.55, 0.6));
  float spec = pow(max(dot(p / max(r, 1e-4), lightDir), 0.0), 6.0);
  spec *= smoothstep(r, r * 0.55, d);

  vec3 emissive = light + rim + vec3(spec) * 0.4;
  float emissiveA = clamp(max(max(emissive.r, emissive.g), emissive.b), 0.0, 1.0);

  // almost clear glass body: only a faint neutral darkening, mostly near the rim
  float bodyA = 0.05 + fres * 0.05;

  // composite emissive light over the clear body (premultiplied)
  float outA = emissiveA + bodyA * (1.0 - emissiveA);
  vec3 outRGB = emissive;

  outRGB *= mask;
  outA *= mask;

  fragColor = vec4(outRGB, outA);
}
`;

function buildPalette(colors) {
  const filled = colors && colors.length ? colors : ['#00f2fe', '#7f00ff', '#4facfe'];
  const padded = [];
  for (let i = 0; i < MAX_COLORS; i++) {
    const hex = filled[i] ?? filled[filled.length - 1];
    const c = new Color(hex);
    padded.push([c.r, c.g, c.b]);
  }
  return padded;
}

export function createStrands(container, userOptions = {}) {
  if (!container) return null;

  const defaults = {
    colors: ['#00f2fe', '#7f00ff', '#4facfe', '#f355da'],
    count: 5,
    speed: 0.5,
    amplitude: 1.1,
    waviness: 1.8,
    thickness: 0.65,
    glow: 2.8,
    taper: 2.4,
    spread: 0.9,
    hueShift: 0,
    intensity: 0.45,
    saturation: 1.5,
    opacity: 1,
    scale: 1.4,
    glass: true,
    refraction: 3.0,
    dispersion: 3.85,
    glassSize: 0.48
  };

  const config = { ...defaults, ...userOptions };

  let renderer;
  try {
    renderer = new Renderer({
      alpha: true,
      premultipliedAlpha: true,
      antialias: true
    });
  } catch (err) {
    console.warn('WebGL2 not supported for Strands:', err.message);
    return null;
  }

  const gl = renderer.gl;
  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.canvas.style.backgroundColor = 'transparent';
  gl.canvas.style.width = '100%';
  gl.canvas.style.height = '100%';

  const geometry = new Triangle(gl);
  if (geometry.attributes.uv) {
    delete geometry.attributes.uv;
  }

  const w = container.offsetWidth || 120;
  const h = container.offsetHeight || 120;

  const program = new Program(gl, {
    vertex: VERT,
    fragment: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: [w, h] },
      uColors: { value: buildPalette(config.colors) },
      uColorCount: { value: Math.min(config.colors.length, MAX_COLORS) },
      uStrandCount: { value: Math.min(config.count, MAX_STRANDS) },
      uSpeed: { value: config.speed },
      uAmplitude: { value: config.amplitude },
      uWaviness: { value: config.waviness },
      uThickness: { value: config.thickness },
      uGlow: { value: config.glow },
      uTaper: { value: config.taper },
      uSpread: { value: config.spread },
      uHueShift: { value: config.hueShift },
      uIntensity: { value: config.intensity },
      uOpacity: { value: config.opacity },
      uScale: { value: config.scale },
      uSaturation: { value: config.saturation }
    }
  });

  const mesh = new Mesh(gl, { geometry, program });

  const renderTarget = new RenderTarget(gl, {
    width: w,
    height: h
  });

  const glassProgram = new Program(gl, {
    vertex: VERT,
    fragment: GLASS_FRAG,
    uniforms: {
      uScene: { value: renderTarget.texture },
      uResolution: { value: [w, h] },
      uRadius: { value: 0.46 * config.glassSize },
      uRefraction: { value: config.refraction },
      uDispersion: { value: config.dispersion }
    }
  });

  const glassMesh = new Mesh(gl, { geometry, program: glassProgram });

  container.appendChild(gl.canvas);

  function resize() {
    const width = container.offsetWidth || 120;
    const height = container.offsetHeight || 120;
    renderer.setSize(width, height);
    program.uniforms.uResolution.value = [width, height];
    renderTarget.setSize(width, height);
    glassProgram.uniforms.uResolution.value = [width, height];
  }
  window.addEventListener('resize', resize);
  resize();

  let audioEnergy = 0;
  let animateId = 0;
  function update(t) {
    animateId = requestAnimationFrame(update);

    const time = t * 0.001;
    program.uniforms.uTime.value = time;
    
    // Dynamic audio reactivity modulation
    const targetAmp = config.amplitude + audioEnergy * 0.8;
    const targetIntensity = config.intensity + audioEnergy * 0.6;
    const targetSpeed = config.speed + audioEnergy * 0.5;

    program.uniforms.uAmplitude.value += (targetAmp - program.uniforms.uAmplitude.value) * 0.15;
    program.uniforms.uIntensity.value += (targetIntensity - program.uniforms.uIntensity.value) * 0.15;
    program.uniforms.uSpeed.value += (targetSpeed - program.uniforms.uSpeed.value) * 0.15;

    if (config.glass) {
      renderer.render({ scene: mesh, target: renderTarget });
      glassProgram.uniforms.uScene.value = renderTarget.texture;
      glassProgram.uniforms.uRefraction.value = config.refraction;
      glassProgram.uniforms.uDispersion.value = config.dispersion;
      glassProgram.uniforms.uRadius.value = 0.46 * config.glassSize;
      renderer.render({ scene: glassMesh });
    } else {
      renderer.render({ scene: mesh });
    }
  }
  animateId = requestAnimationFrame(update);

  return {
    setAudioLevel(level) {
      audioEnergy = Math.max(0, Math.min(level, 1));
    },
    setState(state) {
      if (state === 'listening') {
        config.colors = ['#00f2fe', '#00f5a0', '#4facfe'];
        config.speed = 0.9;
        config.intensity = 0.85;
      } else if (state === 'speaking') {
        config.colors = ['#f355da', '#7f00ff', '#00f2fe'];
        config.speed = 1.1;
        config.intensity = 0.95;
      } else if (state === 'thinking') {
        config.colors = ['#ffb300', '#7f00ff', '#f355da'];
        config.speed = 1.4;
        config.intensity = 0.8;
      } else {
        // Idle
        config.colors = ['#00f2fe', '#7f00ff', '#4facfe'];
        config.speed = 0.4;
        config.intensity = 0.45;
      }
      program.uniforms.uColors.value = buildPalette(config.colors);
    },
    destroy() {
      cancelAnimationFrame(animateId);
      window.removeEventListener('resize', resize);
      if (gl.canvas.parentNode === container) {
        container.removeChild(gl.canvas);
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  };
}
