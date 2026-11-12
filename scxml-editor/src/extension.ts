import * as vscode from 'vscode';
import { parseScxml, ScxmlModel, StateNode } from './scxml';
import { createChildState, createParallelRegion, createState, createTransition, deleteState, deleteTransition, updateState, updateTransition } from './editorEdits';

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
    vscode.commands.registerCommand('scxml.newFile', createScxmlFile),
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

async function createScxmlFile(): Promise<void> {
  const defaultUri = vscode.workspace.workspaceFolders?.[0]
    ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'untitled.scxml')
    : undefined;
  const uri = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { 'SCXML State Chart': ['scxml'] },
    saveLabel: 'Create SCXML File'
  });
  if (!uri) { return; }
  const content = Buffer.from(emptyDocument(), 'utf8');
  await vscode.workspace.fs.writeFile(uri, content);
  await vscode.commands.executeCommand('vscode.openWith', uri, 'scxml.stateChart');
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
    let selectedId: string | undefined;
    let selectedTransition: number | undefined;
    const update = () => { panel.webview.html = renderPage(parseScxml(document.getText()), document.fileName, layout, selectedId, selectedTransition); };
    update();

    const change = vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.uri.toString() === document.uri.toString()) { update(); }
    });
    panel.onDidDispose(() => change.dispose());
    panel.webview.onDidReceiveMessage(async message => {
      try {
      if (message.command === 'showSource') {
        await vscode.window.showTextDocument(document, { preview: false });
      } else if (message.command === 'selectState') {
        selectedId = message.id; selectedTransition = undefined; update();
      } else if (message.command === 'selectTransition') {
        selectedId = message.stateId; selectedTransition = message.index; update();
      } else if (message.command === 'createParallelRegion') {
        await applyDocumentText(document, createParallelRegion(document.getText(), message.region));
        selectedId = message.region.regionId; selectedTransition = undefined;
      } else if (message.command === 'createChildState') {
        await applyDocumentText(document, createChildState(document.getText(), message.state));
        selectedId = message.state.id; selectedTransition = undefined;
      } else if (message.command === 'createState') {
        await applyDocumentText(document, createState(document.getText(), message.state));
        selectedId = message.state.id; selectedTransition = undefined;
      } else if (message.command === 'deleteState') {
        await applyDocumentText(document, deleteState(document.getText(), message.id));
        delete layout[message.id]; await this.context.workspaceState.update(storageKey, layout); selectedId = undefined; selectedTransition = undefined;
      } else if (message.command === 'createTransition') {
        await applyDocumentText(document, createTransition(document.getText(), message.transition));
        selectedId = message.transition.stateId; selectedTransition = undefined;
      } else if (message.command === 'deleteTransition') {
        await applyDocumentText(document, deleteTransition(document.getText(), message.stateId, message.index));
      } else if (message.command === 'updateState') {
        await applyDocumentText(document, updateState(document.getText(), message.update));
        selectedId = message.update.id;
      } else if (message.command === 'updateTransition') {
        await applyDocumentText(document, updateTransition(document.getText(), message.update));
      } else if (message.command === 'undo') {
        await vscode.commands.executeCommand('undo');
      } else if (message.command === 'redo') {
        await vscode.commands.executeCommand('redo');
      } else if (message.command === 'saveLayout' && message.positions) {
        layout = message.positions as Layout;
        await this.context.workspaceState.update(storageKey, layout);
      } else if (message.command === 'resetLayout') {
        layout = {};
        await this.context.workspaceState.update(storageKey, layout);
        update();
      }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`SCXML editor: ${message}`);
        void panel.webview.postMessage({ command: 'operationError', message });
      }
    });
  }
}

async function applyDocumentText(document: vscode.TextDocument, text: string): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
  if (!await vscode.workspace.applyEdit(edit)) { throw new Error('Unable to update the SCXML document.'); }
}

function renderPage(model: ScxmlModel, fileName: string, savedLayout: Layout, selectedId?: string, selectedTransition?: number): string {
  const allStates: StateNode[] = []; const parents = new Map<string, string>(); const depths = new Map<string, number>();
  const collect = (state: StateNode, parent = '', depth = 0) => { allStates.push(state); depths.set(state.id, depth); if (parent) parents.set(state.id, parent); state.children.forEach(child => collect(child, state.id, depth + 1)); };
  model.states.forEach(state => collect(state));

  const width = 1200; const boxWidth = 210; const boxHeight = 86; const gapX = 80; const gapY = 60;
  const positions = new Map<string, Point>();
  const dimensions = new Map<string, { width: number; height: number }>();
  const headerHeight = 68; const padding = 24; const childGap = 24;
  const measure = (state: StateNode): { width: number; height: number } => {
    if (!state.children.length) { const size = { width: boxWidth, height: boxHeight }; dimensions.set(state.id, size); return size; }
    const childSizes = state.children.map(measure);
    const parallel = state.kind === 'parallel';
    const contentWidth = parallel ? childSizes.reduce((sum, size) => sum + size.width, 0) + childGap * Math.max(0, childSizes.length - 1) : Math.max(...childSizes.map(size => size.width));
    const contentHeight = parallel ? Math.max(...childSizes.map(size => size.height)) : childSizes.reduce((sum, size) => sum + size.height, 0) + childGap * Math.max(0, childSizes.length - 1);
    const size = { width: Math.max(boxWidth, contentWidth + padding * 2), height: headerHeight + contentHeight + padding * 2 };
    dimensions.set(state.id, size); return size;
  };
  model.states.forEach(measure);
  const place = (state: StateNode, x: number, y: number): void => {
    const saved = savedLayout[state.id]; const position = saved ?? { x, y }; positions.set(state.id, position);
    if (!state.children.length) { return; }
    let cx = position.x + padding, cy = position.y + headerHeight + padding;
    for (const child of state.children) {
      place(child, cx, cy); const size = dimensions.get(child.id)!;
      if (state.kind === 'parallel') { cx += size.width + childGap; } else { cy += size.height + childGap; }
    }
  };
  let rootX = 40; let rootY = 55; let rowHeight = 0;
  for (const state of model.states) {
    const size = dimensions.get(state.id)!;
    if (rootX + size.width > width && rootX > 40) { rootX = 40; rootY += rowHeight + gapY; rowHeight = 0; }
    place(state, rootX, rootY); rootX += size.width + gapX; rowHeight = Math.max(rowHeight, size.height);
  }
  const maxX = Math.max(width, ...allStates.map(state => positions.get(state.id)!.x + dimensions.get(state.id)!.width + 80));
  const maxY = Math.max(420, ...allStates.map(state => positions.get(state.id)!.y + dimensions.get(state.id)!.height + 100));
  const edges = allStates.flatMap(source => source.transitions.flatMap((transition, transitionIndex) => transition.targets.map((target, targetIndex) => {
    if (!positions.has(target)) { return ''; }
    const label = escapeHtml([transition.event, transition.cond ? `[${transition.cond}]` : ''].filter(Boolean).join(' '));
    return `<g class="edge-group${selectedId === source.id && selectedTransition === transitionIndex ? ' selected' : ''}" data-source="${escapeHtml(source.id)}" data-target="${escapeHtml(target)}" data-index="${transitionIndex}"><path id="edge-${safeId(source.id)}-${transitionIndex}-${targetIndex}" class="edge" marker-end="url(#arrow)"/><text class="label">${label}</text></g>`;
  })));

  const nodes = allStates.map(state => {
    const p = positions.get(state.id)!; const size = dimensions.get(state.id)!; const parentId = parents.get(state.id); const parent = parentId ? allStates.find(item => item.id === parentId) : undefined; const initial = (parent ? parent.initial === state.id : model.initial === state.id) ? ' initial' : ''; const selected = selectedId === state.id ? ' selected' : ''; const compound = state.children.length ? ' compound' : '';
    return `<g class="state${compound}" data-id="${escapeHtml(state.id)}" data-parent="${escapeHtml(parentId || '')}" transform="translate(${p.x} ${p.y})"><rect width="${size.width}" height="${size.height}" rx="14" class="node ${state.kind}${initial}${selected}"/><line x1="0" y1="66" x2="${size.width}" y2="66" class="compound-divider"/><text x="16" y="29" class="title">${escapeHtml(state.id)}</text><text x="16" y="53" class="kind">${state.kind}${state.children.length ? ' · compound' : ''}</text><circle class="transition-handle" cx="${size.width}" cy="33" r="6"><title>Drag to another state to create a transition</title></circle></g>`;
  }).join('');

  const initialPositions = JSON.stringify(Object.fromEntries(positions)).replace(/</g, '\\u003c');
  const selectedState = allStates.find(state => state.id === selectedId);
  const propertyPanel = selectedState ? `<aside class="properties"><h2>State properties</h2><label>ID<input id="state-id" value="${escapeHtml(selectedState.id)}"></label><label>Kind<select id="state-kind">${['state','parallel','final','history'].map(kind => `<option ${kind === selectedState.kind ? 'selected' : ''}>${kind}</option>`).join('')}</select></label><label class="check"><input id="state-initial" type="checkbox" ${model.initial === selectedState.id ? 'checked' : ''}> Initial state</label><div class="actions"><button id="add-child-state">Add substate</button>${selectedState.kind === 'parallel' ? '<button id="add-parallel-region">Add region</button>' : ''}<button id="save-state">Apply state changes</button><button id="delete-state" class="danger">Delete state</button></div><h2>Transitions</h2><section class="transition new"><strong>New transition</strong><label>Event<input id="new-event"></label><label>Condition<input id="new-cond"></label><label>Targets<input id="new-targets" placeholder="stateId"></label><button id="add-transition">Add transition</button></section>${selectedState.transitions.length ? selectedState.transitions.map((transition, index) => `<section class="transition ${selectedTransition === index ? 'selected-transition' : ''}" data-transition-index="${index}"><strong>Transition ${index + 1}</strong><label>Event<input data-field="event" value="${escapeHtml(transition.event || '')}"></label><label>Condition<input data-field="cond" value="${escapeHtml(transition.cond || '')}"></label><label>Targets<input data-field="targets" value="${escapeHtml(transition.targets.join(' '))}"></label><div class="actions"><button class="save-transition" data-index="${index}">Apply transition</button><button class="delete-transition danger" data-index="${index}">Delete</button></div></section>`).join('') : '<p>No transitions in this state.</p>'}</aside>` : '<aside class="properties empty"><h2>Properties</h2><p>Select a state to edit it.</p></aside>';
  const problems = model.errors.length
    ? `<div class="problems"><strong>Problems</strong><ul>${model.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>`
    : '<div class="ok">No structural problems found.</div>';

  return `<!doctype html><html><head><meta charset="UTF-8"><style>
    body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0;user-select:none}.bar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background)}button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;padding:7px 12px;cursor:pointer}.hint{color:var(--vscode-descriptionForeground);margin-left:auto}.canvas{overflow:auto;padding:12px}.state{cursor:grab}.state.dragging{cursor:grabbing}.node{fill:var(--vscode-editorWidget-background);stroke:var(--vscode-focusBorder);stroke-width:2}.state:hover .node,.node.selected{stroke-width:4}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 310px;height:calc(100vh - 47px)}.properties{overflow:auto;padding:14px;border-left:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background)}.properties h2{font-size:15px}.properties label{display:block;margin:10px 0}.properties input,.properties select{box-sizing:border-box;width:100%;margin-top:4px;padding:6px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border)}.properties .check{display:flex;gap:8px;align-items:center}.properties .check input{width:auto;margin:0}.transition{border-top:1px solid var(--vscode-panel-border);padding:12px 0}.actions{display:flex;gap:8px}.danger{background:var(--vscode-inputValidation-errorBackground);color:var(--vscode-errorForeground);border:1px solid var(--vscode-inputValidation-errorBorder)}.compound>.node{fill:var(--vscode-editorWidget-background);fill-opacity:.35}.compound-divider{stroke:var(--vscode-panel-border);stroke-width:1}.node.final{stroke:#3fb950;stroke-width:4}.node.parallel{stroke:#d29922}.node.initial{filter:drop-shadow(0 0 5px var(--vscode-focusBorder))}.title{fill:var(--vscode-foreground);font-size:15px;font-weight:600;pointer-events:none}.kind,.label{fill:var(--vscode-descriptionForeground);font-size:12px;pointer-events:none}.edge{fill:none;stroke:var(--vscode-descriptionForeground);stroke-width:1.6;pointer-events:stroke;cursor:context-menu}.edge-group.selected .edge{stroke:var(--vscode-focusBorder);stroke-width:4}.selected-transition{outline:2px solid var(--vscode-focusBorder);outline-offset:3px}.context-menu{position:fixed;z-index:1000;min-width:190px;padding:4px;background:var(--vscode-menu-background,var(--vscode-editorWidget-background));color:var(--vscode-menu-foreground,var(--vscode-foreground));border:1px solid var(--vscode-menu-border,var(--vscode-panel-border));box-shadow:0 4px 16px rgba(0,0,0,.35)}.context-menu button{display:block;width:100%;text-align:left;background:transparent;color:inherit}.context-menu button:hover{background:var(--vscode-menu-selectionBackground,var(--vscode-list-hoverBackground))}.state-dialog{width:340px;color:var(--vscode-foreground);background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-focusBorder);padding:18px}.state-dialog::backdrop{background:rgba(0,0,0,.45)}.state-dialog label{display:block;margin:12px 0}.state-dialog input,.state-dialog select{box-sizing:border-box;width:100%;margin-top:5px;padding:7px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border)}.state-dialog .check{display:flex;gap:8px;align-items:center}.state-dialog .check input{width:auto;margin:0}.transition-dialog{width:380px;color:var(--vscode-foreground);background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-focusBorder);padding:18px}.transition-dialog::backdrop{background:rgba(0,0,0,.45)}.transition-dialog label{display:block;margin:12px 0}.transition-dialog input{box-sizing:border-box;width:100%;margin-top:5px;padding:7px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border)}.route{display:flex;gap:8px;align-items:center;margin:8px 0;color:var(--vscode-descriptionForeground)}.transition-handle{fill:var(--vscode-button-background);stroke:var(--vscode-button-foreground);stroke-width:2;cursor:crosshair}.state:hover .transition-handle{r:8}.temp-edge{fill:none;stroke:var(--vscode-focusBorder);stroke-width:3;stroke-dasharray:7 5;pointer-events:none}.drop-target .node{stroke:#3fb950;stroke-width:4}.dialog-error{min-height:18px;margin:8px 0;color:var(--vscode-errorForeground)}.problems{margin:12px 16px;padding:10px;border-left:4px solid var(--vscode-errorForeground);background:var(--vscode-textBlockQuote-background);user-select:text}.ok{margin:12px 16px;color:var(--vscode-testing-iconPassed)}
  </style></head><body><div class="bar"><strong>${escapeHtml(model.name || 'SCXML State Chart')}</strong><span>${escapeHtml(fileName)}</span><button id="source">Show XML Source</button><button id="add-state">Add State</button><button id="reset">Reset Layout</button><button id="undo">Undo</button><button id="redo">Redo</button><span class="hint">Drag states to arrange the chart. Right-click empty space, a state, or a transition for context actions.</span></div><div class="workspace"><main>${problems}<div class="canvas"><svg id="chart" width="${maxX}" height="${maxY}" viewBox="0 0 ${maxX} ${maxY}"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="var(--vscode-descriptionForeground)"/></marker></defs>${edges.join('')}${nodes}</svg></div></main>${propertyPanel}</div><dialog id="state-dialog" class="state-dialog"><form method="dialog"><h2>Add state</h2><label>State ID<input id="new-state-id" autocomplete="off" required></label><label>Kind<select id="new-state-kind"><option value="state">state</option><option value="parallel">parallel</option><option value="final">final</option><option value="history">history</option></select></label><label class="check"><input id="new-state-initial" type="checkbox"> Initial state</label><div id="state-dialog-error" class="dialog-error"></div><div class="actions"><button id="cancel-state" value="cancel">Cancel</button><button id="confirm-state" value="default">Add state</button></div></form></dialog><dialog id="region-dialog" class="state-dialog"><form method="dialog"><h2>Add parallel region</h2><label>Region ID<input id="new-region-id" autocomplete="off" required></label><label>Initial child ID<input id="new-region-initial" autocomplete="off" required></label><div id="region-dialog-error" class="dialog-error"></div><div class="actions"><button value="cancel">Cancel</button><button id="confirm-region" value="default">Add region</button></div></form></dialog><dialog id="transition-dialog" class="transition-dialog"><form method="dialog"><h2 id="transition-dialog-title">Add transition</h2><div class="route"><strong id="transition-source"></strong><span>to</span><strong id="transition-target"></strong></div><label>Event<input id="dialog-transition-event" autocomplete="off" placeholder="event name (optional)"></label><label>Condition<input id="dialog-transition-cond" autocomplete="off" placeholder="condition (optional)"></label><label>Targets<input id="dialog-transition-targets" autocomplete="off" placeholder="state IDs separated by spaces"></label><div id="transition-dialog-error" class="dialog-error"></div><div class="actions"><button id="cancel-transition" value="cancel">Cancel</button><button id="confirm-transition" value="default">Add transition</button></div></form></dialog><div id="context-menu" class="context-menu" hidden></div><script>
    const vscode=acquireVsCodeApi();
    const positions=${initialPositions}; const dimensions=${JSON.stringify(Object.fromEntries(dimensions)).replace(/</g, '\u003c')}; const boxWidth=${boxWidth}; const boxHeight=${boxHeight};
    const svg=document.getElementById('chart'); const menu=document.getElementById('context-menu'); const stateDialog=document.getElementById('state-dialog'); const stateIdInput=document.getElementById('new-state-id'); const stateKindInput=document.getElementById('new-state-kind'); const stateInitialInput=document.getElementById('new-state-initial'); const stateDialogError=document.getElementById('state-dialog-error'); const regionDialog=document.getElementById('region-dialog'); const regionIdInput=document.getElementById('new-region-id'); const regionInitialInput=document.getElementById('new-region-initial'); const regionDialogError=document.getElementById('region-dialog-error'); const transitionDialog=document.getElementById('transition-dialog'); const transitionTitle=document.getElementById('transition-dialog-title'); const transitionSource=document.getElementById('transition-source'); const transitionTarget=document.getElementById('transition-target'); const transitionEvent=document.getElementById('dialog-transition-event'); const transitionCond=document.getElementById('dialog-transition-cond'); const transitionTargets=document.getElementById('dialog-transition-targets'); const transitionDialogError=document.getElementById('transition-dialog-error'); let drag=null; let suppressStateClick=false; let contextPoint={x:40,y:55}; let requestedPosition=null; let childParentId='';
    const openStateDialog=(position=null)=>{childParentId='';requestedPosition=position;stateIdInput.value='';stateKindInput.value='state';stateInitialInput.checked=false;stateDialogError.textContent='';stateDialog.showModal();setTimeout(()=>stateIdInput.focus(),0);};
    const openChildStateDialog=(parentId)=>{childParentId=parentId;requestedPosition=null;stateIdInput.value='';stateKindInput.value='state';stateInitialInput.checked=false;stateDialogError.textContent='';stateDialog.querySelector('h2').textContent='Add substate to '+parentId;stateDialog.showModal();setTimeout(()=>stateIdInput.focus(),0);}; const submitState=()=>{const id=stateIdInput.value.trim();if(!id){stateDialogError.textContent='State ID is required.';stateIdInput.focus();return;}if(positions[id]){stateDialogError.textContent='A state with this ID already exists.';stateIdInput.focus();return;}if(requestedPosition){positions[id]={x:Math.max(10,requestedPosition.x-boxWidth/2),y:Math.max(10,requestedPosition.y-boxHeight/2)};vscode.postMessage({command:'saveLayout',positions});}vscode.postMessage({command:childParentId?'createChildState':'createState',state:{parentId:childParentId,id,kind:stateKindInput.value,initial:stateInitialInput.checked}});stateDialog.close();};
    let regionParallelId=''; const openParallelRegionDialog=(parallelId)=>{regionParallelId=parallelId;regionIdInput.value='';regionInitialInput.value='';regionDialogError.textContent='';regionDialog.showModal();setTimeout(()=>regionIdInput.focus(),0);}; const submitRegion=()=>{const regionId=regionIdInput.value.trim(),initialStateId=regionInitialInput.value.trim();if(!regionId||!initialStateId){regionDialogError.textContent='Region ID and initial child ID are required.';return;}if(positions[regionId]||positions[initialStateId]){regionDialogError.textContent='Region and child IDs must be unique.';return;}vscode.postMessage({command:'createParallelRegion',region:{parallelId:regionParallelId,regionId,initialStateId}});regionDialog.close();};
    let transitionFrom=''; const openTransitionDialog=(source,target='')=>{transitionFrom=source;transitionTitle.textContent='Add transition';transitionSource.textContent=source;transitionTarget.textContent=target||'target state';transitionEvent.value='';transitionCond.value='';transitionTargets.value=target;transitionDialogError.textContent='';transitionDialog.showModal();setTimeout(()=>transitionEvent.focus(),0);}; const submitTransition=()=>{const targets=transitionTargets.value.trim();if(!transitionFrom){transitionDialogError.textContent='A source state is required.';return;}if(!targets){transitionDialogError.textContent='At least one target state is required.';transitionTargets.focus();return;}const targetIds=targets.split(/\\s+/).map(id=>id.trim()).filter(Boolean);const missing=targetIds.filter(id=>!positions[id]);if(missing.length){transitionDialogError.textContent='Unknown target: '+missing.join(', ');transitionTargets.focus();return;}vscode.postMessage({command:'createTransition',transition:{stateId:transitionFrom,event:transitionEvent.value,cond:transitionCond.value,targets:targetIds.join(' ')}});transitionDialog.close();};
    const hideMenu=()=>{menu.hidden=true;menu.innerHTML='';};
    const showMenu=(event,items)=>{event.preventDefault();event.stopPropagation();menu.innerHTML='';items.forEach(item=>{const button=document.createElement('button');button.textContent=item.label;button.onclick=()=>{hideMenu();item.action();};menu.appendChild(button);});menu.style.left=event.clientX+'px';menu.style.top=event.clientY+'px';menu.hidden=false;};
    const svgPoint=(event)=>{const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;return point.matrixTransform(svg.getScreenCTM().inverse());};
    function updateEdges(){document.querySelectorAll('.edge-group').forEach(group=>{const a=positions[group.dataset.source],b=positions[group.dataset.target];if(!a||!b)return;const as=dimensions[group.dataset.source]||{width:boxWidth,height:boxHeight},bs=dimensions[group.dataset.target]||{width:boxWidth,height:boxHeight};const x1=a.x+as.width,y1=a.y+33,x2=b.x,y2=b.y+Math.min(33,bs.height/2);const path=group.querySelector('path');path.setAttribute('d',\`M \${x1} \${y1} C \${x1+55} \${y1}, \${x2-55} \${y2}, \${x2} \${y2}\`);const label=group.querySelector('text');label.setAttribute('x',String((x1+x2)/2));label.setAttribute('y',String((y1+y2)/2-8));});}
    document.querySelectorAll('.state').forEach(node=>{node.addEventListener('contextmenu',event=>showMenu(event,[{label:'Edit state properties',action:()=>vscode.postMessage({command:'selectState',id:node.dataset.id})},{label:'Add substate',action:()=>openChildStateDialog(node.dataset.id)},{label:'Add parallel region',action:()=>openParallelRegionDialog(node.dataset.id)},{label:'Add transition',action:()=>openTransitionDialog(node.dataset.id)},{label:'Delete state',action:()=>{if(confirm('Delete state '+node.dataset.id+'?'))vscode.postMessage({command:'deleteState',id:node.dataset.id});}}]));node.addEventListener('click',event=>{if(suppressStateClick){suppressStateClick=false;event.preventDefault();event.stopPropagation();return;}if(!drag&&!linkDrag)vscode.postMessage({command:'selectState',id:node.dataset.id});});node.addEventListener('pointerdown',event=>{if(event.target.closest('.transition-handle')||linkDrag)return;event.preventDefault();node.setPointerCapture(event.pointerId);const p=svgPoint(event),current=positions[node.dataset.id];drag={node,id:node.dataset.id,dx:p.x-current.x,dy:p.y-current.y};node.classList.add('dragging');});node.addEventListener('pointermove',event=>{if(!drag||drag.node!==node)return;const p=svgPoint(event);const x=Math.max(10,p.x-drag.dx),y=Math.max(10,p.y-drag.dy);const old=positions[drag.id],dx=x-old.x,dy=y-old.y;positions[drag.id]={x,y};const moveDescendants=(parentId)=>{document.querySelectorAll('.state[data-parent="'+parentId+'"]').forEach(child=>{const id=child.dataset.id;positions[id]={x:positions[id].x+dx,y:positions[id].y+dy};child.setAttribute('transform','translate('+positions[id].x+' '+positions[id].y+')');moveDescendants(id);});};moveDescendants(drag.id);node.setAttribute('transform',\`translate(\${x} \${y})\`);updateEdges();});node.addEventListener('pointerup',()=>{if(!drag)return;drag.node.classList.remove('dragging');drag=null;vscode.postMessage({command:'saveLayout',positions});});node.addEventListener('pointercancel',()=>{if(drag){drag.node.classList.remove('dragging');drag=null;}});});
    let linkDrag=null; let tempEdge=null;
    const stateAtSvgPoint=(point,excludeId='')=>{let match=null;document.querySelectorAll('.state').forEach(node=>{const id=node.dataset.id;if(id===excludeId)return;const position=positions[id];if(position&&point.x>=position.x&&point.x<=position.x+(dimensions[id]?.width||boxWidth)&&point.y>=position.y&&point.y<=position.y+(dimensions[id]?.height||boxHeight))match=node;});return match;};
    document.querySelectorAll('.transition-handle').forEach(handle=>handle.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();const state=handle.closest('.state');const p=svgPoint(event);linkDrag={source:state.dataset.id,pointerId:event.pointerId};handle.setPointerCapture(event.pointerId);tempEdge=document.createElementNS('http://www.w3.org/2000/svg','path');tempEdge.setAttribute('class','temp-edge');svg.appendChild(tempEdge);const a=positions[linkDrag.source],size=dimensions[linkDrag.source]||{width:boxWidth,height:boxHeight};tempEdge.setAttribute('d','M '+(a.x+size.width)+' '+(a.y+33)+' L '+p.x+' '+p.y);handle.addEventListener('pointermove',moveLink);handle.addEventListener('pointerup',endLink,{once:true});handle.addEventListener('pointercancel',cancelLink,{once:true});}));
    function moveLink(event){if(!linkDrag||!tempEdge)return;const p=svgPoint(event),a=positions[linkDrag.source],size=dimensions[linkDrag.source]||{width:boxWidth,height:boxHeight};tempEdge.setAttribute('d','M '+(a.x+size.width)+' '+(a.y+33)+' C '+(a.x+size.width+55)+' '+(a.y+33)+', '+(p.x-55)+' '+p.y+', '+p.x+' '+p.y);document.querySelectorAll('.drop-target').forEach(n=>n.classList.remove('drop-target'));const target=stateAtSvgPoint(p,linkDrag.source);if(target)target.classList.add('drop-target');}
    function endLink(event){if(!linkDrag)return;event.preventDefault();event.stopPropagation();const source=linkDrag.source,p=svgPoint(event),target=stateAtSvgPoint(p,source);suppressStateClick=true;cancelLink();if(target)openTransitionDialog(source,target.dataset.id);setTimeout(()=>{suppressStateClick=false;},0);}
    function cancelLink(){document.querySelectorAll('.drop-target').forEach(n=>n.classList.remove('drop-target'));tempEdge?.remove();tempEdge=null;linkDrag=null;}
    svg.addEventListener('contextmenu',event=>{if(event.target.closest('.state')||event.target.closest('.edge-group'))return;contextPoint=svgPoint(event);showMenu(event,[{label:'Add state here',action:()=>openStateDialog(contextPoint)}]);});
    document.querySelectorAll('.edge-group').forEach(edge=>edge.addEventListener('contextmenu',event=>showMenu(event,[{label:'Edit transition properties',action:()=>vscode.postMessage({command:'selectTransition',stateId:edge.dataset.source,index:Number(edge.dataset.index)})},{label:'Delete transition',action:()=>{if(confirm('Delete this transition?'))vscode.postMessage({command:'deleteTransition',stateId:edge.dataset.source,index:Number(edge.dataset.index)});}}])));
    window.addEventListener('message',event=>{if(event.data?.command==='operationError'){if(transitionFrom){transitionDialogError.textContent=event.data.message;if(!transitionDialog.open)transitionDialog.showModal();}else{stateDialogError.textContent=event.data.message;if(!stateDialog.open)stateDialog.showModal();}}});document.addEventListener('click',event=>{if(!event.target.closest('#context-menu'))hideMenu();});document.addEventListener('keydown',event=>{if(event.key==='Escape')hideMenu();});
    document.getElementById('add-state').addEventListener('click',()=>openStateDialog());document.getElementById('confirm-state').addEventListener('click',event=>{event.preventDefault();submitState();});stateIdInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();submitState();}});
    document.getElementById('confirm-region').addEventListener('click',event=>{event.preventDefault();submitRegion();});document.getElementById('add-parallel-region')?.addEventListener('click',()=>openParallelRegionDialog('${selectedState ? escapeJs(selectedState.id) : ''}'));document.getElementById('add-child-state')?.addEventListener('click',()=>openChildStateDialog('${selectedState ? escapeJs(selectedState.id) : ''}'));document.getElementById('delete-state')?.addEventListener('click',()=>{if(confirm('Delete state ${selectedState ? escapeJs(selectedState.id) : ''}? Transitions targeting it will have that target removed.'))vscode.postMessage({command:'deleteState',id:'${selectedState ? escapeJs(selectedState.id) : ''}'});});
    document.getElementById('add-transition')?.addEventListener('click',()=>vscode.postMessage({command:'createTransition',transition:{stateId:'${selectedState ? escapeJs(selectedState.id) : ''}',event:document.getElementById('new-event').value,cond:document.getElementById('new-cond').value,targets:document.getElementById('new-targets').value}}));
    document.querySelectorAll('.delete-transition').forEach(button=>button.addEventListener('click',()=>{if(confirm('Delete this transition?'))vscode.postMessage({command:'deleteTransition',stateId:'${selectedState ? escapeJs(selectedState.id) : ''}',index:Number(button.dataset.index)});}));
    document.getElementById('confirm-transition').addEventListener('click',event=>{event.preventDefault();submitTransition();});transitionEvent.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();submitTransition();}});transitionTargets.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();submitTransition();}});updateEdges(); document.querySelector('.selected-transition')?.scrollIntoView({block:'center'}); document.getElementById('save-state')?.addEventListener('click',()=>vscode.postMessage({command:'updateState',update:{oldId:'${selectedState ? escapeJs(selectedState.id) : ''}',id:document.getElementById('state-id').value,kind:document.getElementById('state-kind').value,initial:document.getElementById('state-initial').checked}}));document.querySelectorAll('.save-transition').forEach(button=>button.addEventListener('click',()=>{const section=button.closest('.transition');vscode.postMessage({command:'updateTransition',update:{stateId:'${selectedState ? escapeJs(selectedState.id) : ''}',index:Number(button.dataset.index),event:section.querySelector('[data-field=event]').value,cond:section.querySelector('[data-field=cond]').value,targets:section.querySelector('[data-field=targets]').value}});}));document.getElementById('undo').addEventListener('click',()=>vscode.postMessage({command:'undo'}));document.getElementById('redo').addEventListener('click',()=>vscode.postMessage({command:'redo'})); document.getElementById('source').addEventListener('click',()=>vscode.postMessage({command:'showSource'}));document.getElementById('reset').addEventListener('click',()=>vscode.postMessage({command:'resetLayout'}));
  </script></body></html>`;
}

function escapeJs(value: string): string { return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function safeId(value: string): string { return value.replace(/[^A-Za-z0-9_-]/g, '_'); }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
function emptyDocument(): string { return `<?xml version="1.0" encoding="UTF-8"?>\n<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">\n</scxml>\n`; }
function sampleDocument(): string { return `<?xml version="1.0" encoding="UTF-8"?>\n<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" name="DoorController" initial="closed">\n  <state id="closed">\n    <transition event="open" target="opened"/>\n  </state>\n  <state id="opened">\n    <transition event="close" target="closed"/>\n  </state>\n</scxml>\n`; }
