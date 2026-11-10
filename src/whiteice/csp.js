// WHITE ICE content security policy. One source of truth: the Vite build injects the
// meta version, and the integrity manifest carries the header version for the desktop host.
export const TRUSTED_TYPES_POLICY = 'shodan';

export const LOOPBACK_CONNECT_SOURCES = Object.freeze([
  'http://localhost:*',
  'http://127.0.0.1:*',
  'https://localhost:*',
  'https://127.0.0.1:*',
]);

export function cspDirectives({ header = false } = {}) {
  const directives = {
    'default-src': ["'self'"],
    // WebAssembly compilation is required by the Piper/ONNX worker; no JavaScript eval is allowed.
    'script-src': ["'self'", "'wasm-unsafe-eval'"],
    'worker-src': ["'self'"],
    'style-src': ["'self'"],
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...LOOPBACK_CONNECT_SOURCES],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'none'"],
    'manifest-src': ["'self'"],
    'require-trusted-types-for': ["'script'"],
    'trusted-types': [TRUSTED_TYPES_POLICY],
  };
  // frame-ancestors is ignored inside <meta>; only send it as a real header.
  if (header) directives['frame-ancestors'] = ["'none'"];
  return directives;
}

export function buildCsp(options) {
  return Object.entries(cspDirectives(options))
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

export const SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=()',
});
