import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

const chart = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a"><datamodel><data id="value" expr="0"/><data id="result" expr="'unset'"/></datamodel><state id="a"><transition event="run"><if cond="value &lt; 0"><assign location="result" expr="'negative'"/><elseif cond="value === 0"/><assign location="result" expr="'zero'"/><else/><assign location="result" expr="'positive'"/></if></transition></state></scxml>`;

suite('Stage 32 conditional executable-content simulation', () => {
  test('executes the if branch', () => {
    const simulator = new ScxmlSimulator(chart); simulator.initialize(); simulator.editData('value', '-1');
    const result = simulator.dispatch('run').snapshot;
    assert.strictEqual(result.dataModel.result, 'negative');
    assert.ok(result.trace.some(item => item.message === 'If condition value < 0: true'));
  });

  test('executes the first matching elseif branch', () => {
    const simulator = new ScxmlSimulator(chart); simulator.initialize();
    const result = simulator.dispatch('run').snapshot;
    assert.strictEqual(result.dataModel.result, 'zero');
    assert.ok(result.trace.some(item => item.message === 'If condition value === 0: true'));
  });

  test('executes else when no condition matches', () => {
    const simulator = new ScxmlSimulator(chart); simulator.initialize(); simulator.editData('value', '5');
    const result = simulator.dispatch('run').snapshot;
    assert.strictEqual(result.dataModel.result, 'positive');
    assert.ok(result.trace.some(item => item.message === 'If: selected else branch.'));
  });

  test('supports nested if and foreach content', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a"><datamodel><data id="items" expr="[1,2,3]"/><data id="item" expr="0"/><data id="sum" expr="0"/></datamodel><state id="a"><onentry><foreach array="items" item="item"><if cond="item &gt; 1"><assign location="sum" expr="sum + item"/></if></foreach></onentry></state></scxml>`;
    const result = new ScxmlSimulator(xml).initialize().snapshot;
    assert.strictEqual(result.dataModel.sum, 5);
  });
});
