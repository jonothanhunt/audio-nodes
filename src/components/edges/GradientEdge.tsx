"use client";
import * as React from 'react';
import { getBezierPath, type EdgeProps, useReactFlow } from 'reactflow';
import { getNodeMeta } from '@/lib/nodeRegistry';

// Custom gradient edge: stroke fades from source node accentColor to target node accentColor
export default function GradientEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    style,
    selected,
    source,
    target,
  } = props;
  const { getNodes } = useReactFlow();
  const nodes = getNodes();
  const sourceNode = nodes.find(n => n.id === source);
  const targetNode = nodes.find(n => n.id === target);
  const srcMeta = sourceNode ? getNodeMeta(sourceNode.type) : undefined;
  const tgtMeta = targetNode ? getNodeMeta(targetNode.type) : undefined;
  const srcColor = srcMeta?.accentColor || '#666';
  const tgtColor = tgtMeta?.accentColor || '#999';

  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const gradId = `edge-grad-${id}`;

  const strokeWidth = (style && typeof style.strokeWidth === 'number') ? style.strokeWidth : 2;
  const baseOpacity = style && typeof style.opacity === 'number' ? style.opacity : 1;

  // Emphasize when selected
  const effectiveStrokeWidth = selected ? strokeWidth + 1 : strokeWidth;

  return (
    <g className="react-flow__edge" data-edgeid={id}>
      <defs>
        <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
          <stop offset="0%" stopColor={srcColor} />
          <stop offset="100%" stopColor={tgtColor} />
        </linearGradient>
      </defs>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={effectiveStrokeWidth}
        className="react-flow__edge-path"
        markerEnd={markerEnd}
        style={{ ...style, opacity: baseOpacity, stroke: `url(#${gradId})` }}
      />
      {/* Invisible thicker stroke for easier pointer interactions */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(effectiveStrokeWidth + 10, 12)}
        className="pointer-events-stroke"
      />
      {props.label && (
        <foreignObject
          width={1}
          height={1}
          x={labelX}
          y={labelY}
          requiredExtensions="http://www.w3.org/1999/xhtml"
          style={{ overflow: 'visible' }}
        >
          <div style={{ transform: 'translate(-50%, -50%)', pointerEvents: 'none', fontSize: 10 }}>
            {props.label}
          </div>
        </foreignObject>
      )}
    </g>
  );
}
