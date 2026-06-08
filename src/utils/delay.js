export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomDelay(min, max) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}
