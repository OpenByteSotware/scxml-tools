import * as assert from 'assert';
import { createChildState, createParallelRegion, createState, createTransition, deleteState, deleteTransition, updateState, updateTransition } from '../editorEdits';

suite('SCXML property edits', () => {
  const source = `<scxml initial="a"><state id="a"><transition event="go" target="b"/></state><state id="b"/></scxml>`;
  test('renames a state and its references', () => {
    const changed = updateState(source, { oldId: 'b', id: 'done', kind: 'final', initial: false });
    assert.match(changed, /<final id="done"\/>/);
    assert.match(changed, /target="done"/);
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
