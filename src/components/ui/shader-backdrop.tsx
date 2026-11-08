"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const VERTEX = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

/**
 * A slow mesh of soft light: four colour blobs drifting over a dark-to-light base, with a little grain.
 * Colours come from the brand (violet, indigo, pink, sky) and are tuned for light or dark.
 */
const FRAGMENT = `
precision mediump float;
uniform vec2 r; uniform float t; uniform float dark;
float n(vec2 x){ return fract(sin(dot(x, vec2(12.9898,78.233))) * 43758.5453); }
vec3 blob(vec2 uv, vec2 c, float s, vec3 col){ float d = length(uv - c); return col * exp(-d*d / s); }
void main(){
  vec2 uv = gl_FragCoord.xy / r; uv.x *= r.x / r.y;
  float k = t * 0.05;
  vec3 base = mix(vec3(0.985, 0.98, 1.0), vec3(0.055, 0.05, 0.09), dark);
  vec3 violet = vec3(0.60, 0.53, 0.99); vec3 indigo = vec3(0.39, 0.40, 0.95);
  vec3 pink = vec3(0.93, 0.47, 0.82); vec3 sky = vec3(0.40, 0.75, 0.98);
  float a = mix(0.78, 0.62, dark);
  vec3 c = base;
  c += a * blob(uv, vec2(0.25 + 0.15*sin(k*1.3), 0.55 + 0.25*cos(k*1.1)), 0.18, violet - base);
  c += a * blob(uv, vec2(1.05 + 0.25*cos(k*0.9), 0.30 + 0.20*sin(k*1.7)), 0.22, indigo - base);
  c += a * 0.8 * blob(uv, vec2(1.75 + 0.20*sin(k*1.1), 0.75 + 0.20*cos(k*1.3)), 0.20, pink - base);
  c += a * 0.7 * blob(uv, vec2(2.4 + 0.25*cos(k*0.7), 0.35 + 0.25*sin(k)), 0.24, sky - base);
  c += (n(gl_FragCoord.xy + t) - 0.5) * 0.025;
  gl_FragColor = vec4(c, 1.0);
}`;

/** An animated gradient behind a page header. Purely decorative. */
export function ShaderBackdrop({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const node = canvas.current;
    const gl = node?.getContext("webgl", { antialias: false, premultipliedAlpha: false });
    if (!node || !gl) return;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const uResolution = gl.getUniformLocation(program, "r");
    const uTime = gl.getUniformLocation(program, "t");
    const uDark = gl.getUniformLocation(program, "dark");

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let visible = true;
    const start = performance.now() - 40_000;
    const isDark = () => (document.documentElement.classList.contains("dark") ? 1 : 0);

    const draw = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.floor(node.clientWidth * scale));
      const height = Math.max(1, Math.floor(node.clientHeight * scale));
      if (node.width !== width || node.height !== height) {
        node.width = width;
        node.height = height;
        gl.viewport(0, 0, width, height);
      }
      gl.uniform2f(uResolution, width, height);
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.uniform1f(uDark, isDark());
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    const loop = () => {
      if (visible && !document.hidden) draw();
      frame = requestAnimationFrame(loop);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    observer.observe(node);
    const theme = new MutationObserver(draw);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    if (still) draw();
    else frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      theme.disconnect();
    };
  }, []);

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {/* Shown until (or instead of) WebGL. */}
      <div className="absolute inset-0 bg-[radial-gradient(60%_120%_at_10%_50%,color-mix(in_oklab,var(--color-primary)_30%,transparent),transparent),radial-gradient(50%_120%_at_90%_30%,color-mix(in_oklab,#7dd3fc_35%,transparent),transparent)]" />
      <canvas ref={canvas} className="absolute inset-0 size-full" />
      {/* Faint grid and a fade so text stays readable. */}
      <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,color-mix(in_oklab,var(--color-foreground)_7%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--color-foreground)_7%,transparent)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(80%_100%_at_70%_0%,black,transparent)]" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-background/15 to-transparent" />
    </div>
  );
}
