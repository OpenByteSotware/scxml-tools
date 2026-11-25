import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

suite('Stage 65 history default target-set entry', () => {
  test('enters a shallow-history multi-target fallback as one configuration', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="outside"><state id="outside"><transition event="enter" target="memory"/></state><parallel id="owner"><history id="memory" type="shallow"><transition target="left right"/></history><state id="left"/><state id="right"/></parallel></scxml>`;
    const simulator = new ScxmlSimulator(xml);
    simulator.initialize();
    assert.deepStrictEqual(simulator.dispatch('enter').snapshot.active, ['left', 'right']);
  });

  test('completes uncovered sibling regions when a deep-history fallback targets one descendant', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="outside"><state id="outside"><transition event="enter" target="memory"/></state><parallel id="owner"><history id="memory" type="deep"><transition target="left2"/></history><state id="left" initial="left1"><state id="left1"/><state id="left2"/></state><state id="right" initial="right1"><state id="right1"/></state></parallel></scxml>`;
    const simulator = new ScxmlSimulator(xml);
    simulator.initialize();
    assert.deepStrictEqual(simulator.dispatch('enter').snapshot.active, ['left2', 'right1']);
  });

  test('executes fallback actions before entering the combined target set', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="outside"><datamodel><data id="order" expr="''"/></datamodel><state id="outside"><transition event="enter" target="memory"/></state><parallel id="owner"><history id="memory" type="deep"><transition target="left1 right1"><assign location="order" expr="order + 'H'"/></transition></history><state id="left" initial="left1"><state id="left1"><onentry><assign location="order" expr="order + 'L'"/></onentry></state></state><state id="right" initial="right1"><state id="right1"><onentry><assign location="order" expr="order + 'R'"/></onentry></state></state></parallel></scxml>`;
    const simulator = new ScxmlSimulator(xml);
    simulator.initialize();
    const snapshot = simulator.dispatch('enter').snapshot;
    assert.deepStrictEqual(snapshot.active, ['left1', 'right1']);
    assert.strictEqual(snapshot.dataModel.order, 'HLR');
  });
});
