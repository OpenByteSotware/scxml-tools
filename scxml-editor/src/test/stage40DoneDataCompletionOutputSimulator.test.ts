import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

suite('Stage 40 done data and completion output', () => {
  test('attaches expression donedata to done.state event data', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="work"><datamodel><data id="answer" expr="42"/><data id="seen" expr="0"/></datamodel><state id="work" initial="run"><state id="run"><transition event="finish" target="finished"/></state><final id="finished"><donedata><content expr="{ value: answer }"/></donedata></final><transition event="done.state.work" target="success"><assign location="seen" expr="_event.data.value"/></transition></state><final id="success"/></scxml>`;
    const result=new ScxmlSimulator(xml).initialize();
    const completed=new ScxmlSimulator(xml);completed.initialize();
    const snapshot=completed.dispatch('finish').snapshot;
    assert.strictEqual(snapshot.dataModel.seen,42);
    assert.strictEqual(snapshot.completed,true);
  });

  test('builds parameter donedata from expressions and locations', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a"><datamodel><data id="value" expr="7"/><data id="copy" expr="9"/></datamodel><state id="a"><transition event="finish" target="done"/></state><final id="done"><donedata><param name="double" expr="value * 2"/><param name="reference" location="copy"/></donedata></final></scxml>`;
    const simulator=new ScxmlSimulator(xml);simulator.initialize();
    assert.deepStrictEqual(simulator.dispatch('finish').snapshot.completionOutput,{double:14,reference:9});
  });

  test('preserves inline donedata content as completion output', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a"><state id="a"><transition event="finish" target="done"/></state><final id="done"><donedata><content><result status="ok"/></content></donedata></final></scxml>`;
    const simulator=new ScxmlSimulator(xml);simulator.initialize();
    assert.strictEqual(simulator.dispatch('finish').snapshot.completionOutput,'<result status="ok"/>');
  });

  test('top-level expression output is exposed by the completed snapshot', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a"><datamodel><data id="result" expr="'accepted'"/></datamodel><state id="a"><transition event="finish" target="done"/></state><final id="done"><donedata><content expr="result"/></donedata></final></scxml>`;
    const simulator=new ScxmlSimulator(xml);simulator.initialize();
    const snapshot=simulator.dispatch('finish').snapshot;
    assert.strictEqual(snapshot.completed,true);
    assert.strictEqual(snapshot.completionOutput,'accepted');
  });
});
