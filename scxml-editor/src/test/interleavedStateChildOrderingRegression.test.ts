import * as assert from 'assert';
import { validateScxmlSource } from '../scxml';
const document=`<?xml version="1.0"?><scxml datamodel="ecmascript" xmlns="http://www.w3.org/2005/07/scxml" version="1.0"><state id="a"><state id="a1"><transition target="a2" event="t"/></state><state id="a2"/><transition target="b" event="t"/></state><state id="b"/></scxml>`;
suite('Interleaved state child ordering',()=>{
 test('permits transition after nested states',()=>{const p=validateScxmlSource(document);assert.ok(!p.some(x=>x.code==='schema.ordering'),JSON.stringify(p));});
 test('still rejects illegal children',()=>{const x=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"><state id="a"><donedata/></state></scxml>`;assert.ok(validateScxmlSource(x).some(v=>v.code==='schema.child'));});
 test('retains sequential invoke ordering',()=>{const x=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"><state id="a"><invoke><finalize/><param name="x" expr="1"/></invoke></state></scxml>`;assert.ok(validateScxmlSource(x).some(v=>v.code==='schema.ordering'));});
});
