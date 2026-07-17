const FRAMES = [
  "[FLATKEY]  .    ",
  "[FLATKEY]  ..   ",
  "[FLATKEY]  ...  ",
  "[FLATKEY]  .... ",
  "[FLATKEY]  >>>> ",
];

export function createAnimation({
  json = false,
  stream = process.stderr,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  let timer;
  let active = false;
  let frame = 0;

  return {
    start(kind = "media") {
      if (json) return;
      if (!stream.isTTY) {
        stream.write(`flatkey ${kind} generation started\n`);
        return;
      }
      active = true;
      stream.write(`${FRAMES[0]}\r`);
      timer = setIntervalFn(() => {
        if (!active) return;
        frame = (frame + 1) % FRAMES.length;
        stream.write(`${FRAMES[frame]}\r`);
      }, 120);
    },
    stop() {
      active = false;
      if (timer) clearIntervalFn(timer);
      if (!json && stream.isTTY) stream.write("                 \r");
    },
  };
}
