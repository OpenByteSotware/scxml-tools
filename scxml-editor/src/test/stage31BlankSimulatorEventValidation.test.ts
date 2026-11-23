import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Stage 31 blank simulator event validation', () => {
  test('keeps blank-event validation inside the simulator panel', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    for (const token of [
      'id="simulator-event-message"',
      'simulator-input-error',
      'Please enter valid transition name.',
      "if(!eventName){simulatorEvent?.classList.add('simulator-input-error')",
      "command:'simulationInputError'",
      "if(event.data?.command==='simulationInputError')"
    ]) {
      assert.ok(source.includes(token), token);
    }
    const senderStart = source.indexOf('const sendSimulatorEvent=');
    const senderEnd = source.indexOf("document.getElementById('simulator-send')", senderStart);
    const sender = source.slice(senderStart, senderEnd);
    assert.ok(sender.includes('return;'), sender);
    assert.ok(sender.indexOf('return;') < sender.indexOf("vscode.postMessage({command:'simulationEvent'"), sender);
  });
});
