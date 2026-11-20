import * as assert from 'assert';
import { parseScxml } from '../scxml';
suite('Stage 11 completion and reachability validation', () => {
 const prefix=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"`;
 test('reports unreachable states',()=>{const m=parseScxml(`${prefix} initial="a"><state id="a"/><state id="unused"/></scxml>`);assert.ok(m.problems.some(p=>p.severity==='warning'&&/unreachable/.test(p.message)));});
 test('validates completion references',()=>{const m=parseScxml(`${prefix} initial="a"><state id="a"><transition event="done.state.missing done.invoke.worker"/></state></scxml>`);assert.ok(m.errors.some(e=>/missing completion state/.test(e)));assert.ok(m.errors.some(e=>/missing invoke completion/.test(e)));});
 test('warns for incomplete parallel regions',()=>{const m=parseScxml(`${prefix} initial="p"><parallel id="p"><state id="r1"/><state id="r2"><final id="done"/></state></parallel></scxml>`);assert.ok(m.problems.some(p=>/cannot complete normally/.test(p.message)));});
});
