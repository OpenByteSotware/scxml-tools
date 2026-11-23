import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

suite('Stage 38 state-local data models and binding', () => {
  test('early binding initializes all state data before initial entry', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" binding="early" initial="a"><datamodel><data id="root" expr="1"/></datamodel><state id="a"><onentry><assign location="observed" expr="future"/></onentry><datamodel><data id="observed" expr="0"/></datamodel><transition event="go" target="b"/></state><state id="b"><datamodel><data id="future" expr="root + 4"/></datamodel></state></scxml>`;
    const result=new ScxmlSimulator(xml).initialize().snapshot;
    assert.strictEqual(result.dataModel.root,1);
    assert.strictEqual(result.dataModel.future,5);
    assert.strictEqual(result.dataModel.observed,5);
  });

  test('late binding initializes state data immediately before onentry', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" binding="late" initial="a"><datamodel><data id="root" expr="2"/></datamodel><state id="a"><datamodel><data id="local" expr="root + 1"/></datamodel><onentry><assign location="local" expr="local * 2"/></onentry><transition event="go" target="b"/></state><state id="b"><datamodel><data id="later" expr="local + 1"/></datamodel></state></scxml>`;
    const simulator=new ScxmlSimulator(xml);
    let result=simulator.initialize().snapshot;
    assert.strictEqual(result.dataModel.local,6);
    assert.ok(!Object.prototype.hasOwnProperty.call(result.dataModel,'later'));
    result=simulator.dispatch('go').snapshot;
    assert.strictEqual(result.dataModel.later,7);
  });

  test('late-bound declarations initialize only once across reentry', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" binding="late" initial="outside"><datamodel><data id="seed" expr="0"/></datamodel><state id="outside"><transition event="enter" target="work"><assign location="seed" expr="seed + 1"/></transition></state><state id="work"><datamodel><data id="local" expr="seed"/></datamodel><transition event="leave" target="outside"><assign location="local" expr="99"/></transition></state></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    assert.strictEqual(simulator.dispatch('enter').snapshot.dataModel.local,1);
    simulator.dispatch('leave');
    const result=simulator.dispatch('enter').snapshot;
    assert.strictEqual(result.dataModel.seed,2);
    assert.strictEqual(result.dataModel.local,99);
  });

  test('parallel late binding initializes regions in document order', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" binding="late" initial="p"><datamodel><data id="order" expr="''"/></datamodel><parallel id="p"><datamodel><data id="parentValue" expr="1"/></datamodel><state id="first"><datamodel><data id="firstValue" expr="parentValue + 1"/></datamodel><onentry><assign location="order" expr="order + 'A'"/></onentry></state><state id="second"><datamodel><data id="secondValue" expr="firstValue + 1"/></datamodel><onentry><assign location="order" expr="order + 'B'"/></onentry></state></parallel></scxml>`;
    const result=new ScxmlSimulator(xml).initialize().snapshot;
    assert.strictEqual(result.dataModel.parentValue,1);
    assert.strictEqual(result.dataModel.firstValue,2);
    assert.strictEqual(result.dataModel.secondValue,3);
    assert.strictEqual(result.dataModel.order,'AB');
  });

  test('preserves inline data and reports unsupported external src', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" binding="early" initial="a"><datamodel><data id="payload"><value>ready</value></data><data id="external" src="config.json"/></datamodel><state id="a"/></scxml>`;
    const result=new ScxmlSimulator(xml).initialize().snapshot;
    assert.strictEqual(result.dataModel.payload,'<value>ready</value>');
    assert.strictEqual(result.dataModel.external,undefined);
    assert.ok(result.trace.some(item=>item.message.includes('external src config.json is not loaded')));
  });
});
