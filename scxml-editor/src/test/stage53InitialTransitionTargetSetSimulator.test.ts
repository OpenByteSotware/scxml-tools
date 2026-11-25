import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

describe('Stage 53 explicit initial transition target-set conformance', () => {
  test('enters every target in a root initial transition legal configuration', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript">
      <datamodel><data id="initialRan" expr="false"/></datamodel>
      <initial><transition target="a1 b1"><assign location="initialRan" expr="true"/></transition></initial>
      <parallel id="p"><state id="a"><state id="a1"/><state id="a2"/></state><state id="b"><state id="b1"/><state id="b2"/></state></parallel>
    </scxml>`;
    const result = new ScxmlSimulator(xml).initialize();
    assert.deepStrictEqual(result.snapshot.active, ['a1', 'b1']);
    assert.strictEqual(result.snapshot.dataModel.initialRan, true);
    assert.ok(result.snapshot.trace.some(item => item.targets?.join(' ') === 'a1 b1'));
  });

  test('preserves all targets when a compound-state initial transition enters parallel regions', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="outer"><state id="outer"><initial><transition target="left1 right1"/></initial><parallel id="both"><state id="left"><state id="left1"/><state id="left2"/></state><state id="right"><state id="right1"/><state id="right2"/></state></parallel></state></scxml>`;
    const result = new ScxmlSimulator(xml).initialize();
    assert.deepStrictEqual(result.snapshot.active, ['left1', 'right1']);
  });
});
