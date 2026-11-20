import * as assert from 'assert';
import { parseScxml, validateScxmlSource } from '../scxml';
suite('Stage 10 source-ranged diagnostics', () => {
  test('ranges missing required attributes', () => { const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"><state/></scxml>`; const item=validateScxmlSource(xml).find(p=>p.code==='schema.requiredAttribute'); assert.ok(item); assert.match(xml.slice(item!.startOffset,item!.endOffset),/<state/); });
  test('ranges illegal children and attributes', () => { const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"><final id="done"><state id="bad" bogus="x"/></final></scxml>`; const p=validateScxmlSource(xml); assert.ok(p.some(x=>x.code==='schema.child')); assert.ok(p.some(x=>x.code==='schema.attribute')); });
  test('classifies semantic warnings', () => { const m=parseScxml(`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"><parallel id="p"><state id="only"/></parallel></scxml>`); assert.ok(m.problems.some(p=>p.severity==='warning')); });
});
