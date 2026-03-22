/**
 * DPad.tsx — On-screen directional pad for mobile/touch devices.
 *
 * Rendered as an absolutely-positioned React component overlaid on the canvas.
 * Uses onPointerDown (not onClick) for immediate response without 300ms delay.
 * touch-action: none prevents browser scroll/zoom interference.
 */

import { Direction } from '../game/types';

interface DPadProps {
  onDirection: (dir: Direction) => void;
}

const BUTTON_SIZE = 56;

const buttonStyle: React.CSSProperties = {
  width: BUTTON_SIZE,
  height: BUTTON_SIZE,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0, 191, 255, 0.15)',
  border: '2px solid #00BFFF',
  borderRadius: 8,
  color: '#00BFFF',
  fontSize: 24,
  cursor: 'pointer',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  touchAction: 'none',
};

const emptyStyle: React.CSSProperties = {
  width: BUTTON_SIZE,
  height: BUTTON_SIZE,
};

/**
 * Detect whether the current device is a touch/coarse-pointer device.
 * Exported for unit testing.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || window.matchMedia('(pointer:coarse)').matches;
}

export function DPad({ onDirection }: DPadProps) {
  const handlePointerDown = (dir: Direction) => (e: React.PointerEvent) => {
    e.preventDefault();
    onDirection(dir);
  };

  const preventContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'grid',
        gridTemplateColumns: `${BUTTON_SIZE}px ${BUTTON_SIZE}px ${BUTTON_SIZE}px`,
        gridTemplateRows: `${BUTTON_SIZE}px ${BUTTON_SIZE}px ${BUTTON_SIZE}px`,
        gap: 4,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        zIndex: 100,
      }}
      onContextMenu={preventContextMenu}
      role="group"
      aria-label="Directional controls"
    >
      {/* Row 1: empty, up, empty */}
      <div style={emptyStyle} />
      <button
        style={buttonStyle}
        onPointerDown={handlePointerDown(Direction.UP)}
        onContextMenu={preventContextMenu}
        aria-label="Move up"
      >
        ↑
      </button>
      <div style={emptyStyle} />

      {/* Row 2: left, empty, right */}
      <button
        style={buttonStyle}
        onPointerDown={handlePointerDown(Direction.LEFT)}
        onContextMenu={preventContextMenu}
        aria-label="Move left"
      >
        ←
      </button>
      <div style={emptyStyle} />
      <button
        style={buttonStyle}
        onPointerDown={handlePointerDown(Direction.RIGHT)}
        onContextMenu={preventContextMenu}
        aria-label="Move right"
      >
        →
      </button>

      {/* Row 3: empty, down, empty */}
      <div style={emptyStyle} />
      <button
        style={buttonStyle}
        onPointerDown={handlePointerDown(Direction.DOWN)}
        onContextMenu={preventContextMenu}
        aria-label="Move down"
      >
        ↓
      </button>
      <div style={emptyStyle} />
    </div>
  );
}
