import {win32} from 'node:path';

// Never resolve an executable in cwd or PATH. SystemRoot comes from Windows.
export function powershellPath(systemRoot=process.env.SystemRoot) {
  if (typeof systemRoot!=='string' || !/^[A-Za-z]:\\Windows$/i.test(systemRoot))
    throw Error('SystemRoot de Windows inválido; no se ejecutó PowerShell.');
  return win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
}
