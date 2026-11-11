import * as vscode from 'vscode';
import { parseScxml, ScxmlModel, StateNode } from './scxml';

const diagnostics = vscode.languages.createDiagnosticCollection('scxml');
type Point = { x: number; y: number };
type Layout = Record<string, Point>;

export function activate(context: vscode.ExtensionContext): void {
  const provider = new StateChartEditorProvider(context);
  context.subscriptions.push(
    diagnostics,
    vscode.window.registerCustomEditorProvider('scxml.stateChart', provider, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('scxml.openDiagram', async () => {
      const uri = vscode.window.activeTextEditor?.document.uri;
      if (uri) { await vscode.commands.executeCommand('vscode.openWith', uri, 'scxml.stateChart'); }
    }),
    vscode.commands.registerCommand('scxml.createDocument', createDocument),
    vscode.workspace.onDidOpenTextDocument(validateDocument),
    vscode.workspace.onDidChangeTextDocument(event => validateDocument(event.document)),
    vscode.workspace.onDidCloseTextDocument(document => diagnostics.delete(document.uri))
  );
  vscode.workspace.textDocuments.forEach(validateDocument);
}

export function deactivate(): void {}

async function createDocument(): Promise<void> {
  const document = await vscode.workspace.openTextDocument({ language: 'scxml', content: sampleDocument() });
  await vscode.window.showTextDocument(document);
}

function validateDocument(document: vscode.TextDocument): void {
  if (document.languageId !== 'scxml' && !document.fileName.endsWith('.scxml')) { return; }
  const model = parseScxml(document.getText());
  diagnostics.set(document.uri, model.errors.map(message => new vscode.Diagnostic(
    new vscode.Range(0, 0, 0, Math.max(1, document.lineAt(0).text.length)), message, vscode.DiagnosticSeverity.Error
  )));
}

class StateChartEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    panel.webview.options = { enableScripts: true };
    const storageKey = `scxml.layout:${document.uri.toString()}`;
    let layout = this.context.workspaceState.get<Layout>(storageKey, {});
    const update = () => { panel.webview.html = renderPage(parseScxml(document.getText()), document.fileName, layout); };
    update();

    const change = vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.uri.toString() === document.uri.toString()) { update(); }
    });
    panel.onDidDispose(() => change.dispose());
    panel.webview.onDidReceiveMessage(async message => {
      if (message.command === 'showSource') {
        await vscode.window.showTextDocument(document, { preview: false });
      } else if (message.command === 'saveLayout' && message.positions) {
        layout = message.positions as Layout;
        await this.context.workspaceState.update(storageKey, layout);
      } else if (message.command === 'resetLayout') {
        layout = {};
        await this.context.workspaceState.update(storageKey, layout);
        update();
      }
    });
  }
}

function renderPage(model: ScxmlModel, fileName: string, savedLayout: Layout): string {
  const allStates: StateNode[] = [];
  const collect = (state: StateNode) => { allStates.push(state); state.children.forEach(collect); };
  model.states.forEach(collect);

  const width = 1200; const boxWidth = 210; const boxHeight = 86; const gapX = 80; const gapY = 60;
  const columns = Math.max(1, Math.floor(width / (boxWidth + gapX)));
  const positions = new Map<string, Point>();
  allStates.forEach((state, index) => positions.set(state.id, savedLayout[state.id] ?? {
    x: 40 + (index % columns) * (boxWidth + gapX),
    y: 55 + Math.floor(index / columns) * (boxHeight + gapY)
  }));
  const maxX = Math.max(width, ...[...positions.values()].map(p => p.x + boxWidth + 80));
  const maxY = Math.max(420, ...[...positions.values()].map(p => p.y + boxHeight + 100));

  const edges = allStates.flatMap(source => source.transitions.flatMap((transition, transitionIndex) => transition.targets.map((target, targetIndex) => {
    if (!positions.has(target)) { return ''; }
    const label = escapeHtml([transition.event, transition.cond ? `[${transition.cond}]` : ''].filter(Boolean).join(' '));
    return `<g class="edge-group" data-source="${escapeHtml(source.id)}" data-target="${escapeHtml(target)}"><path id="edge-${safeId(source.id)}-${transitionIndex}-${targetIndex}" class="edge" marker-end="url(#arrow)"/><text class="label">${label}</text></g>`;
  })));

  const nodes = allStates.map(state => {
    const p = positions.get(state.id)!; const initial = model.initial === state.id ? ' initial' : '';
    return `<g class="state" data-id="${escapeHtml(state.id)}" transform="translate(${p.x} ${p.y})"><rect width="${boxWidth}" height="${boxHeight}" rx="14" class="node ${state.kind}${initial}"/><text x="16" y="31" class="title">${escapeHtml(state.id)}</text><text x="16" y="57" class="kind">${state.kind}</text></g>`;
  }).join('');

  const initialPositions = JSON.stringify(Object.fromEntries(positions)).replace(/</g, '\\u003c');
  const problems = model.errors.length
    ? `<div class="problems"><strong>Problems</strong><ul>${model.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>`
    : '<div class="ok">No structural problems found.</div>';

  return `<!doctype html><html><head><meta charset="UTF-8"><style>
    body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0;user-select:none}.bar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background)}button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;padding:7px 12px;cursor:pointer}.hint{color:var(--vscode-descriptionForeground);margin-left:auto}.canvas{overflow:auto;padding:12px}.state{cursor:grab}.state.dragging{cursor:grabbing}.node{fill:var(--vscode-editorWidget-background);stroke:var(--vscode-focusBorder);stroke-width:2}.state:hover .node{stroke-width:3}.node.final{stroke:#3fb950;stroke-width:4}.node.parallel{stroke:#d29922}.node.initial{filter:drop-shadow(0 0 5px var(--vscode-focusBorder))}.title{fill:var(--vscode-foreground);font-size:15px;font-weight:600;pointer-events:none}.kind,.label{fill:var(--vscode-descriptionForeground);font-size:12px;pointer-events:none}.edge{fill:none;stroke:var(--vscode-descriptionForeground);stroke-width:1.6}.problems{margin:12px 16px;padding:10px;border-left:4px solid var(--vscode-errorForeground);background:var(--vscode-textBlockQuote-background);user-select:text}.ok{margin:12px 16px;color:var(--vscode-testing-iconPassed)}
  </style></head><body><div class="bar"><strong>${escapeHtml(model.name || 'SCXML State Chart')}</strong><span>${escapeHtml(fileName)}</span><button id="source">Show XML Source</button><button id="reset">Reset Layout</button><span class="hint">Drag states to arrange the chart. Positions are saved for this workspace.</span></div>${problems}<div class="canvas"><svg id="chart" width="${maxX}" height="${maxY}" viewBox="0 0 ${maxX} ${maxY}"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="var(--vscode-descriptionForeground)"/></marker></defs>${edges.join('')}${nodes}</svg></div><script>
    const vscode=acquireVsCodeApi();
    const positions=${initialPositions}; const boxWidth=${boxWidth}; const boxHeight=${boxHeight};
    const svg=document.getElementById('chart'); let drag=null;
    const svgPoint=(event)=>{const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;return point.matrixTransform(svg.getScreenCTM().inverse());};
    function updateEdges(){document.querySelectorAll('.edge-group').forEach(group=>{const a=positions[group.dataset.source],b=positions[group.dataset.target];if(!a||!b)return;const x1=a.x+boxWidth,y1=a.y+boxHeight/2,x2=b.x,y2=b.y+boxHeight/2;const path=group.querySelector('path');path.setAttribute('d',\`M \${x1} \${y1} C \${x1+55} \${y1}, \${x2-55} \${y2}, \${x2} \${y2}\`);const label=group.querySelector('text');label.setAttribute('x',String((x1+x2)/2));label.setAttribute('y',String((y1+y2)/2-8));});}
    document.querySelectorAll('.state').forEach(node=>{node.addEventListener('pointerdown',event=>{event.preventDefault();node.setPointerCapture(event.pointerId);const p=svgPoint(event),current=positions[node.dataset.id];drag={node,id:node.dataset.id,dx:p.x-current.x,dy:p.y-current.y};node.classList.add('dragging');});node.addEventListener('pointermove',event=>{if(!drag||drag.node!==node)return;const p=svgPoint(event);const x=Math.max(10,p.x-drag.dx),y=Math.max(10,p.y-drag.dy);positions[drag.id]={x,y};node.setAttribute('transform',\`translate(\${x} \${y})\`);updateEdges();});node.addEventListener('pointerup',()=>{if(!drag)return;drag.node.classList.remove('dragging');drag=null;vscode.postMessage({command:'saveLayout',positions});});node.addEventListener('pointercancel',()=>{if(drag){drag.node.classList.remove('dragging');drag=null;}});});
    updateEdges(); document.getElementById('source').addEventListener('click',()=>vscode.postMessage({command:'showSource'}));document.getElementById('reset').addEventListener('click',()=>vscode.postMessage({command:'resetLayout'}));
  </script></body></html>`;
}

function safeId(value: string): string { return value.replace(/[^A-Za-z0-9_-]/g, '_'); }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
function sampleDocument(): string { return `<?xml version="1.0" encoding="UTF-8"?>\n<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" name="DoorController" initial="closed">\n  <state id="closed">\n    <transition event="open" target="opened"/>\n  </state>\n  <state id="opened">\n    <transition event="close" target="closed"/>\n  </state>\n</scxml>\n`; }
