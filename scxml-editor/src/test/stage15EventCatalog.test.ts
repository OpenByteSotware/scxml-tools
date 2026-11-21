import * as assert from 'assert';
import { parseScxml } from '../scxml';

suite('Stage 15 event production validation', () => {
  const root = (body: string) => `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a"><state id="a"><onentry>${body}</onentry></state></scxml>`;
  test('rejects wildcard and descriptor-list events produced by raise and send', () => {
    assert.ok(parseScxml(root(`<raise event="door.*"/>`)).errors.some(item => /concrete event name/.test(item)));
    assert.ok(parseScxml(root(`<send event="door.open door.close"/>`)).errors.some(item => /one event name/.test(item)));
  });
  test('accepts concrete dot-separated event names', () => {
    const model = parseScxml(root(`<raise event="door.open"/><send event="door.closed"/>`));
    assert.ok(!model.errors.some(item => /invalid event name|concrete event name|one event name/.test(item)));
  });
});
