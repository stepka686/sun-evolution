// Математические утилиты

export function lerp(a, b, f) { return a + (b - a) * f; }

export function lerpColor(c1, c2, f) { return [Math.round(lerp(c1[0], c2[0], f)), Math.round(lerp(c1[1], c2[1], f)), Math.round(lerp(c1[2], c2[2], f))]; }
