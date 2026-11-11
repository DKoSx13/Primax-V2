// Recovery credentials must go only to the explicitly configured terminal.
export function recoveryTerminalOrigin(code, t01Origin, t02Origin) {
  const origin = code?.endsWith('-T01') ? t01Origin : code?.endsWith('-T02') ? t02Origin : null;
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.username || url.password ||
        !(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) return null;
    return url.origin;
  } catch { return null; }
}
