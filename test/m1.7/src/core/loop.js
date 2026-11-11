// Fixed-timestep loop: simulation at a constant rate, rendering every animation frame with
// interpolation factor alpha (0..1) between the previous and the current sim state.
export function startLoop({ hz, update, frame }) {
  const step = 1 / hz;
  let acc = 0, last = performance.now(), running = true, raf = 0;
  function tick(now) {
    if (!running) return;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25; // tab was in background: don't fast-forward the world
    acc += dt;
    let n = 0;
    while (acc >= step && n < 8) { update(step); acc -= step; n++; }
    if (n === 8) acc = 0;
    frame(acc / step, dt, now);
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  return { stop() { running = false; cancelAnimationFrame(raf); } };
}
