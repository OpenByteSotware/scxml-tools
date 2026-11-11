import * as assert from 'assert';
import { updateState, updateTransition } from '../editorEdits';

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
