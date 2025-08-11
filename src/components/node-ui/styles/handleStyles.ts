import React from 'react';

export type HandleVariant = 'midi' | 'numeric' | 'audio' | 'string' | 'bool';

export interface MakeHandleStyleArgs {
  top: number;
  side: 'left' | 'right';
  connected: boolean;
  variant: HandleVariant;
  accentColor: string;
  baseBg?: string;
}

export const baseBgDefault = '#111827';

export function makeHandleStyle({ top, side, connected, variant, accentColor, baseBg = baseBgDefault }: MakeHandleStyleArgs): React.CSSProperties {
  // Adjust bool size down to 20 (same as string) from previous 22
  const size = variant === 'audio' ? 18 : (variant === 'string' ? 20 : (variant === 'bool' ? 20 : 16));
  const isSvgVariant = variant === 'string' || variant === 'bool';
  const base: React.CSSProperties = {
    top,
    transform: 'translateY(-50%)',
    [side]: -(size / 2),
    width: size,
    height: size,
    background: isSvgVariant ? 'transparent' : (connected ? accentColor : baseBg),
    border: isSvgVariant ? 'none' : `1px solid ${accentColor}`,
    borderRadius: variant === 'audio' ? 9999 : 2,
    boxShadow: 'none',
    transition: 'background 140ms, box-shadow 140ms, filter 140ms',
    cursor: 'crosshair',
    position: 'absolute',
    '--fill': (connected ? accentColor : baseBg) as string
  } as React.CSSProperties;
  if (variant === 'numeric') base.transform = 'translateY(-50%) rotate(45deg)';
  if (variant === 'bool') base.borderRadius = 0;
  return base;
}

export function renderHandleInner(variant: HandleVariant, accentColor: string): React.ReactNode {
  if (variant === 'string') {
    return React.createElement(
      'svg',
      { width: '100%', height: '100%', viewBox: '0 0 100 100', preserveAspectRatio: 'xMidYMid meet', style: { pointerEvents: 'none' } },
      React.createElement('polygon', {
        points: '50,6 94,38 76,94 24,94 6,38',
        fill: 'var(--fill)',
        stroke: accentColor,
        strokeWidth: 6,
        strokeLinejoin: 'round'
      })
    );
  }
  if (variant === 'bool') {
    return React.createElement(
      'svg',
      { width: '100%', height: '100%', viewBox: '0 0 100 100', preserveAspectRatio: 'xMidYMid meet', style: { pointerEvents: 'none' } },
      React.createElement('polygon', {
        // Slightly taller & wider than previous triangle
        points: '50,10 6,90 94,90',
        fill: 'var(--fill)',
        stroke: accentColor,
        strokeWidth: 5,
        strokeLinejoin: 'round'
      })
    );
  }
  return null;
}
