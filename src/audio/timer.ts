export interface Timer {
  start(cb: () => void, ms: number): void;
  stop(): void;
}

const WORKER_SRC = `let id=null;onmessage=(e)=>{clearInterval(id);id=null;if(e.data>0)id=setInterval(()=>postMessage(0),e.data)}`;

/**
 * Temporizador que despierta al planificador de audio.
 * Usa un Web Worker (los navegadores lo ralentizan menos en segundo plano)
 * y cae a setInterval si el Worker no está disponible.
 */
export function createTimer(): Timer {
  let worker: Worker | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let callback: (() => void) | null = null;
  let period = 25;
  let running = false;

  const startFallback = () => {
    if (intervalId !== null) clearInterval(intervalId);
    intervalId = setInterval(() => callback?.(), period);
  };

  try {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = () => callback?.();
    worker.onerror = () => {
      worker = null;
      if (running) startFallback();
    };
  } catch {
    worker = null;
  }

  return {
    start(cb, ms) {
      callback = cb;
      period = ms;
      running = true;
      if (worker) worker.postMessage(ms);
      else startFallback();
    },
    stop() {
      running = false;
      worker?.postMessage(0);
      if (intervalId !== null) clearInterval(intervalId);
      intervalId = null;
    },
  };
}
