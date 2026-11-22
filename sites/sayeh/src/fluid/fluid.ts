import { ADVECT, DISPLAY, DIVERGENCE, GRADIENT, MILK, PRESSURE, PROBE, RESET, SCALE, SPLAT, STIR, VERT } from './shaders';

type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number };
type Double = { read: Target; write: Target; swap(): void };
type Program = { prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };

export type Light = { tint: [number, number, number]; sheen: number; dir: [number, number] };

export const PROBE_SIZE = 64;

/**
 * The latte-art fluid: a GPU stable-fluids solver on half-float textures (WebGL2), with a velocity field at
 * `simRes` and a milk field ("dye") at `dyeRes`. All inputs are in the cup's uv space (0..1, y up).
 */
export class Fluid {
  readonly gl: WebGL2RenderingContext;
  private quad: WebGLVertexArrayObject;
  private p: Record<string, Program> = {};
  private velocity!: Double;
  private dye!: Double;
  private pressure!: Double;
  private divergence!: Target;
  private probe!: Target;
  private src: [number, number, number] = [0.5, 0.5, 0];
  private srcRadius = 0.0016;
  private pressureIterations: number;
  private seed = Math.random() * 40;
  /** Milk currently in the cup (0..1 of the surface), refreshed whenever the probe is read. */
  coverage = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly opts: { simRes: number; dyeRes: number; iterations?: number },
  ) {
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    // Rendering into half floats needs one of these; without them there is no simulation, only the photo.
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) throw new Error('No float render targets');
    this.gl = gl;
    this.pressureIterations = opts.iterations ?? 22;

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.quad = vao;

    const sources = { splat: SPLAT, milk: MILK, advect: ADVECT, divergence: DIVERGENCE, pressure: PRESSURE, gradient: GRADIENT, stir: STIR, scale: SCALE, probe: PROBE, display: DISPLAY, reset: RESET };
    for (const [name, frag] of Object.entries(sources)) this.p[name] = this.program(frag);
    this.allocate();
    // Every cell starts with its own crema coordinate.
    this.resetDye(0);
    this.dye.swap();
    this.resetDye(0);
  }

  private crema: WebGLTexture | null = null;

  /** The photo's crema (the liquid's bounding square) becomes the surface the milk is poured onto. */
  setCrema(img: TexImageSource): void {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.crema = tex;
  }

  get hasPhoto(): boolean {
    return this.crema !== null;
  }

  private resetDye(keep: number): void {
    const pr = this.use('reset', [1 / this.opts.dyeRes, 1 / this.opts.dyeRes]);
    this.tex(pr, 'uTarget', 0, this.dye.read);
    this.gl.uniform1f(pr.u.uKeep, keep);
    this.blit(this.dye.write);
    this.dye.swap();
  }

  private program(frag: string): Program {
    const gl = this.gl;
    const compile = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
    const u: Program['u'] = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i)!;
      u[info.name] = gl.getUniformLocation(prog, info.name);
    }
    return { prog, u };
  }

  private target(w: number, h: number, internal: number, format: number, type: number, filter: number): Target {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete framebuffer');
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo, w, h };
  }

  private double(w: number, h: number, internal: number, format: number, type: number, filter: number): Double {
    const d = {
      read: this.target(w, h, internal, format, type, filter),
      write: this.target(w, h, internal, format, type, filter),
      swap() {
        const t = d.read;
        d.read = d.write;
        d.write = t;
      },
    };
    return d;
  }

  private allocate(): void {
    const gl = this.gl;
    const { simRes, dyeRes } = this.opts;
    const HF = gl.HALF_FLOAT;
    this.velocity = this.double(simRes, simRes, gl.RGBA16F, gl.RGBA, HF, gl.LINEAR);
    this.pressure = this.double(simRes, simRes, gl.RGBA16F, gl.RGBA, HF, gl.NEAREST);
    this.divergence = this.target(simRes, simRes, gl.RGBA16F, gl.RGBA, HF, gl.NEAREST);
    this.dye = this.double(dyeRes, dyeRes, gl.RGBA16F, gl.RGBA, HF, gl.LINEAR);
    this.probe = this.target(PROBE_SIZE, PROBE_SIZE, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  }

  private use(name: string, texel: [number, number]): Program {
    const gl = this.gl;
    const pr = this.p[name];
    gl.useProgram(pr.prog);
    gl.uniform2f(pr.u.uTexel ?? null, texel[0], texel[1]);
    return pr;
  }

  private tex(pr: Program, name: string, unit: number, t: Target): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.uniform1i(pr.u[name] ?? null, unit);
  }

  private blit(target: Target | null): void {
    const gl = this.gl;
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.w, target.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
    gl.bindVertexArray(this.quad);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private get simTexel(): [number, number] {
    return [1 / this.opts.simRes, 1 / this.opts.simRes];
  }

  /** A velocity impulse (uv/s) around a point. `radius` is the Gaussian's variance in uv². */
  splat(x: number, y: number, dx: number, dy: number, radius = 0.0012): void {
    const pr = this.use('splat', this.simTexel);
    this.tex(pr, 'uTarget', 0, this.velocity.read);
    this.gl.uniform2f(pr.u.uPoint, x, y);
    this.gl.uniform3f(pr.u.uValue, dx, dy, 0);
    this.gl.uniform1f(pr.u.uRadius, radius);
    this.blit(this.velocity.write);
    this.velocity.swap();
  }

  /** Milk onto the surface at a point; `amount` 0..1 per call, saturating. */
  milk(x: number, y: number, amount: number, radius = 0.0011, gen = 0.2): void {
    const t: [number, number] = [1 / this.opts.dyeRes, 1 / this.opts.dyeRes];
    const pr = this.use('milk', t);
    this.tex(pr, 'uTarget', 0, this.dye.read);
    this.gl.uniform2f(pr.u.uPoint, x, y);
    this.gl.uniform1f(pr.u.uAmount, amount);
    this.gl.uniform1f(pr.u.uRadius, radius);
    this.gl.uniform1f(pr.u.uGen, gen);
    this.blit(this.dye.write);
    this.dye.swap();
  }

  /** The pour's mass source for the next step: `strength` is the divergence (1/s) at its centre. */
  source(x: number, y: number, strength: number, radius = 0.0016): void {
    this.src = [x, y, strength];
    this.srcRadius = radius;
  }

  /** Spins the whole cup (`omega` in rad/s) and/or sloshes it (`push`, uv/s). */
  stir(omega: number, pushX = 0, pushY = 0): void {
    const pr = this.use('stir', this.simTexel);
    this.tex(pr, 'uVelocity', 0, this.velocity.read);
    this.gl.uniform1f(pr.u.uOmega, omega);
    this.gl.uniform2f(pr.u.uPush, pushX, pushY);
    this.blit(this.velocity.write);
    this.velocity.swap();
  }

  /** Advances the simulation by `dt` seconds. */
  step(dt: number, opts: { velocityDecay: number; dyeDecay: number }): void {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    const texel = this.simTexel;

    // Divergence (with the pour's source and the sink that balances it over the disk).
    let pr = this.use('divergence', texel);
    this.tex(pr, 'uVelocity', 0, this.velocity.read);
    gl.uniform3f(pr.u.uSrc, this.src[0], this.src[1], this.src[2]);
    gl.uniform1f(pr.u.uSrcRadius, this.srcRadius);
    // ∫ s·exp(-r²/ρ) dA = s·π·ρ, spread over the disk's area π/4.
    gl.uniform1f(pr.u.uSink, this.src[2] * this.srcRadius * 4);
    this.blit(this.divergence);

    // Warm start from a faded copy of last frame's pressure, then Jacobi iterations.
    pr = this.use('scale', texel);
    this.tex(pr, 'uTarget', 0, this.pressure.read);
    gl.uniform1f(pr.u.uValue, 0.8);
    this.blit(this.pressure.write);
    this.pressure.swap();
    pr = this.use('pressure', texel);
    this.tex(pr, 'uDivergence', 1, this.divergence);
    for (let i = 0; i < this.pressureIterations; i++) {
      this.tex(pr, 'uPressure', 0, this.pressure.read);
      this.blit(this.pressure.write);
      this.pressure.swap();
    }

    pr = this.use('gradient', texel);
    this.tex(pr, 'uPressure', 0, this.pressure.read);
    this.tex(pr, 'uVelocity', 1, this.velocity.read);
    this.blit(this.velocity.write);
    this.velocity.swap();

    // Advect velocity by itself, then the milk by the velocity.
    pr = this.use('advect', texel);
    this.tex(pr, 'uVelocity', 0, this.velocity.read);
    this.tex(pr, 'uSource', 1, this.velocity.read);
    gl.uniform1f(pr.u.uDt, dt);
    gl.uniform1f(pr.u.uDissipation, opts.velocityDecay);
    gl.uniform1f(pr.u.uMask, 1);
    this.blit(this.velocity.write);
    this.velocity.swap();

    pr = this.use('advect', [1 / this.opts.dyeRes, 1 / this.opts.dyeRes]);
    this.tex(pr, 'uVelocity', 0, this.velocity.read);
    this.tex(pr, 'uSource', 1, this.dye.read);
    gl.uniform1f(pr.u.uDt, dt);
    gl.uniform1f(pr.u.uDissipation, opts.dyeDecay);
    gl.uniform1f(pr.u.uMask, 0);
    this.blit(this.dye.write);
    this.dye.swap();

    this.src[2] = 0;
  }

  /** Multiplies the milk and the velocity (1 keeps, 0 clears): used for "sip" and the new cup. */
  fade(milk: number, velocity = milk): void {
    this.resetDye(milk);
    const pr = this.use('scale', this.simTexel);
    this.tex(pr, 'uTarget', 0, this.velocity.read);
    this.gl.uniform1f(pr.u.uValue, velocity);
    this.blit(this.velocity.write);
    this.velocity.swap();
  }

  /** Draws the cup surface into the canvas. */
  render(light: Light): void {
    const gl = this.gl;
    const pr = this.use('display', [1 / this.opts.dyeRes, 1 / this.opts.dyeRes]);
    this.tex(pr, 'uDye', 0, this.dye.read);
    gl.uniform2f(pr.u.uDyeTexel, 1 / this.opts.dyeRes, 1 / this.opts.dyeRes);
    gl.uniform3f(pr.u.uTint, ...light.tint);
    gl.uniform1f(pr.u.uSheen, light.sheen);
    gl.uniform1f(pr.u.uSeed, this.seed);
    gl.uniform2f(pr.u.uLightDir, light.dir[0], light.dir[1]);
    gl.uniform1f(pr.u.uPhoto, this.crema ? 1 : 0);
    if (this.crema) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.crema);
      gl.uniform1i(pr.u.uCrema, 1);
    }
    gl.clearColor(0, 0, 0, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.blit(null);
  }

  /** Reads the milk field back at PROBE_SIZE² (0..1 per cell, row 0 at the bottom). Synchronous: use sparingly. */
  read(): Float32Array {
    const gl = this.gl;
    const pr = this.use('probe', [1 / PROBE_SIZE, 1 / PROBE_SIZE]);
    this.tex(pr, 'uDye', 0, this.dye.read);
    this.blit(this.probe);
    const px = new Uint8Array(PROBE_SIZE * PROBE_SIZE * 4);
    gl.readPixels(0, 0, PROBE_SIZE, PROBE_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const out = new Float32Array(PROBE_SIZE * PROBE_SIZE);
    let milk = 0;
    let cells = 0;
    for (let i = 0; i < out.length; i++) {
      out[i] = px[i * 4] / 255;
      const x = (i % PROBE_SIZE) + 0.5 - PROBE_SIZE / 2;
      const y = Math.floor(i / PROBE_SIZE) + 0.5 - PROBE_SIZE / 2;
      if (x * x + y * y < (PROBE_SIZE / 2) ** 2) {
        cells++;
        milk += out[i] > 0.5 ? 1 : 0;
      }
    }
    this.coverage = milk / Math.max(1, cells);
    return out;
  }

  /** Resizes the drawing buffer to the canvas' CSS box (the simulation grid is fixed). */
  resize(cssSize: number, dpr: number): void {
    const px = Math.max(2, Math.round(cssSize * dpr));
    if (this.canvas.width !== px) {
      this.canvas.width = px;
      this.canvas.height = px;
    }
  }
}
