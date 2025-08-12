"use client";

import React from "react";
import { X } from "lucide-react";

export interface HelpItem { name: string; description: string }

export interface NodeHelpPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
  title?: string;
  description: string;
  inputs: HelpItem[];
  outputs: HelpItem[];
  align?: "right" | "left";
}

export default function NodeHelpPopover({
  open,
  onClose,
  anchorRef,
  title,
  description,
  inputs,
  outputs,
  align = "right",
}: NodeHelpPopoverProps) {
  const popoverRef = React.useRef<HTMLDivElement | null>(null);
  const [arrowLeft, setArrowLeft] = React.useState<number>(0);
  const rafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (popoverRef.current && popoverRef.current.contains(t as Node)) return;
      if (anchorRef.current && anchorRef.current.contains(t as Node)) return;
      onClose();
    };
    const opts: AddEventListenerOptions = { capture: true };
    document.addEventListener("pointerdown", onDocPointerDown, opts);
    return () => document.removeEventListener("pointerdown", onDocPointerDown, opts);
  }, [open, onClose, anchorRef]);

  React.useLayoutEffect(() => {
    if (!open) return;
    const compute = () => {
      const btn = anchorRef.current;
      const pop = popoverRef.current;
      if (!btn || !pop) return;
      const b = btn.getBoundingClientRect();
      const p = pop.getBoundingClientRect();
      const cssWidth = pop.offsetWidth || 1; // unscaled width in CSS px
      const scale = p.width / cssWidth || 1; // RF zoom scale
      const centerViewportX = b.left + b.width / 2;
      const relViewport = centerViewportX - p.left; // in viewport px
      const relCss = relViewport / scale; // convert to CSS px inside popover
      const clampedCenter = Math.max(8, Math.min(cssWidth - 8, relCss));
      setArrowLeft(clampedCenter - 8); // left edge of 16px arrow
    };
    const loop = () => {
      compute();
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [open, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      className={`nodrag absolute ${align === "right" ? "right-0" : "left-0"} top-0 -translate-y-full z-50 w-96 max-w-[26rem] bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-lg p-3 shadow-xl`}
      role="dialog"
      aria-label={title ? `${title} information` : "Node information"}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Arrow centered to the anchor button */}
      <span
        className="pointer-events-none absolute w-4 h-4 rotate-45 bg-gray-900/95 border border-gray-700 border-t-0 border-l-0 shadow"
        style={{ left: arrowLeft, bottom: -8 }}
      />
      <button
        type="button"
        aria-label="Close"
        className="nodrag absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded-md text-gray-300 hover:bg-gray-800"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      {title && <div className="text-sm text-gray-100 font-medium mb-1">{title}</div>}
      <p className="text-xs text-gray-300 mb-2">{description}</p>
      <div className="text-xs text-gray-300 space-y-3">
        {inputs.length > 0 && (
          <div>
            <div className="font-semibold text-gray-200 mb-1">Inputs</div>
            <div className="space-y-1.5">
              {inputs.map((it, idx) => (
                <div key={idx}><span className="text-gray-400">{it.name}:</span> {it.description}</div>
              ))}
            </div>
          </div>
        )}
        {outputs.length > 0 && (
          <div>
            <div className="font-semibold text-gray-200 mb-1">Outputs</div>
            <div className="space-y-1.5">
              {outputs.map((it, idx) => (
                <div key={idx}><span className="text-gray-400">{it.name}:</span> {it.description}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
