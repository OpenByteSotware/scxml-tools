import * as assert from 'assert';
import { createChildState, createHistoryState, createParallelRegion, reparentState } from '../editorEdits';

suite('Stage 20 source-preserving hierarchy creation and moves', () => {
  test('adds children without matching fake parent elements in comments or CDATA', () => {
    const source = `<scxml><!-- <state id="parent"/> --><state id="parent"><![CDATA[</state>]]><vendor:keep/></state></scxml>`;
    const changed = createChildState(source, { parentId: 'parent', id: 'child', kind: 'state', initial: true });
    assert.match(changed, /<!-- <state id="parent"\/> -->/);
    assert.match(changed, /CDATA\[<\/state>\]/);
    assert.match(changed, /<vendor:keep\/>[\s\S]*<state id="child"\/>/);
    assert.match(changed, /<state id="parent" initial="child">/);
  });
  test('creates regions and histories as direct children', () => {
    let source = `<scxml><parallel id="p"><vendor:extension><state id="nestedFake"/></vendor:extension></parallel><state id="owner"><state id="fallback"/></state></scxml>`;
    source = createParallelRegion(source, { parallelId: 'p', regionId: 'r', initialStateId: 'r0' });
    source = createHistoryState(source, { parentId: 'owner', id: 'memory', historyType: 'deep', defaultTarget: 'fallback' });
    assert.match(source, /<parallel id="p">[\s\S]*<state id="r" initial="r0">/);
    assert.match(source, /<history id="memory" type="deep">[\s\S]*target="fallback"/);
    assert.match(source, /<vendor:extension><state id="nestedFake"\/><\/vendor:extension>/);
  });
  test('reparents the exact subtree and clears the old parsed initial reference', () => {
    const source = `<scxml><!-- id="child" --><state id="one" initial="child"><vendor:before/><state id="child"><![CDATA[<state id="fake"/>]]><vendor:data/></state><vendor:after/></state><state id="two"/></scxml>`;
    const changed = reparentState(source, { stateId: 'child', newParentId: 'two' });
    assert.match(changed, /<!-- id="child" -->/);
    assert.doesNotMatch(changed, /<state id="one" initial=/);
    assert.match(changed, /<vendor:before\/>[\s\S]*<vendor:after\/>/);
    assert.match(changed, /<state id="two">[\s\S]*<state id="child">[\s\S]*CDATA\[<state id="fake"\/>\][\s\S]*<vendor:data\/>/);
  });
  test('moves a state to the root without using a closing-tag string search', () => {
    const source = `<scxml><state id="one"><state id="child"/></state><content><![CDATA[</scxml>]]></content></scxml>`;
    const changed = reparentState(source, { stateId: 'child', newParentId: '' });
    assert.match(changed, /CDATA\[<\/scxml>\]/);
    assert.match(changed, /<state id="child"\/>[\s\S]*<\/scxml>$/);
  });
});
