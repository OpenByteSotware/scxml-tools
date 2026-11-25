import * as assert from 'assert';
import { validateScxmlSource } from '../scxml';
import { ScxmlSimulator } from '../simulator';

const w3cChart=`<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:conf="http://www.w3.org/2005/scxml-conformance" initial="s0" datamodel="ecmascript" version="1.0">
 <datamodel><data id="Var1" expr="0"/><data id="Var2"/><data id="Var3"/><data id="Var4" expr="7"/><data id="Var5">[1,2,3]</data></datamodel>
 <state id="s0"><onentry><foreach item="Var2" index="Var3" array="Var4"><assign location="Var1" expr="Var1 + 1"/></foreach><raise event="foo"/></onentry><transition event="error.execution" target="s1"/><transition event="*" target="fail"/></state>
 <state id="s1"><onentry><foreach item="'continue'" index="Var3" array="Var5"><assign location="Var1" expr="Var1 + 1"/></foreach><raise event="bar"/></onentry><transition event="error.execution" target="s2"/><transition event="bar" target="fail"/></state>
 <state id="s2"><transition cond="Var1==0" target="pass"/><transition target="fail"/></state>
 <final id="pass"><onentry><log label="Outcome" expr="'pass'"/></onentry></final><final id="fail"><onentry><log label="Outcome" expr="'fail'"/></onentry></final>
</scxml>`;

suite('Foreach runtime error conformance regression',()=>{
 test('does not block simulation for a runtime-invalid foreach location',()=>{
   const problems=validateScxmlSource(w3cChart);
   const location=problems.find(item=>item.code==='datamodel.ecmascript.location');
   assert.ok(location);
   assert.strictEqual(location!.severity,'warning');
   assert.doesNotThrow(()=>new ScxmlSimulator(w3cChart));
 });
 test('raises error.execution and abandons remaining executable content',()=>{
   const result=new ScxmlSimulator(w3cChart).initialize().snapshot;
   assert.strictEqual(result.completed,true);
   assert.deepStrictEqual(result.active,['pass']);
   assert.strictEqual(result.dataModel.Var1,0);
   assert.deepStrictEqual(result.logs,['Outcome: "pass"']);
   assert.strictEqual(result.trace.filter(item=>item.event==='error.execution'&&item.kind==='scheduled').length,2);
   assert.ok(!result.trace.some(item=>item.message==='Raised internal event foo.'));
   assert.ok(!result.trace.some(item=>item.message==='Raised internal event bar.'));
 });
});
