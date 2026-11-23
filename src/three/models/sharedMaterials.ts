import React, { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Installs a procedural PMREM studio environment map on the R3F scene
 * with zero external HDRI downloads. Disposes cleanly on unmount.
 */
export const StudioEnvironment: React.FC = () => {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const rt = pmrem.fromScene(room, 0.04);
    const prevEnv = scene.environment;
    scene.environment = rt.texture;
    room.dispose();
    pmrem.dispose();

    return () => {
      scene.environment = prevEnv;
      rt.dispose();
    };
  }, [gl, scene]);

  return null;
};

export function createOscilloscopeScreenTexture(accentHex = '#22D3EE'): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#051525';
  ctx.fillRect(0, 0, 256, 160);

  // Graticule grid
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 256; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 160);
    ctx.stroke();
  }
  for (let y = 0; y <= 160; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }

  // Channel 1 damped sine wave
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let x = 0; x <= 256; x += 2) {
    const t = (x / 256) * Math.PI * 6;
    const y = 64 + Math.sin(t) * 28 * Math.exp(-x / 320);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Channel 2 square clock trace
  ctx.strokeStyle = '#3B82F6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= 256; x += 24) {
    const high = Math.floor(x / 24) % 2 === 0;
    const y = high ? 116 : 138;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    ctx.lineTo(x + 24, y);
  }
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createBuildingWindowTexture(accentHex: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#0D1729';
  ctx.fillRect(0, 0, 256, 256);

  const cols = 6;
  const rows = 8;
  const cellW = 256 / cols;
  const cellH = 256 / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = (r * 7 + c * 11) % 5 !== 0;
      ctx.fillStyle = lit
        ? (r + c) % 4 === 0
          ? accentHex
          : 'rgba(186, 230, 253, 0.72)'
        : '#132038';
      ctx.fillRect(c * cellW + 5, r * cellH + 5, cellW - 10, cellH - 10);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}
