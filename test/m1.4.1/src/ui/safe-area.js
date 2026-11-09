// Reads iPhone safe-area insets (notch / Dynamic Island / home indicator) from a probe element whose padding
// is env(safe-area-inset-*) via CSS variables --sa-* (tests override the variables to simulate a notch).
export function readSafeArea() {
  const probe = document.getElementById('safeProbe');
  const cs = getComputedStyle(probe);
  return {
    left: parseFloat(cs.paddingLeft) || 0, right: parseFloat(cs.paddingRight) || 0,
    top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0,
  };
}
