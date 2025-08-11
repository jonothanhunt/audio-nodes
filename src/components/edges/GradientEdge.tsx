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

  const styleStrokeWidth = typeof style?.strokeWidth === 'number' ? style.strokeWidth : undefined;
  const baseStrokeWidth = styleStrokeWidth ?? 2;
  const baseOpacity = typeof style?.opacity === 'number' ? style.opacity : 1;
  const effectiveStrokeWidth = selected ? baseStrokeWidth * 2 : baseStrokeWidth;

  // Omit strokeWidth from original style without creating unused variable
  const styleRest = { ...(style || {}) } as React.CSSProperties & { strokeWidth?: number };
  if ('strokeWidth' in styleRest) {
    delete styleRest.strokeWidth;
  }

  return (
    <g className="react-flow__edge" data-edgeid={id}>
      <defs>
        <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
          <stop offset="0%" stopColor={srcColor} />
          <stop offset="100%" stopColor={tgtColor} />
        </linearGradient>
      </defs>
      {/* Visible gradient stroke */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={effectiveStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`react-flow__edge-path ${selected ? 'selected' : ''}`}
        markerEnd={markerEnd}
        style={{ ...styleRest, strokeWidth: effectiveStrokeWidth, opacity: baseOpacity, stroke: `url(#${gradId})`, filter: selected ? 'drop-shadow(0 0 4px rgba(255,255,255,0.25))' : undefined }}
      />
      {/* Interaction path (needed for proper selection per docs) */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(effectiveStrokeWidth + 12, 14)}
        className="react-flow__edge-interaction"
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
