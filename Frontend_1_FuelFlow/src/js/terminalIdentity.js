export function pumpCode(identity) {
  return /^[0-9]{2}$/.test(identity?.pumpCode || '') ? identity.pumpCode : '—';
}

export function terminalIdentityText(identity, language = 'es') {
  const code = identity?.terminalCode || identity?.code || '';
  const terminal = /^PRIMAX-SUR-(T\d+)$/.exec(code)?.[1];
  const pump = pumpCode(identity);
  if (!terminal || pump === '—') return null;
  return `Terminal ${terminal} · ${language === 'en' ? 'Pump' : 'Surtidor'} ${pump}`;
}
