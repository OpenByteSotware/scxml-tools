import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

suite('Stage 36 explicit initial transition execution', () => {
  test('executes root initial transition actions before target onentry', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript"><datamodel><data id="value" expr="0"/></datamodel><initial><transition target="a"><assign location="value" expr="1"/><log label="initial" expr="value"/></transition></initial><state id="a"><onentry><assign location="value" expr="value + 1"/><log label="entry" expr="value"/></onentry></state></scxml>`;
    const result=new ScxmlSimulator(xml).initialize().snapshot;
    assert.deepStrictEqual(result.active,['a']);
    assert.strictEqual(result.dataModel.value,2);
    assert.deepStrictEqual(result.logs,['initial: 1','entry: 2']);
    assert.ok(result.trace.some(item=>item.message==='Executing explicit initial transition for SCXML root -> a.'));
  });

  test('orders parent onentry before compound initial actions and child onentry', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="parent"><datamodel><data id="order" expr="''"/></datamodel><state id="parent"><onentry><assign location="order" expr="order + 'P'"/></onentry><initial><transition target="child"><assign location="order" expr="order + 'I'"/></transition></initial><state id="child"><onentry><assign location="order" expr="order + 'C'"/></onentry></state></state></scxml>`;
    const result=new ScxmlSimulator(xml).initialize().snapshot;
    assert.deepStrictEqual(result.active,['child']);
    assert.strictEqual(result.dataModel.order,'PIC');
  });

  test('executes nested explicit initial transitions in hierarchy order', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="outer"><datamodel><data id="order" expr="''"/></datamodel><state id="outer"><onentry><assign location="order" expr="order + 'O'"/></onentry><initial><transition target="inner"><assign location="order" expr="order + '1'"/></transition></initial><state id="inner"><onentry><assign location="order" expr="order + 'N'"/></onentry><initial><transition target="leaf"><assign location="order" expr="order + '2'"/></transition></initial><state id="leaf"><onentry><assign location="order" expr="order + 'L'"/></onentry></state></state></state></scxml>`;
    const result=new ScxmlSimulator(xml).initialize().snapshot;
    assert.deepStrictEqual(result.active,['leaf']);
    assert.strictEqual(result.dataModel.order,'O1N2L');
  });

  test('executes explicit initial actions on later compound-state entry', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="outside"><datamodel><data id="count" expr="0"/></datamodel><state id="outside"><transition event="enter" target="parent"/></state><state id="parent"><initial><transition target="child"><assign location="count" expr="count + 1"/></transition></initial><state id="child"/></state></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    const result=simulator.dispatch('enter').snapshot;
    assert.deepStrictEqual(result.active,['child']);
    assert.strictEqual(result.dataModel.count,1);
  });

  test('attribute initial form does not report or execute an explicit transition', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="parent"><state id="parent" initial="child"><state id="child"/></state></scxml>`;
    const result=new ScxmlSimulator(xml).initialize().snapshot;
    assert.deepStrictEqual(result.active,['child']);
    assert.ok(!result.trace.some(item=>item.message.startsWith('Executing explicit initial transition')));
  });
});
