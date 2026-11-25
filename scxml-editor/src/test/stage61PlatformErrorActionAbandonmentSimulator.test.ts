import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

const chart = (actions: string) => `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="work"><datamodel><data id="value" expr="0"/></datamodel><state id="work"><onentry>${actions}</onentry><transition event="error.communication" target="pass"/><transition event="after" target="fail"/></state><final id="pass"/><final id="fail"/></scxml>`;

suite('Stage 61 platform-error action abandonment', () => {
  test('unsupported send target abandons the remaining action list', () => {
    const result = new ScxmlSimulator(chart('<send event="go" target="#_missing"/><assign location="value" expr="99"/><raise event="after"/>')).initialize().snapshot;
    assert.deepStrictEqual(result.active, ['pass']);
    assert.strictEqual(result.dataModel.value, 0);
    assert.ok(result.trace.some(item => item.event === 'error.communication' && item.kind === 'scheduled'));
    assert.ok(!result.trace.some(item => item.message === 'Raised internal event after.'));
  });

  test('unsupported processor abandons the remaining action list', () => {
    const result = new ScxmlSimulator(chart('<send event="go" type="urn:unsupported:processor"/><assign location="value" expr="99"/><raise event="after"/>')).initialize().snapshot;
    assert.deepStrictEqual(result.active, ['pass']);
    assert.strictEqual(result.dataModel.value, 0);
    assert.ok(!result.trace.some(item => item.message === 'Raised internal event after.'));
  });

  test('missing external script abandons the remaining action list', () => {
    const result = new ScxmlSimulator(chart('<script src="missing.js"/><assign location="value" expr="99"/><raise event="after"/>'), { resolveScript: () => undefined }).initialize().snapshot;
    assert.deepStrictEqual(result.active, ['pass']);
    assert.strictEqual(result.dataModel.value, 0);
    assert.ok(result.trace.some(item => item.message.includes('script source missing.js could not be resolved')));
    assert.ok(!result.trace.some(item => item.message === 'Raised internal event after.'));
  });

  test('communication failure in a selected if branch propagates outward', () => {
    const result = new ScxmlSimulator(chart('<if cond="true"><send event="go" target="#_missing"/><assign location="value" expr="1"/></if><assign location="value" expr="99"/><raise event="after"/>')).initialize().snapshot;
    assert.deepStrictEqual(result.active, ['pass']);
    assert.strictEqual(result.dataModel.value, 0);
    assert.ok(!result.trace.some(item => item.message === 'Raised internal event after.'));
  });
});
