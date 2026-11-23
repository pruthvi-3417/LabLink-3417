import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export interface WebGLProfile {
  supported: boolean;
  isSoftware: boolean;
  reducedMotion: boolean;
}

export function detectWebGLProfile(): WebGLProfile {
  if (typeof window === 'undefined') {
    return { supported: false, isSoftware: false, reducedMotion: false };
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl2') as WebGLRenderingContext | null) ||
      (canvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) {
      return { supported: false, isSoftware: false, reducedMotion };
    }
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '')
      : String(gl.getParameter(gl.RENDERER) || '');
    const isSoftware = /swiftshader|llvmpipe|mesa|software/i.test(renderer);
    return { supported: true, isSoftware, reducedMotion };
  } catch {
    return { supported: false, isSoftware: false, reducedMotion };
  }
}

export function useVisibilityPause() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]) setVisible(entries[0].isIntersecting);
      },
      { threshold: 0.05 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { ref, visible };
}

export function createNodeLabelTexture(
  title: string,
  subtitle: string | undefined,
  accentHex: string,
  highlighted: boolean
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const width = 384;
  const height = subtitle ? 112 : 84;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);

  // Rounded backdrop card
  const pad = 6;
  const r = 18;
  ctx.beginPath();
  ctx.roundRect(pad, pad, width - pad * 2, height - pad * 2, r);
  ctx.fillStyle = highlighted ? 'rgba(17, 27, 46, 0.96)' : 'rgba(13, 20, 36, 0.90)';
  ctx.fill();
  ctx.lineWidth = highlighted ? 3.5 : 2;
  ctx.strokeStyle = highlighted ? accentHex : 'rgba(255, 255, 255, 0.22)';
  ctx.stroke();

  // Status dot
  ctx.beginPath();
  ctx.arc(32, subtitle ? 40 : height / 2, 7, 0, Math.PI * 2);
  ctx.fillStyle = accentHex;
  ctx.fill();

  // Primary label
  ctx.font = '600 26px "JetBrains Mono", "Inter", sans-serif';
  ctx.fillStyle = '#F8FAFC';
  ctx.textBaseline = 'middle';
  ctx.fillText(title.slice(0, 22), 52, subtitle ? 40 : height / 2);

  if (subtitle) {
    ctx.font = '500 20px "Inter", sans-serif';
    ctx.fillStyle = '#94A3B8';
    ctx.fillText(subtitle.slice(0, 28), 52, 76);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

