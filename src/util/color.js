// CSS-строки цвета

export function rgb(r, g, b) { return `rgb(${Math.max(0, Math.min(255, Math.round(r)))}, ${Math.max(0, Math.min(255, Math.round(g)))}, ${Math.max(0, Math.min(255, Math.round(b)))})`; }

export function rgba(r, g, b, a) { return `rgba(${Math.max(0, Math.min(255, Math.round(r)))}, ${Math.max(0, Math.min(255, Math.round(g)))}, ${Math.max(0, Math.min(255, Math.round(b)))}, ${(Math.max(0, Math.min(1, Number(a) || 0))).toFixed(3)})`; }
