'use client';

import { memo } from 'react';
import { colorForPercent } from '@/lib/api';

interface GaugeProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
  label: string;
  detail?: string;
}

export default memo(function Gauge({
  percent,
  size = 100,
  strokeWidth = 7,
  label,
  detail,
}: GaugeProps) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(percent, 100) / 100) * circ;
  const color = colorForPercent(percent);
  const c = size / 2;

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="var(--gauge-track)"
          strokeWidth={strokeWidth}
        />
        {/* Glow */}
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth + 4}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${c} ${c})`}
          opacity="0.08"
          style={{
            transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1), stroke 0.3s',
            filter: 'blur(4px)',
          }}
        />
        {/* Fill */}
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${c} ${c})`}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1), stroke 0.3s' }}
        />
        <text
          x={c}
          y={c}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--text-primary)"
          fontFamily="-apple-system, system-ui, sans-serif"
          fontSize={size * 0.18}
          fontWeight="700"
        >
          {Math.round(percent)}%
        </text>
      </svg>
      <div
        style={{
          fontSize: '0.6875rem',
          fontWeight: 600,
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.06em',
          marginTop: 4,
        }}
      >
        {label}
      </div>
      {detail && (
        <div
          style={{
            fontSize: '0.6875rem',
            color: 'var(--text-tertiary)',
            marginTop: 2,
            fontFamily: 'SF Mono, monospace',
          }}
        >
          {detail}
        </div>
      )}
    </div>
  );
});

export const MiniGauge = memo(function MiniGauge({
  percent,
  size = 54,
}: {
  percent: number;
  size?: number;
}) {
  const r = (size - 5) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(percent, 100) / 100) * circ;
  const color = colorForPercent(percent);
  const c = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--gauge-track)" strokeWidth="4" />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${c} ${c})`}
        style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)' }}
      />
      <text
        x={c}
        y={c}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontFamily="-apple-system, system-ui, sans-serif"
        fontSize={size * 0.22}
        fontWeight="700"
      >
        {Math.round(percent)}%
      </text>
    </svg>
  );
});
