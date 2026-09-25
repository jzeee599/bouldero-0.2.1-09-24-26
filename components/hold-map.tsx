"use client";
import { useRef, useState } from "react";
import { normalize } from "@/lib/coordinates";
import type { Hold } from "@/lib/types";

type Props = {
  src: string;
  holds: Hold[];
  editable?: boolean;
  selectable?: boolean;
  selected?: string;
  onSelect?: (id: string) => void;
  onChange?: (holds: Hold[]) => void;
};
export default function HoldMap({
  src,
  holds,
  editable = false,
  selectable = false,
  selected,
  onSelect,
  onChange,
}: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    pointer: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const position = (x: number, y: number) =>
    normalize(x, y, frame.current!.getBoundingClientRect());
  return (
    <div
      className={`photo-map ${editable ? "is-editable" : ""} ${selectable ? "is-selectable" : ""}`}
      ref={frame}
      data-testid="photo-map"
      onClick={(event) => {
        if (
          !editable ||
          !ready ||
          holds.length >= 200 ||
          event.target !== event.currentTarget.querySelector("img")
        )
          return;
        onChange?.([
          ...holds.map((h) => ({ ...h, is_top: false })),
          {
            id: crypto.randomUUID(),
            order_index: holds.length + 1,
            ...position(event.clientX, event.clientY),
            is_top: false,
          },
        ]);
        onSelect?.("");
      }}
    >
      {/* No object-fit or fixed height here: the wrapper exactly matches the image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Climbing route with mapped holds"
        draggable={false}
        onLoad={() => setReady(true)}
        onError={() => setFailed(true)}
      />
      {failed && (
        <p role="alert">
          Photo could not load. Return to projects and try opening it again.
        </p>
      )}
      {ready &&
        holds.map((hold) => (
          <button
            key={hold.id}
            type="button"
            className={`hold ${hold.is_top ? "top-hold" : ""} ${selected === hold.id ? "selected" : ""}`}
            style={{ left: `${hold.x * 100}%`, top: `${hold.y * 100}%` }}
            aria-label={`Hold ${hold.order_index}${hold.is_top ? ", TOP" : ""}`}
            aria-pressed={editable || selectable ? selected === hold.id : undefined}
            data-testid={`hold-${hold.order_index}`}
            onClick={(event) => {
              event.stopPropagation();
              if (editable || selectable) onSelect?.(hold.id);
            }}
            onPointerDown={(event) => {
              if (!editable) return;
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                id: hold.id,
                pointer: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                moved: false,
              };
              onSelect?.(hold.id);
            }}
            onPointerMove={(event) => {
              const current = drag.current;
              if (
                !current ||
                current.id !== hold.id ||
                current.pointer !== event.pointerId
              )
                return;
              if (
                Math.hypot(
                  event.clientX - current.startX,
                  event.clientY - current.startY,
                ) > 3
              )
                current.moved = true;
              if (current.moved)
                onChange?.(
                  holds.map((h) =>
                    h.id === hold.id
                      ? { ...h, ...position(event.clientX, event.clientY) }
                      : h,
                  ),
                );
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onKeyDown={(event) => {
              if (
                !editable ||
                !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
                  event.key,
                )
              )
                return;
              event.preventDefault();
              const step = event.shiftKey ? 0.025 : 0.005;
              onChange?.(
                holds.map((h) =>
                  h.id === hold.id
                    ? {
                        ...h,
                        x: Math.max(
                          0,
                          Math.min(
                            1,
                            h.x +
                              (event.key === "ArrowRight"
                                ? step
                                : event.key === "ArrowLeft"
                                  ? -step
                                  : 0),
                          ),
                        ),
                        y: Math.max(
                          0,
                          Math.min(
                            1,
                            h.y +
                              (event.key === "ArrowDown"
                                ? step
                                : event.key === "ArrowUp"
                                  ? -step
                                  : 0),
                          ),
                        ),
                      }
                    : h,
                ),
              );
            }}
          >
            <span>{hold.is_top ? "TOP" : hold.order_index}</span>
            <i />
          </button>
        ))}
    </div>
  );
}
