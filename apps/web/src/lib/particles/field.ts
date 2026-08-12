// The particle field itself (frontend guide 3.3), on raw WebGL2 with no library
// at all: this is one point-cloud draw call and needs neither a scene graph nor
// `ogl`'s 4 kB, and guide 7 asks any new dependency to justify its bundle cost.
//
// The engineering rules the guide calls non-negotiable, and where each lives:
//
// 1. Content never waits for it. The component mounts this after paint and the
//    canvas sits behind the hero with pointer-events: none.
// 2. All simulation is in the vertex shader. Per frame this file sets two
//    uniforms and issues one drawArrays; there is no JavaScript loop over
//    particles anywhere, at any point after init.
// 3. Budget and capability: the count is capped by pixel density and viewport
//    (shape.ts), and a context that does not exist is a null return, which the
//    component answers with the still.
// 4. prefers-reduced-motion never reaches here: the component renders the still
//    instead of mounting this at all.
// 5. Pausing is the caller's, driven by IntersectionObserver and
//    visibilitychange; `stop()` cancels the frame loop outright rather than
//    running an idle one.
//
// The shader is the one piece of this codebase guide 7 says nobody edits
// casually.
import { particleCount, resolvedShape } from "./shape";

const VERTEX_SHADER = `#version 300 es
precision highp float;

// Per particle, uploaded once and never touched again.
in vec2 aTarget;   // where this point sits in the resolved shape
in vec3 aSeed;     // three decorrelated randoms: drift phase, radius, size

uniform float uTime;     // seconds
uniform float uResolve;  // 0 ambient scatter, 1 fully resolved
uniform float uAspect;
uniform float uOnPaper;  // 1 dark ink on paper, 0 light ink on dark ground

out float vAlpha;

void main() {
  // Ambient drift: a slow Lissajous per particle, phased by its own seed so the
  // cloud breathes rather than pulsing in unison.
  float phase = aSeed.x * 6.2831853;
  float speed = 0.08 + aSeed.y * 0.10;
  float radius = 0.55 + aSeed.z * 0.45;
  vec2 scatter = vec2(
    cos(uTime * speed + phase) * radius,
    sin(uTime * speed * 0.7 + phase * 1.7) * radius * 0.55 - 0.15
  );

  // Resolve eases per particle, the seed staggering arrival so the shape forms
  // like a settling rather than a snap.
  float stagger = clamp(uResolve * 1.35 - aSeed.y * 0.35, 0.0, 1.0);
  float eased = stagger * stagger * (3.0 - 2.0 * stagger);

  vec2 pos = mix(scatter, aTarget, eased);
  pos.x /= max(uAspect, 0.0001);

  gl_Position = vec4(pos, 0.0, 1.0);
  // Light-on-dark at 1 px reads as a stipple; dark-on-paper at the same size
  // and 0.18 alpha vanishes, so paper gets larger, more opaque graphite marks.
  // Dark mode is the mix(..., 0.0) side and is left alone.
  float size = 1.0 + aSeed.z * 1.6;
  gl_PointSize = mix(size, size * 3.0, uOnPaper);
  vAlpha = mix(0.18 + eased * 0.30, 0.55 + eased * 0.28, uOnPaper);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in float vAlpha;
uniform vec3 uInk;
out vec4 outColour;

void main() {
  // Round points with a soft edge; a square point reads as a glitch.
  vec2 d = gl_PointCoord - vec2(0.5);
  float mask = 1.0 - smoothstep(0.35, 0.5, length(d));
  if (mask <= 0.0) discard;
  outColour = vec4(uInk, vAlpha * mask);
}
`;

export interface Field {
  start(): void;
  stop(): void;
  destroy(): void;
  readonly running: boolean;
}

export interface FieldOptions {
  // The ink colour as three 0..1 channels, read from the token layer by the
  // caller so the field follows the theme rather than pinning its own colour.
  ink: [number, number, number];
  // Injectable so the resolve timeline is driven deterministically in a test.
  now?: () => number;
}

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

// Whether this ink is sitting on paper (light theme) rather than on the dark
// ground. Relative luminance, same weights as WCAG, so a theme that inverts
// ink flips this with it. Pure, so the paper-side weight is asserted without
// a GPU.
export function inkOnPaper(ink: [number, number, number]): boolean {
  return 0.2126 * ink[0] + 0.7152 * ink[1] + 0.0722 * ink[2] < 0.5;
}

// The resolve timeline of guide 3.3: drift, resolve briefly into structure,
// then relax back to ambient motion and stay there. Pure, so the shape of the
// moment is asserted without a GPU.
export function resolveAt(elapsedSeconds: number): number {
  const delay = 0.35;
  const rise = 1.2;
  const hold = 1.6;
  const fall = 2.4;
  const t = elapsedSeconds - delay;
  if (t <= 0) return 0;
  if (t < rise) return t / rise;
  if (t < rise + hold) return 1;
  if (t < rise + hold + fall) return 1 - (t - rise - hold) / fall;
  return 0;
}

// Build the field, or return null when this device cannot run it: a missing
// WebGL2 context, a failed compile, or a lost program all answer the same way,
// because the caller's response to every one of them is the same still image.
export function createField(
  canvas: HTMLCanvasElement,
  options: FieldOptions,
): Field | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    // The field is decoration behind text; preserving the buffer would cost
    // memory bandwidth for nothing.
    preserveDrawingBuffer: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  gl.useProgram(program);

  const dpr = Math.min(globalThis.devicePixelRatio ?? 1, 2);
  const count = particleCount(dpr, canvas.clientWidth || 1_024);

  // Both buffers are written once here and never again: this is the whole
  // reason the per-frame cost is one draw call.
  const targets = resolvedShape(count);
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    // Deterministic, like the shape: a hero that differs run to run cannot be
    // regression-tested and gains nothing.
    seeds[i * 3] = ((i * 0.618_033_988_75) % 1 + 1) % 1;
    seeds[i * 3 + 1] = ((i * 0.381_966_011_25) % 1 + 1) % 1;
    seeds[i * 3 + 2] = ((i * 0.754_877_666_25) % 1 + 1) % 1;
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const targetBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, targetBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, targets, gl.STATIC_DRAW);
  const targetLocation = gl.getAttribLocation(program, "aTarget");
  gl.enableVertexAttribArray(targetLocation);
  gl.vertexAttribPointer(targetLocation, 2, gl.FLOAT, false, 0, 0);

  const seedBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, seedBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  const seedLocation = gl.getAttribLocation(program, "aSeed");
  gl.enableVertexAttribArray(seedLocation);
  gl.vertexAttribPointer(seedLocation, 3, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(program, "uTime");
  const uResolve = gl.getUniformLocation(program, "uResolve");
  const uAspect = gl.getUniformLocation(program, "uAspect");
  gl.uniform3f(gl.getUniformLocation(program, "uInk"), ...options.ink);
  gl.uniform1f(
    gl.getUniformLocation(program, "uOnPaper"),
    inkOnPaper(options.ink) ? 1 : 0,
  );

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  const now = options.now ?? (() => performance.now());
  const started = now();
  let frame = 0;
  let running = false;
  // Time accumulates only while running, so a field paused off-screen resumes
  // where it left off instead of jumping.
  let elapsed = 0;
  let lastTick = started;

  function resize(): void {
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.uniform1f(uAspect, canvas.clientHeight ? canvas.clientWidth / canvas.clientHeight : 1);
  }

  function render(): void {
    const tick = now();
    elapsed += (tick - lastTick) / 1_000;
    lastTick = tick;

    resize();
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.uniform1f(uTime, elapsed);
    gl!.uniform1f(uResolve, resolveAt(elapsed));
    // The one draw call.
    gl!.drawArrays(gl!.POINTS, 0, count);

    if (running) frame = requestAnimationFrame(render);
  }

  return {
    get running() {
      return running;
    },
    start() {
      if (running) return;
      running = true;
      lastTick = now();
      frame = requestAnimationFrame(render);
    },
    stop() {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    },
    destroy() {
      this.stop();
      gl.deleteBuffer(targetBuffer);
      gl.deleteBuffer(seedBuffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      // Do not call WEBGL_lose_context. React Strict Mode (on in `next dev`)
      // remounts this effect on the same canvas, and a lost context cannot be
      // replaced: the second getContext returns the dead one, createField
      // returns null, and the hero sticks on the still. Leaving the canvas
      // unmounts the context with the node, which is the only real teardown.
    },
  };
}
