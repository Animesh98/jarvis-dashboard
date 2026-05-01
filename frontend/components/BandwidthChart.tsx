'use client';

import { useRef, useEffect, memo } from 'react';
import { fmtSpeed } from '@/lib/api';

interface Props {
  data: { ts: number; dl: number; ul: number }[];
}

export default memo(function BandwidthChart({ data }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const c = canvas.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width,
      H = rect.height;
    c.clearRect(0, 0, W, H);

    if (!data || data.length < 2) {
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.font = '13px -apple-system, system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText('Collecting bandwidth data…', W / 2, H / 2);
      return;
    }

    const maxV = Math.max(1, ...data.map((d) => Math.max(d.dl, d.ul))) * 1.1;
    const step = W / (data.length - 1);

    function drawLine(key: 'dl' | 'ul', color: string, fillColor: string) {
      c.beginPath();
      c.moveTo(0, H);
      data.forEach((d, i) => c.lineTo(i * step, H - (d[key] / maxV) * H * 0.85));
      c.lineTo(W, H);
      c.closePath();
      c.fillStyle = fillColor;
      c.fill();

      c.beginPath();
      data.forEach((d, i) => {
        const y = H - (d[key] / maxV) * H * 0.85;
        i === 0 ? c.moveTo(0, y) : c.lineTo(i * step, y);
      });
      c.strokeStyle = color;
      c.lineWidth = 1.5;
      c.stroke();
    }

    drawLine('dl', '#30d158', 'rgba(48, 209, 88, 0.06)');
    drawLine('ul', '#0a84ff', 'rgba(10, 132, 255, 0.06)');

    c.fillStyle = 'rgba(255,255,255,0.15)';
    c.font = '10px -apple-system, system-ui, sans-serif';
    c.textAlign = 'right';
    c.fillText(fmtSpeed(maxV), W - 6, 14);

    const last = data[data.length - 1];
    c.fillStyle = 'rgba(48, 209, 88, 0.6)';
    c.fillText('↓ ' + fmtSpeed(last.dl), W - 6, H - 16);
    c.fillStyle = 'rgba(10, 132, 255, 0.6)';
    c.fillText('↑ ' + fmtSpeed(last.ul), W - 6, H - 4);
  }, [data]);

  return (
    <div
      style={{
        borderRadius: 14,
        overflow: 'hidden',
        background: 'var(--row-hover)',
        border: '1px solid var(--row-border-strong)',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: 120, display: 'block' }} />
    </div>
  );
});
