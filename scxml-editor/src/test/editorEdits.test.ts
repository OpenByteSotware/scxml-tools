import * as assert from 'assert';
import { createChildState, createHistoryState, createParallelRegion, createState, createTransition, deleteState, deleteTransition, readExecutableContent, reparentState, updateExecutableContent, updateExplicitInitial, updateHistoryState, updateRootProperties, updateState, updateTransition } from '../editorEdits';

suite('SCXML property edits', () => {
  const source = `<scxml initial="a"><state id="a"><transition event="go" target="b"/></state><state id="b"/></scxml>`;
  test('renames a state and its references', () => {
    const changed = updateState(source, { oldId: 'b', id: 'done', kind: 'final', initial: false });
    assert.match(changed, /<final id="done"\/>/);
    assert.match(changed, /target="done"/);
  });

  test('parallel checkbox converts state tags both ways', () => {
    const madeParallel = updateState(`<scxml><state id="work"/></scxml>`, { oldId: 'work', id: 'work', kind: 'state', parallel: true, initial: false });
    assert.match(madeParallel, /<parallel id="work"\/>/);
    const madeState = updateState(madeParallel, { oldId: 'work', id: 'work', kind: 'parallel', parallel: false, initial: false });
    assert.match(madeState, /<state id="work"\/>/);
  });
  test('updates transition properties', () => {
    const changed = updateTransition(source, { stateId: 'a', index: 0, event: 'next', cond: 'ready', targets: 'b' });
    assert.match(changed, /event="next"/);
    assert.match(changed, /cond="ready"/);
  });
});

suite('SCXML create and delete', () => {
  const source = `<scxml initial="a"><state id="a"><transition event="go" target="b"/></state><state id="b"/></scxml>`;
  test('creates and deletes states', () => {
    const created = createState(source, { id: 'c', kind: 'final', initial: false });
    assert.match(created, /<final id="c"\/>/);
    const deleted = deleteState(created, 'b');
    assert.doesNotMatch(deleted, /id="b"/);
    assert.doesNotMatch(deleted, /target="b"/);
  });
  test('creates and deletes transitions', () => {
    const created = createTransition(source, { stateId: 'b', event: 'reset', cond: '', targets: 'a' });
    assert.match(created, /event="reset"/);
    const deleted = deleteTransition(created, 'b', 0);
    assert.doesNotMatch(deleted, /event="reset"/);
  });
});

suite('SCXML compound states', () => {
  test('adds an initial child to a simple state', () => {
    const source = `<scxml><state id="parent"/></scxml>`;
    const changed = createChildState(source, { parentId: 'parent', id: 'child', kind: 'state', initial: true });
    assert.match(changed, /<state id="parent" initial="child">/);
    assert.match(changed, /<state id="child"\/>/);
  });
  test('rejects children in final states', () => {
    assert.throws(() => createChildState(`<scxml><final id="done"/></scxml>`, { parentId: 'done', id: 'bad', kind: 'state', initial: false }));
  });
});

suite('SCXML parallel regions and deep recursion', () => {
  test('creates parallel regions with initial children', () => {
    let text = `<scxml><parallel id="system"/></scxml>`;
    text = createParallelRegion(text, { parallelId: 'system', regionId: 'communications', initialStateId: 'offline' });
    text = createParallelRegion(text, { parallelId: 'system', regionId: 'processing', initialStateId: 'idle' });
    assert.match(text, /<parallel id="system">/);
    assert.match(text, /<state id="communications" initial="offline">/);
    assert.match(text, /<state id="processing" initial="idle">/);
  });
  test('supports at least 30 recursive substates', () => {
    let text = `<scxml><state id="level0"/></scxml>`;
    for (let depth = 1; depth <= 30; depth++) { text = createChildState(text, { parentId: `level${depth - 1}`, id: `level${depth}`, kind: 'state', initial: true }); }
    assert.match(text, /id="level30"/);
  });
});

suite('SCXML drag reparenting', () => {
  test('moves a top-level state into a compound state', () => {
    const source = `<scxml><state id="container"/><state id="child"/></scxml>`;
    const changed = reparentState(source, { stateId: 'child', newParentId: 'container' });
    assert.match(changed, /<state id="container">[\s\S]*<state id="child"\/>[\s\S]*<\/state>/);
  });
  test('rejects moving a parent into its descendant', () => {
    const source = `<scxml><state id="parent"><state id="child"/></state></scxml>`;
    assert.throws(() => reparentState(source, { stateId: 'parent', newParentId: 'child' }));
  });

  test('moves a nested state back to the SCXML root', () => {
    const source = `<scxml><state id="parent" initial="child"><state id="child"/></state></scxml>`;
    const changed = reparentState(source, { stateId: 'child', newParentId: '' });
    assert.match(changed, /<state id="parent">\s*<\/state>/);
    assert.match(changed, /<state id="child"\/>\s*<\/scxml>/);
    assert.doesNotMatch(changed, /initial="child"/);
  });
  test('moves a nested state between parents', () => {
    const source = `<scxml><state id="one"><state id="child"/></state><state id="two"/></scxml>`;
    const changed = reparentState(source, { stateId: 'child', newParentId: 'two' });
    assert.match(changed, /<state id="two">[\s\S]*<state id="child"\/>[\s\S]*<\/state>/);
  });
});

suite('Initial state scopes', () => {
  test('sets nested initial on compound parent and replaces sibling', () => {
    const source = `<scxml><state id="parent" initial="one"><state id="one"/><state id="two"/></state></scxml>`;
    const changed = updateState(source, { oldId: 'two', id: 'two', kind: 'state', initial: true });
    assert.match(changed, /<state id="parent" initial="two">/);
    assert.doesNotMatch(changed, /initial="one"/);
  });
  test('parallel direct regions do not add a parallel initial attribute', () => {
    const source = `<scxml><parallel id="p"><state id="r1"/><state id="r2"/></parallel></scxml>`;
    const changed = updateState(source, { oldId: 'r2', id: 'r2', kind: 'state', initial: true });
    assert.doesNotMatch(changed, /<parallel[^>]*initial=/);
  });
});

suite('SCXML history states', () => {
  test('creates shallow history with a default transition', () => {
    const source = `<scxml><state id="parent"><state id="one"/></state></scxml>`;
    const changed = createHistoryState(source, { parentId: 'parent', id: 'recent', historyType: 'shallow', defaultTarget: 'one' });
    assert.match(changed, /<history id="recent" type="shallow">[\s\S]*<transition target="one"\/>[\s\S]*<\/history>/);
  });
  test('creates and updates deep history', () => {
    let text = `<scxml><state id="parent"><state id="one"/></state></scxml>`;
    text = createHistoryState(text, { parentId: 'parent', id: 'memory', historyType: 'shallow' });
    text = updateHistoryState(text, { id: 'memory', historyType: 'deep', defaultTarget: 'one' });
    assert.match(text, /<history id="memory" type="deep">/);
    assert.match(text, /target="one"/);
  });
});

suite('Stage 1 root properties and explicit initial transitions', () => {
  test('updates SCXML root properties', () => {
    const source = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"><state id="idle"/></scxml>`;
    const changed = updateRootProperties(source, { name: 'Machine', version: '1.0', namespace: 'http://www.w3.org/2005/07/scxml', datamodel: 'ecmascript', binding: 'late', xmlBase: 'machines/', initialTarget: 'idle', explicitInitial: false });
    assert.match(changed, /name="Machine"/);
    assert.match(changed, /datamodel="ecmascript"/);
    assert.match(changed, /binding="late"/);
    assert.match(changed, /xml:base="machines\/"/);
    assert.match(changed, /initial="idle"/);
  });
  test('creates an explicit root initial transition', () => {
    const source = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="idle"><state id="idle"/></scxml>`;
    const changed = updateRootProperties(source, { version: '1.0', namespace: 'http://www.w3.org/2005/07/scxml', initialTarget: 'idle', explicitInitial: true, initialCond: 'ready' });
    assert.doesNotMatch(changed, /<scxml[^>]* initial=/);
    assert.match(changed, /<initial>[\s\S]*<transition target="idle" cond="ready"\/>[\s\S]*<\/initial>/);
  });
  test('creates and removes a compound-state explicit initial transition', () => {
    const source = `<scxml><state id="parent" initial="one"><state id="one"/><state id="two"/></state></scxml>`;
    const explicit = updateExplicitInitial(source, { scopeId: 'parent', target: 'two', cond: 'enabled', explicit: true });
    assert.match(explicit, /<state id="parent">[\s\S]*<initial>[\s\S]*target="two" cond="enabled"/);
    const attribute = updateExplicitInitial(explicit, { scopeId: 'parent', target: 'one', explicit: false });
    assert.match(attribute, /<state id="parent" initial="one">/);
    assert.doesNotMatch(attribute, /<initial>/);
  });
});

suite('Stage 2 executable content', () => {
  test('adds ordered onentry and onexit actions', () => {
    let text = `<scxml><state id="idle"/></scxml>`;
    text = updateExecutableContent(text, { stateId: 'idle', location: 'onentry', xml: `<log label="enter" expr="count"/>\n<raise event="ready"/>` });
    text = updateExecutableContent(text, { stateId: 'idle', location: 'onexit', xml: `<assign location="count" expr="count + 1"/>` });
    assert.match(text, /<onentry>[\s\S]*<log[\s\S]*<raise[\s\S]*<\/onentry>/);
    assert.match(text, /<onexit>[\s\S]*<assign[\s\S]*<\/onexit>/);
    assert.match(readExecutableContent(text, 'idle', 'onentry'), /^<log[\s\S]*<raise/);
  });
  test('adds executable actions to a transition and preserves attributes', () => {
    const source = `<scxml><state id="a"><transition event="go" target="b"/></state><state id="b"/></scxml>`;
    const changed = updateExecutableContent(source, { stateId: 'a', location: 'transition', transitionIndex: 0, xml: `<log label="route" expr="_event.name"/>` });
    assert.match(changed, /<transition event="go" target="b">[\s\S]*<log[\s\S]*<\/transition>/);
  });
  test('validates required action attributes', () => {
    assert.throws(() => updateExecutableContent(`<scxml><state id="a"/></scxml>`, { stateId: 'a', location: 'onentry', xml: `<raise/>` }), /event attribute/);
    assert.throws(() => updateExecutableContent(`<scxml><state id="a"/></scxml>`, { stateId: 'a', location: 'onentry', xml: `<assign expr="1"/>` }), /location attribute/);
  });
  test('removes an executable block when cleared', () => {
    const source = `<scxml><state id="a"><onentry><raise event="go"/></onentry></state></scxml>`;
    const changed = updateExecutableContent(source, { stateId: 'a', location: 'onentry', xml: '' });
    assert.doesNotMatch(changed, /<onentry>/);
  });
});

suite('Stage 3 conditional and iterative executable content', () => {
  test('accepts nested if, elseif, else, and foreach actions', () => {
    const xml = `<if cond="ready"><log label="ready" expr="count"/><elseif cond="waiting"/><raise event="wait"/><else/><foreach array="items" item="item" index="index"><assign location="last" expr="item"/></foreach></if>`;
    const changed = updateExecutableContent(`<scxml><state id="a"/></scxml>`, { stateId: 'a', location: 'onentry', xml });
    assert.match(changed, /<if cond="ready">[\s\S]*<elseif cond="waiting"\/>[\s\S]*<else\/>[\s\S]*<foreach array="items" item="item" index="index">/);
  });
  test('requires conditions and foreach collection variables', () => {
    const base = `<scxml><state id="a"/></scxml>`;
    assert.throws(() => updateExecutableContent(base, { stateId: 'a', location: 'onentry', xml: `<if><raise event="x"/></if>` }), /cond attribute/);
    assert.throws(() => updateExecutableContent(base, { stateId: 'a', location: 'onentry', xml: `<foreach item="item"><log expr="item"/></foreach>` }), /array attribute/);
    assert.throws(() => updateExecutableContent(base, { stateId: 'a', location: 'onentry', xml: `<foreach array="items"><log expr="item"/></foreach>` }), /item attribute/);
  });
  test('rejects else and elseif outside a direct if branch', () => {
    const base = `<scxml><state id="a"/></scxml>`;
    assert.throws(() => updateExecutableContent(base, { stateId: 'a', location: 'onentry', xml: `<else/>` }), /direct child of if/);
    assert.throws(() => updateExecutableContent(base, { stateId: 'a', location: 'onentry', xml: `<if cond="x"><else/><elseif cond="y"/></if>` }), /after else/);
  });
});

suite('State and history deletion', () => {
  test('deletes nested history and clears references to it', () => {
    const source = `<scxml><state id="parent"><history id="recent" type="shallow"><transition target="child"/></history><state id="child"><transition target="recent"/></state></state></scxml>`;
    const changed = deleteState(source, 'recent');
    assert.doesNotMatch(changed, /<history\b/);
    assert.doesNotMatch(changed, /target="recent"/);
    assert.match(changed, /<state id="child">/);
  });
  test('deletes a compound state as one subtree', () => {
    const source = `<scxml><state id="outer"><state id="inner"><history id="memory" type="deep"/></state></state><state id="other"/></scxml>`;
    const changed = deleteState(source, 'outer');
    assert.doesNotMatch(changed, /id="outer"|id="inner"|id="memory"/);
    assert.match(changed, /id="other"/);
  });
});
