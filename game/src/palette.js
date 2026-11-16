// The look plan, in one place. Six values and one accent hue; the lighting makes every
// shade the game needs, so no other colour appears in the code. The same six names are
// the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#242830',
  surface: '#303741',
  hairline: '#3e4652',
  ink: '#e9e6df',
  muted: '#a8b0b8',
  accent: '#f0a830',
};

export function shade(name) {
  return PALETTE[name];
}
