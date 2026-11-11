import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryTerminalOrigin} from '../js/recovery-origin.js';

test('recovery targets the configured QA terminal without fixed port arithmetic',()=>{
 const origins=['http://127.0.0.1:28181','http://127.0.0.1:28184'];
 assert.equal(recoveryTerminalOrigin('PRIMAX-SUR-T01',...origins),origins[0]);
 assert.equal(recoveryTerminalOrigin('PRIMAX-SUR-T02',...origins),origins[1]);
 assert.equal(recoveryTerminalOrigin('PRIMAX-SUR-T02',origins[0],''),null);
 assert.equal(recoveryTerminalOrigin('PRIMAX-SUR-T03',...origins),null);
 assert.equal(recoveryTerminalOrigin(undefined,...origins),null);
});

test('recovery rejects unsafe origins and preserves explicit HTTPS deployment',()=>{
 for(const origin of ['http://remote.example','https://user:pass@example.test','https://example.test/path','https://example.test?token=x','javascript:alert(1)'])
  assert.equal(recoveryTerminalOrigin('PRIMAX-SUR-T02','',origin),null);
 assert.equal(recoveryTerminalOrigin('PRIMAX-SUR-T02','','https://t02.example.test'),'https://t02.example.test');
});
