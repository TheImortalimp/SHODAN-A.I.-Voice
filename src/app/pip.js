const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'pointermove', 'wheel', 'touchstart'];

/**
 * Opens the Document Picture-in-Picture "float on top" window. Built with DOM APIs only, so
 * it works under the page's Trusted Types policy, and styled by the page's own stylesheet.
 */
export async function openFloatingWindow({
  createRenderer, frameInput, draft = '', status = '',
  onDraft, onTransmit, onGenerate, onStop, onKey, onActivity, onClose,
}) {
  const pip = await window.documentPictureInPicture.requestWindow({ width: 360, height: 550 });
  const doc = pip.document;
  doc.title = 'SHODAN // FLOATING';
  for (const sheet of document.querySelectorAll('link[rel="stylesheet"]')) {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = sheet.href;
    doc.head.append(link);
  }
  const make = (tag, props = {}, ...children) => {
    const node = doc.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
  };
  const canvas = make('canvas', { className: 'art', width: 700, height: 700 });
  canvas.setAttribute('aria-label', 'Animated AI avatar');
  const input = make('textarea', { placeholder: 'Type here and press Enter', value: draft });
  input.setAttribute('aria-label', 'Message to synthesize');
  const send = make('button', { type: 'button', className: 'go', textContent: '▶ TRANSMIT' });
  const ai = make('button', { type: 'button', textContent: '◈ AI', title: 'AI transmission' });
  const halt = make('button', { type: 'button', textContent: '■ STOP' });
  const state = make('p', { className: 'status', textContent: status });
  state.setAttribute('role', 'status');
  doc.body.className = 'pip';
  doc.body.append(
    make(
      'div', { className: 'wrap' },
      make('div', { className: 'top' }, make('b', { textContent: 'SHODAN // FLOAT' }), make('span', { textContent: '● LIVE' })),
      canvas,
      input,
      make('div', { className: 'actions' }, send, ai, halt),
      state,
      make('p', { className: 'hint', textContent: 'TYPE WHILE THIS WINDOW IS FOCUSED · ENTER TO SEND' }),
    ),
  );

  input.addEventListener('input', () => onDraft(input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      onTransmit();
    }
  });
  doc.addEventListener('keydown', (event) => onKey(event, input));
  send.addEventListener('click', () => onTransmit());
  ai.addEventListener('click', () => onGenerate());
  halt.addEventListener('click', () => onStop());
  for (const name of ACTIVITY_EVENTS) pip.addEventListener(name, onActivity, { passive: true, capture: true });

  const context = canvas.getContext('2d');
  const renderer = createRenderer();
  const draw = () => {
    if (pip.closed) return;
    renderer.draw(context, canvas.width, canvas.height, { ...frameInput(), pointer: null }, { fit: 'cover', hud: 'mini' });
    pip.requestAnimationFrame(draw);
  };
  pip.requestAnimationFrame(draw);
  pip.addEventListener('pagehide', () => onClose());
  input.focus();

  return {
    window: pip,
    input,
    setStatus(text) {
      state.textContent = text;
    },
    setDraft(text) {
      if (input.value !== text) input.value = text;
    },
  };
}
