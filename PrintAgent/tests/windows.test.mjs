import test from 'node:test';
import assert from 'node:assert/strict';
import {powershellPath} from '../windows.mjs';
test('PowerShell uses an absolute system executable, never PATH or cwd',()=>{
  assert.equal(powershellPath('C:\\Windows'),'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  for(const root of ['.', '../Windows', 'C:\\Users\\attacker','C:\\Windows\\..\\temp', ''])assert.throws(()=>powershellPath(root));
});
