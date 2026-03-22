import { useEffect, useRef } from 'react';
import { GameEngine } from './game/GameEngine';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './game/constants';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const engine = new GameEngine(ctx);
    return () => {
      engine.destroy();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, display: 'block' }}
      aria-label="Neon Pac-Man game board"
      role="img"
    />
  );
}

export default App;
