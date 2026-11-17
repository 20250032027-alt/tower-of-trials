// One shared place for "button presses" coming from on-screen buttons (touch OR mouse clicks on the HUD).
// The scene drains it every frame.
export const Controls = {
  _pressed: {},
  press(name) { this._pressed[name] = true; },
  take() { const p = this._pressed; this._pressed = {}; return p; },
};

// Is this a touch device / is touch mode on? (body.touch toggles the on-screen pad + portrait layout)
const mq = (q) => (window.matchMedia ? window.matchMedia(q).matches : false);

export function layoutState() {
  const w = window.innerWidth, h = window.innerHeight;
  return { w, h, portrait: h > w, touch: document.body.classList.contains('touch') };
}

export function initLayoutWatcher(onChange) {
  const body = document.body;
  const apply = () => {
    const auto = mq('(pointer: coarse)') || (navigator.maxTouchPoints || 0) > 0 && mq('(hover: none)');
    const pref = (window.__tower && window.__tower.G && window.__tower.G.settings && window.__tower.G.settings.touch) || 'auto';
    const touch = pref === 'on' ? true : pref === 'off' ? false : (auto || body.dataset.sawTouch === '1');
    body.classList.toggle('touch', touch);
    body.dataset.layout = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
    onChange && onChange(layoutState());
    window.dispatchEvent(new Event('tower-layout'));
  };
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 120));
  window.addEventListener('touchstart', () => {
    if (body.dataset.sawTouch !== '1') { body.dataset.sawTouch = '1'; apply(); }
  }, { passive: true });
  apply();
  return apply;
}
