import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

suite('Stage 66 stored-history target-set restoration', () => {
  test('restores a deep parallel history configuration as one target set', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="outside"><state id="outside"><transition event="enter" target="memory"/></state><parallel id="owner"><history id="memory" type="deep"><transition target="left1 right1"/></history><state id="left" initial="left1"><state id="left1"><transition event="advance" target="left2"/></state><state id="left2"/></state><state id="right" initial="right1"><state id="right1"><transition event="advance" target="right2"/></state><state id="right2"/></state><transition event="leave" target="outside"/></parallel></scxml>`;
    const simulator = new ScxmlSimulator(xml);
    simulator.initialize();
    simulator.dispatch('enter');
    assert.deepStrictEqual(simulator.dispatch('advance').snapshot.active, ['left2', 'right2']);
    simulator.dispatch('leave');
    assert.deepStrictEqual(simulator.dispatch('enter').snapshot.active, ['left2', 'right2']);
  });

  test('fills a newly added uncovered parallel region during stored deep-history restoration', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="outside"><state id="outside"><transition event="enter" target="memory"/></state><parallel id="owner"><history id="memory" type="deep"><transition target="left1"/></history><state id="left" initial="left1"><state id="left1"><transition event="next" target="left2"/></state><state id="left2"/></state><state id="right" initial="right1"><state id="right1"/></state><transition event="leave" target="outside"/></parallel></scxml>`;
    const simulator = new ScxmlSimulator(xml);
    simulator.initialize();
    simulator.dispatch('enter');
    simulator.dispatch('next');
    simulator.dispatch('leave');
    assert.deepStrictEqual(simulator.dispatch('enter').snapshot.active, ['left2', 'right1']);
  });

  test('enters shared ancestors once when restoring multiple stored atomic states', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="outside"><datamodel><data id="entries" expr="0"/></datamodel><state id="outside"><transition event="enter" target="memory"/></state><parallel id="owner"><onentry><assign location="entries" expr="entries + 1"/></onentry><history id="memory" type="deep"><transition target="left right"/></history><state id="left"/><state id="right"/><transition event="leave" target="outside"/></parallel></scxml>`;
    const simulator = new ScxmlSimulator(xml);
    simulator.initialize();
    simulator.dispatch('enter');
    simulator.dispatch('leave');
    const snapshot = simulator.dispatch('enter').snapshot;
    assert.deepStrictEqual(snapshot.active, ['left', 'right']);
    assert.strictEqual(snapshot.dataModel.entries, 2);
  });
});
