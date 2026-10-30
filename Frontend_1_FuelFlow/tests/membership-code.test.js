import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesMembershipCode} from '../src/js/membershipCode.js';
test('canonical and migrated alias match only backend-linked membership codes',()=>{
 const membership={number:'PRIME-A001',legacyNumbers:['PRIM-001A']};
 assert(matchesMembershipCode(membership,'PRIME-A001'));assert(matchesMembershipCode(membership,'PRIM-001A'));
 assert(!matchesMembershipCode(membership,'PRIME-B001'));assert(!matchesMembershipCode(null,'PRIM-001A'));
});
