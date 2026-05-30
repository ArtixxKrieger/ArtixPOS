function vib(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch (_) {}
}

export const hapticLight    = () => vib(8);
export const hapticSuccess  = () => vib([35, 20, 65]);
export const hapticMilestone = () => vib([50, 30, 50, 30, 100]);
