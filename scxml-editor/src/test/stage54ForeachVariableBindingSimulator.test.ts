import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

suite('Stage 54 foreach variable binding and inline ECMAScript data', () => {
  const w3cChart = `<?xml version="1.0" encoding="UTF-8"?>
  <scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:conf="http://www.w3.org/2005/scxml-conformance" initial="s0" datamodel="ecmascript" version="1.0">
    <datamodel>
      <data id="Var1"/>
      <data id="Var2"/>
      <data id="Var3">[1,2,3]</data>
    </datamodel>
    <state id="s0">
      <onentry><foreach item="Var1" index="Var2" array="Var3"/><raise event="foo"/></onentry>
      <transition event="error" target="fail"/>
      <transition event="*" target="s1"/>
    </state>
    <state id="s1">
      <onentry><foreach item="Var4" index="Var5" array="Var3"/><raise event="bar"/></onentry>
      <transition event="error" target="fail"/>
      <transition event="*" target="s2"/>
    </state>
    <state id="s2">
      <transition cond="Var4" target="pass"/>
      <transition target="fail"/>
    </state>
    <final id="pass"><onentry><log label="Outcome" expr="'pass'"/></onentry></final>
    <final id="fail"><onentry><log label="Outcome" expr="'fail'"/></onentry></final>
  </scxml>`;

  test('evaluates text-only ECMAScript data content and reaches pass', () => {
    const result = new ScxmlSimulator(w3cChart).initialize().snapshot;
    assert.strictEqual(result.completed, true);
    assert.deepStrictEqual(result.active, ['pass']);
    assert.deepStrictEqual(result.dataModel.Var3, [1, 2, 3]);
    assert.deepStrictEqual(result.logs, ['Outcome: "pass"']);
  });

  test('reuses declared foreach locations and creates undeclared item and index bindings', () => {
    const result = new ScxmlSimulator(w3cChart).initialize().snapshot;
    assert.strictEqual(result.dataModel.Var1, 3);
    assert.strictEqual(result.dataModel.Var2, 2);
    assert.strictEqual(result.dataModel.Var4, 3);
    assert.strictEqual(result.dataModel.Var5, 2);
    assert.ok(!result.trace.some(item => item.event === 'error.execution'));
  });

  test('preserves element-bearing inline data as XML text', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:v="urn:test" version="1.0" datamodel="ecmascript" initial="a"><datamodel><data id="payload"><v:value>ready</v:value></data></datamodel><state id="a"/></scxml>`;
    assert.strictEqual(new ScxmlSimulator(xml).initialize().snapshot.dataModel.payload, '<v:value>ready</v:value>');
  });
});
