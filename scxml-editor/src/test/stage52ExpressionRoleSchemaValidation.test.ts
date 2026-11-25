import * as assert from 'assert';
import { validateScxmlSource } from '../scxml';
const wrap=(body:string)=>`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a"><datamodel><data id="timerId" expr="'timer-1'"/></datamodel><state id="a">${body}</state></scxml>`;
suite('Stage 52 expression roles and schema enumerations',()=>{
 test('sendidexpr is an expression, not a location',()=>{const p=validateScxmlSource(wrap(`<onentry><cancel sendidexpr="'timer-' + 1"/></onentry>`));assert.ok(!p.some(x=>x.code==='datamodel.ecmascript.location'),JSON.stringify(p));});
 test('writable attributes still require locations',()=>{const p=validateScxmlSource(wrap(`<onentry><send event="go" idlocation="'bad'"/><assign location="1 + 2" expr="3"/></onentry>`));assert.strictEqual(p.filter(x=>x.code==='datamodel.ecmascript.location').length,2);});
 test('bad sendidexpr is reported as expression syntax',()=>{const p=validateScxmlSource(wrap(`<onentry><cancel sendidexpr="timer +"/></onentry>`));assert.ok(p.some(x=>x.code==='datamodel.ecmascript.expression'));assert.ok(!p.some(x=>x.code==='datamodel.ecmascript.location'));});
 test('validates root enumerations',()=>{const codes=validateScxmlSource(`<scxml xmlns="urn:bad" version="2.0" binding="lazy"><state id="a"/></scxml>`).map(x=>x.code);for(const c of ['schema.version','schema.namespace','schema.binding'])assert.ok(codes.includes(c),c);});
 test('validates transition and history types',()=>{const codes=validateScxmlSource(`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a"><state id="a"><transition type="local" target="a"/><history id="h" type="recursive"><transition target="a"/></history></state></scxml>`).map(x=>x.code);assert.ok(codes.includes('schema.transitionType'));assert.ok(codes.includes('schema.historyType'));});
});
