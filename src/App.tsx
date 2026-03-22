import { useEffect, useRef } from 'react';
import { GameEngine } from './game/GameEngine';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './game/constants';
import { DPad, isTouchDevice } from './components/DPad';
import { Direction } from './game/types';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const engine = new GameEngine(ctx);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const handleDirection = (dir: Direction) => {
    engineRef.current?.setNextDirection(dir);
  };

  const showDPad = isTouchDevice();

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, display: 'block' }}
        aria-label="Neon Pac-Man game board"
        role="img"
      />
      {showDPad && <DPad onDirection={handleDirection} />}
    </div>
  );
}

export default App;
