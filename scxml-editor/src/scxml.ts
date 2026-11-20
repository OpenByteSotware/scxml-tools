import { XMLParser, XMLValidator } from 'fast-xml-parser';

export type StateKind = 'state' | 'parallel' | 'final' | 'history';
export interface Transition { event?: string; cond?: string; type?: 'internal' | 'external'; targets: string[]; }
export interface InitialTransition { target?: string; cond?: string; explicit: boolean; }
export interface DataDeclaration { id: string; mode: 'expr' | 'src' | 'content'; value: string; }
export interface DoneData { mode: 'none' | 'expr' | 'content' | 'params'; expression?: string; content?: string; params?: Array<{ name: string; expr?: string; location?: string }>; }
export interface StateNode {
  id: string;
  kind: StateKind;
  initial?: string;
  initialTransition?: InitialTransition;
  historyType?: 'shallow' | 'deep';
  doneData?: DoneData;
  children: StateNode[];
  transitions: Transition[];
  dataModel?: DataDeclaration[];
}
export interface ScxmlModel {
  name?: string;
  version?: string;
  namespace?: string;
  initial?: string;
  initialTransition?: InitialTransition;
  datamodel?: string;
  binding?: string;
  xmlBase?: string;
  dataModel?: DataDeclaration[];
  states: StateNode[];
  ids: Set<string>;
  errors: string[];
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', preserveOrder: false, trimValues: false });
const asArray = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const readDataDeclarations = (raw: any): DataDeclaration[] => {
  const model = asArray<any>(raw?.datamodel)[0];
  return asArray<any>(model?.data).map(item => item?.['@_expr'] !== undefined
    ? { id: String(item?.['@_id'] ?? ''), mode: 'expr', value: String(item['@_expr']) }
    : item?.['@_src'] !== undefined
      ? { id: String(item?.['@_id'] ?? ''), mode: 'src', value: String(item['@_src']) }
      : { id: String(item?.['@_id'] ?? ''), mode: 'content', value: String(item?.['#text'] ?? '') });
};

function readInitial(raw: any): InitialTransition | undefined {
  const initial = asArray<any>(raw?.initial)[0];
  if (!initial) { return undefined; }
  const transitions = asArray<any>(initial.transition);
  const transition = transitions[0];
  return { target: transition?.['@_target'], cond: transition?.['@_cond'], explicit: true };
}


function collectStateSemantics(states: StateNode[]) {
  const byId = new Map<string, StateNode>();
  const parentById = new Map<string, StateNode | undefined>();
  const descendantsById = new Map<string, Set<string>>();
  const walk = (state: StateNode, parent?: StateNode): Set<string> => {
    byId.set(state.id, state); parentById.set(state.id, parent);
    const descendants = new Set<string>();
    state.children.forEach(child => { descendants.add(child.id); walk(child, state).forEach(id => descendants.add(id)); });
    descendantsById.set(state.id, descendants); return descendants;
  };
  states.forEach(state => walk(state));
  return { byId, parentById, descendantsById };
}
function ancestorChain(id: string, parentById: Map<string, StateNode | undefined>): StateNode[] {
  const result: StateNode[] = []; let current = parentById.get(id);
  while (current) { result.push(current); current = parentById.get(current.id); }
  return result;
}
function isDescendant(id: string, ancestorId: string, descendantsById: Map<string, Set<string>>): boolean { return descendantsById.get(ancestorId)?.has(id) ?? false; }
function nearestParallelRegion(id: string, parallelId: string, parentById: Map<string, StateNode | undefined>): string | undefined {
  let current = parentById.get(id); let childId = id;
  while (current) { if (current.id === parallelId) { return childId; } childId = current.id; current = parentById.get(current.id); }
  return undefined;
}
function validateTargetSet(source: StateNode, transition: Transition, semantics: ReturnType<typeof collectStateSemantics>, errors: string[]): void {
  const targets = transition.targets;
  [...new Set(targets.filter((target, index) => targets.indexOf(target) !== index))].forEach(target => errors.push(`State ${source.id} transition contains duplicate target ${target}.`));
  if (transition.type === 'internal') {
    if (source.kind !== 'state' || !source.children.length) { errors.push(`State ${source.id} uses an internal transition but is not a compound state.`); }
    targets.filter(target => !isDescendant(target, source.id, semantics.descendantsById)).forEach(target => errors.push(`Internal transition from ${source.id} must target a descendant; ${target} is outside its hierarchy.`));
  }
  for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
    const left = targets[i], right = targets[j]; if (left === right) { continue; }
    if (isDescendant(left, right, semantics.descendantsById) || isDescendant(right, left, semantics.descendantsById)) { errors.push(`Transition from ${source.id} cannot target both ancestor and descendant states ${left} and ${right}.`); continue; }
    const rightAncestors = new Set(ancestorChain(right, semantics.parentById).map(item => item.id));
    const commonParallel = ancestorChain(left, semantics.parentById).find(item => item.kind === 'parallel' && rightAncestors.has(item.id));
    if (!commonParallel) { errors.push(`Transition from ${source.id} has incompatible multiple targets ${left} and ${right}; targets must occupy different regions of a common parallel state.`); continue; }
    const leftRegion = nearestParallelRegion(left, commonParallel.id, semantics.parentById), rightRegion = nearestParallelRegion(right, commonParallel.id, semantics.parentById);
    if (!leftRegion || !rightRegion || leftRegion === rightRegion) { errors.push(`Transition from ${source.id} targets ${left} and ${right} in the same region of parallel state ${commonParallel.id}.`); }
  }
}
function detectUnconditionalEventlessCycles(states: StateNode[], errors: string[]): void {
  const graph = new Map<string, string[]>(); const add = (state: StateNode): void => { graph.set(state.id, state.transitions.filter(t => !t.event && !t.cond && t.targets.length === 1).map(t => t.targets[0])); state.children.forEach(add); }; states.forEach(add);
  const visiting = new Set<string>(), visited = new Set<string>();
  const dfs = (id: string, path: string[]): void => { if (visiting.has(id)) { const start = path.indexOf(id); errors.push(`Unconditional eventless transition cycle: ${[...path.slice(start), id].join(' -> ')}.`); return; } if (visited.has(id)) return; visiting.add(id); path.push(id); (graph.get(id) ?? []).forEach(next => { if (graph.has(next)) dfs(next, path); }); path.pop(); visiting.delete(id); visited.add(id); };
  graph.forEach((_targets, id) => dfs(id, []));
}

export function parseScxml(text: string): ScxmlModel {
  const errors: string[] = [];
  const valid = XMLValidator.validate(text);
  if (valid !== true) {
    return { states: [], ids: new Set(), errors: [`XML: ${valid.err.msg} at line ${valid.err.line}, column ${valid.err.col}`] };
  }
  let root: any;
  try { root = parser.parse(text)?.scxml; } catch (error) {
    return { states: [], ids: new Set(), errors: [`Unable to parse SCXML: ${String(error)}`] };
  }
  if (!root) { return { states: [], ids: new Set(), errors: ['The document must contain an <scxml> root element.'] }; }

  const ids = new Set<string>();
  const duplicates = new Set<string>();
  const validateData = (items: DataDeclaration[], scope: string): void => {
    const seen = new Set<string>();
    items.forEach(item => {
      if (!item.id) { errors.push(`${scope} contains data without an id.`); }
      else if (seen.has(item.id)) { errors.push(`${scope} contains duplicate data id ${item.id}.`); }
      else { seen.add(item.id); }
      if (!item.value.trim()) { errors.push(`Data ${item.id || '(unnamed)'} requires expr, src, or inline content.`); }
    });
  };
  validateData(readDataDeclarations(root), 'SCXML datamodel');
  const readState = (raw: any, kind: StateKind, fallback: string): StateNode => {
    const id = raw?.['@_id'] || fallback;
    if (ids.has(id)) { duplicates.add(id); } else { ids.add(id); }
    const children: StateNode[] = [];
    for (const childKind of ['state', 'parallel', 'final', 'history'] as StateKind[]) {
      asArray(raw?.[childKind]).forEach((child, index) => children.push(readState(child, childKind, `${id}.${childKind}${index + 1}`)));
    }
    const transitions: Transition[] = asArray<any>(raw?.transition).map((transition: any): Transition => {
      const rawType = transition?.['@_type'];
      const type: Transition['type'] = rawType === 'internal' || rawType === 'external' ? rawType : undefined;
      return {
        event: transition?.['@_event'], cond: transition?.['@_cond'], type,
        targets: String(transition?.['@_target'] ?? '').split(/\s+/).filter(Boolean)
      };
    });
    const explicitInitial = readInitial(raw);
    const rawDone = kind === 'final' ? asArray<any>(raw?.donedata)[0] : undefined;
    const rawContent = rawDone ? asArray<any>(rawDone.content)[0] : undefined;
    const rawParams = rawDone ? asArray<any>(rawDone.param) : [];
    const doneData: DoneData | undefined = !rawDone ? undefined : rawContent
      ? (rawContent['@_expr'] !== undefined ? { mode: 'expr', expression: rawContent['@_expr'] } : { mode: 'content', content: String(rawContent['#text'] ?? '') })
      : rawParams.length ? { mode: 'params', params: rawParams.map((param: any) => ({ name: param['@_name'] ?? '', expr: param['@_expr'], location: param['@_location'] })) } : { mode: 'none' };
    return {
      id, kind,
      initial: explicitInitial?.target || raw?.['@_initial'],
      initialTransition: explicitInitial,
      historyType: kind === 'history' ? (raw?.['@_type'] === 'deep' ? 'deep' : 'shallow') : undefined,
      doneData,
      children, transitions, dataModel: readDataDeclarations(raw)
    };
  };

  const states: StateNode[] = [];
  for (const kind of ['state', 'parallel', 'final', 'history'] as StateKind[]) {
    asArray(root[kind]).forEach((state, index) => states.push(readState(state, kind, `${kind}${index + 1}`)));
  }
  duplicates.forEach(id => errors.push(`Duplicate state id: ${id}`));
  const semantics = collectStateSemantics(states);

  const visit = (state: StateNode, depth = 0) => {
    state.transitions.flatMap(t => t.targets).filter(target => !ids.has(target)).forEach(target => errors.push(`State ${state.id} targets missing state ${target}.`));
    state.transitions.forEach(transition => validateTargetSet(state, transition, semantics, errors));
    state.transitions.filter(t => t.type && t.type !== 'internal' && t.type !== 'external').forEach(() => errors.push(`State ${state.id} has an invalid transition type.`));
    if (depth > 64) { errors.push(`State ${state.id} exceeds the supported nesting depth of 64.`); }
    const initialTargets = String(state.initial ?? '').split(/\s+/).filter(Boolean);
    if (state.kind !== 'parallel' && initialTargets.length > 1) { errors.push(`State ${state.id} must define at most one initial child.`); }
    initialTargets.filter(target => !state.children.some(child => child.id === target)).forEach(target => errors.push(`State ${state.id} has invalid initial child ${target}.`));
    if (state.initialTransition) {
      if (!state.initialTransition.target) { errors.push(`State ${state.id} explicit initial transition requires a target.`); }
      if (state.initialTransition.target && String(state.initialTransition.target).split(/\s+/).filter(Boolean).length !== 1) { errors.push(`State ${state.id} explicit initial transition must have exactly one target.`); }
      if (state.initialTransition.target && !state.children.some(child => child.id === state.initialTransition!.target)) { errors.push(`State ${state.id} explicit initial target must be a direct child.`); }
    }
    if (state.kind === 'parallel' && state.initial) { errors.push(`Parallel state ${state.id} must not define an initial state; all direct regions are entered.`); }
    if (state.kind === 'history') {
      if (depth === 0) { errors.push(`History ${state.id} must be a child of state or parallel.`); }
      if (state.children.length) { errors.push(`History ${state.id} cannot contain child states.`); }
      if (state.transitions.length > 1) { errors.push(`History ${state.id} may contain at most one default transition.`); }
      if (state.transitions[0] && state.transitions[0].targets.length < 1) { errors.push(`History ${state.id} default transition requires a target.`); }
      const owner = semantics.parentById.get(state.id);
      if (owner && state.transitions[0]) {
        state.transitions[0].targets.forEach(target => {
          const legal = state.historyType === 'deep' ? isDescendant(target, owner.id, semantics.descendantsById) : owner.children.some(child => child.id === target && child.kind !== 'history');
          if (!legal) { errors.push(`${state.historyType === 'deep' ? 'Deep' : 'Shallow'} history ${state.id} default target ${target} is outside its legal ${owner.id} scope.`); }
        });
      }
    }
    if (state.kind === 'final') {
      if (state.children.length) { errors.push(`Final state ${state.id} cannot contain child states.`); }
      if (state.transitions.length) { errors.push(`Final state ${state.id} cannot contain outgoing transitions.`); }
      (state.doneData?.params ?? []).forEach(param => {
        if (!param.name) { errors.push(`Final state ${state.id} has a done-data param without a name.`); }
        if ((param.expr ? 1 : 0) + (param.location ? 1 : 0) !== 1) { errors.push(`Done-data param ${param.name || '(unnamed)'} must define exactly one of expr or location.`); }
      });
    }
    if (state.kind === 'parallel') {
      if (state.children.length < 2) { errors.push(`Parallel state ${state.id} should contain at least two regions.`); }
      state.children.forEach(region => {
        if (region.kind !== 'state') { errors.push(`Parallel state ${state.id} region ${region.id} must be a state.`); }
        if (!region.initial && region.children.length > 0) { errors.push(`Parallel region ${region.id} should define an initial child.`); }
      });
    }
    validateData(state.dataModel ?? [], `State ${state.id} datamodel`);
    state.children.forEach(child => visit(child, depth + 1));
  };
  states.forEach(state => visit(state));
  detectUnconditionalEventlessCycles(states, errors);

  const rootInitial = readInitial(root);
  const effectiveRootInitial = rootInitial?.target || root['@_initial'];
  const rootInitialTargets = String(effectiveRootInitial ?? '').split(/\s+/).filter(Boolean);
  if (rootInitialTargets.length > 1) { errors.push('The SCXML state chart must define at most one initial state.'); }
  rootInitialTargets.filter(target => !states.some(state => state.id === target)).forEach(target => errors.push(`Initial state ${target} must be a direct child of scxml.`));
  if (rootInitial && !rootInitial.target) { errors.push('The SCXML explicit initial transition requires a target.'); }

  for (const match of text.matchAll(/<transition\b([^>]*)>/gi)) {
    const type = /\btype\s*=\s*(["'])(.*?)\1/i.exec(match[1])?.[2];
    if (type && type !== 'internal' && type !== 'external') { errors.push(`Transition type must be internal or external; found ${type}.`); }
  }
  for (const match of text.matchAll(/<initial\b[^>]*>([\s\S]*?)<\/initial\s*>/gi)) {
    if (/<transition\b[^>]*\bevent\s*=/.test(match[1])) { errors.push('Initial transitions must be eventless.'); }
  }
  for (const match of text.matchAll(/<history\b[^>]*>([\s\S]*?)<\/history\s*>/gi)) {
    if (/<transition\b[^>]*\bevent\s*=/.test(match[1])) { errors.push('History default transitions must be eventless.'); }
  }
  for (const match of text.matchAll(/<raise\b([^>]*)\/?\s*>/gi)) {
    if (!/\bevent\s*=/.test(match[1])) { errors.push('raise requires an event attribute.'); }
  }
  for (const match of text.matchAll(/<assign\b([^>]*)\/?\s*>/gi)) {
    if (!/\blocation\s*=/.test(match[1])) { errors.push('assign requires a location attribute.'); }
  }
  for (const match of text.matchAll(/<script\b([^>]*)>/gi)) {
    if (/\bsrc\s*=/.test(match[1]) && !/\/\s*>$/.test(match[0])) { errors.push('script with src must be empty and cannot contain inline content.'); }
  }
  for (const match of text.matchAll(/<if\b([^>]*)>/gi)) {
    if (!/\bcond\s*=/.test(match[1])) { errors.push('if requires a cond attribute.'); }
  }
  for (const match of text.matchAll(/<elseif\b([^>]*)\/?\s*>/gi)) {
    if (!/\bcond\s*=/.test(match[1])) { errors.push('elseif requires a cond attribute.'); }
  }
  for (const match of text.matchAll(/<foreach\b([^>]*)>/gi)) {
    if (!/\barray\s*=/.test(match[1])) { errors.push('foreach requires an array attribute.'); }
    if (!/\bitem\s*=/.test(match[1])) { errors.push('foreach requires an item attribute.'); }
  }
  for (const match of text.matchAll(/<send\b([^>]*)>/gi)) {
    const attrs = match[1];
    const pairs = [['event','eventexpr'], ['target','targetexpr'], ['type','typeexpr'], ['id','idlocation'], ['delay','delayexpr']];
    pairs.forEach(([literal, expression]) => { if (new RegExp(`\\b${literal}\\s*=`).test(attrs) && new RegExp(`\\b${expression}\\s*=`).test(attrs)) errors.push(`send cannot define both ${literal} and ${expression}.`); });
    if (!/\bevent(?:expr)?\s*=/.test(attrs)) { errors.push('send requires event or eventexpr.'); }
  }
  for (const match of text.matchAll(/<cancel\b([^>]*)\/?\s*>/gi)) {
    if (!/\bsendid(?:expr)?\s*=/.test(match[1])) { errors.push('cancel requires sendid or sendidexpr.'); }
    if (/\bsendid\s*=/.test(match[1]) && /\bsendidexpr\s*=/.test(match[1])) { errors.push('cancel cannot define both sendid and sendidexpr.'); }
  }
  for (const match of text.matchAll(/<invoke\b([^>]*)>/gi)) {
    const attrs = match[1];
    const pairs = [['id','idlocation'], ['type','typeexpr'], ['src','srcexpr']];
    pairs.forEach(([literal, expression]) => { if (new RegExp(`\\b${literal}\\s*=`).test(attrs) && new RegExp(`\\b${expression}\\s*=`).test(attrs)) errors.push(`invoke cannot define both ${literal} and ${expression}.`); });
  }

  const version = root['@_version'];
  const namespace = root['@_xmlns'];
  const binding = root['@_binding'];
  if (version !== '1.0') { errors.push('The scxml version attribute must be "1.0".'); }
  if (namespace !== 'http://www.w3.org/2005/07/scxml') { errors.push('The scxml namespace must be http://www.w3.org/2005/07/scxml.'); }
  if (binding && binding !== 'early' && binding !== 'late') { errors.push('The scxml binding attribute must be "early" or "late".'); }

  return {
    name: root['@_name'], version, namespace, dataModel: readDataDeclarations(root),
    initial: effectiveRootInitial, initialTransition: rootInitial,
    datamodel: root['@_datamodel'], binding, xmlBase: root['@_xml:base'],
    states, ids, errors
  };
}
