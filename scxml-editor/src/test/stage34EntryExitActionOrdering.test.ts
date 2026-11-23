import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

suite('Stage 34 complete entry and exit action ordering', () => {
  test('initial entry runs compound ancestors before descendants', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="parent"><state id="parent" initial="child"><onentry><log label="enter" expr="'parent'"/></onentry><state id="child"><onentry><log label="enter" expr="'child'"/></onentry></state></state></scxml>`;
    const result=new ScxmlSimulator(xml).initialize().snapshot;
    assert.deepStrictEqual(result.logs,['enter: "parent"','enter: "child"']);
  });

  test('external exit runs descendants before ancestors and entry runs ancestors before descendants', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="outer"><state id="outer" initial="inner"><onexit><log label="exit" expr="'outer'"/></onexit><state id="inner"><onexit><log label="exit" expr="'inner'"/></onexit><transition event="go" target="destination"/></state></state><state id="destination" initial="leaf"><onentry><log label="enter" expr="'destination'"/></onentry><state id="leaf"><onentry><log label="enter" expr="'leaf'"/></onentry></state></state></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    const result=simulator.dispatch('go').snapshot;
    assert.deepStrictEqual(result.logs,['exit: "inner"','exit: "outer"','enter: "destination"','enter: "leaf"']);
  });

  test('internal descendant transition preserves compound source actions', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="parent"><state id="parent" initial="one"><onentry><log label="enter" expr="'parent'"/></onentry><onexit><log label="exit" expr="'parent'"/></onexit><state id="one"><onexit><log label="exit" expr="'one'"/></onexit></state><state id="two"><onentry><log label="enter" expr="'two'"/></onentry></state><transition type="internal" event="next" target="two"/></state></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    const result=simulator.dispatch('next').snapshot;
    assert.deepStrictEqual(result.active,['two']);
    assert.deepStrictEqual(result.logs,['enter: "parent"','exit: "one"','enter: "two"']);
  });

  test('external descendant transition exits and reenters compound source', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="parent"><state id="parent" initial="one"><onentry><log label="enter" expr="'parent'"/></onentry><onexit><log label="exit" expr="'parent'"/></onexit><state id="one"><onexit><log label="exit" expr="'one'"/></onexit></state><state id="two"><onentry><log label="enter" expr="'two'"/></onentry></state><transition type="external" event="next" target="two"/></state></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    const result=simulator.dispatch('next').snapshot;
    assert.deepStrictEqual(result.logs,['enter: "parent"','exit: "one"','exit: "parent"','enter: "parent"','enter: "two"']);
  });

  test('targetless transition executes actions without exit or entry', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a"><state id="a"><onentry><log label="enter" expr="'a'"/></onentry><onexit><log label="exit" expr="'a'"/></onexit><transition event="tick"><log label="transition" expr="'tick'"/></transition></state></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    const result=simulator.dispatch('tick').snapshot;
    assert.deepStrictEqual(result.active,['a']);
    assert.deepStrictEqual(result.logs,['enter: "a"','transition: "tick"']);
  });

  test('parallel region entry and exit use document order', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="outside"><state id="outside"><transition event="enter" target="p"/></state><parallel id="p"><onentry><log label="enter" expr="'p'"/></onentry><onexit><log label="exit" expr="'p'"/></onexit><state id="first"><onentry><log label="enter" expr="'first'"/></onentry><onexit><log label="exit" expr="'first'"/></onexit></state><state id="second"><onentry><log label="enter" expr="'second'"/></onentry><onexit><log label="exit" expr="'second'"/></onexit></state><transition event="leave" target="done"/></parallel><state id="done"/></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize(); simulator.dispatch('enter');
    let result=simulator.dispatch('leave').snapshot;
    assert.deepStrictEqual(result.logs,['enter: "p"','enter: "first"','enter: "second"','exit: "second"','exit: "first"','exit: "p"']);
  });
});
