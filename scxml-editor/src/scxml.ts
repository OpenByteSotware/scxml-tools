import { XMLParser, XMLValidator } from 'fast-xml-parser';

export type StateKind = 'state' | 'parallel' | 'final' | 'history';
export interface Transition { event?: string; cond?: string; targets: string[]; }
export interface StateNode { id: string; kind: StateKind; initial?: string; children: StateNode[]; transitions: Transition[]; }
export interface ScxmlModel { name?: string; initial?: string; states: StateNode[]; ids: Set<string>; errors: string[]; }

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', preserveOrder: false, trimValues: false });
const asArray = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];

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
  const readState = (raw: any, kind: StateKind, fallback: string): StateNode => {
    const id = raw?.['@_id'] || fallback;
    if (ids.has(id)) { duplicates.add(id); } else { ids.add(id); }
    const children: StateNode[] = [];
    for (const childKind of ['state', 'parallel', 'final', 'history'] as StateKind[]) {
      asArray(raw?.[childKind]).forEach((child, index) => children.push(readState(child, childKind, `${id}.${childKind}${index + 1}`)));
    }
    const transitions = asArray(raw?.transition).map((transition: any) => ({
      event: transition?.['@_event'], cond: transition?.['@_cond'],
      targets: String(transition?.['@_target'] ?? '').split(/\s+/).filter(Boolean)
    }));
    return { id, kind, initial: raw?.['@_initial'], children, transitions };
  };

  const states: StateNode[] = [];
  for (const kind of ['state', 'parallel', 'final', 'history'] as StateKind[]) {
    asArray(root[kind]).forEach((state, index) => states.push(readState(state, kind, `${kind}${index + 1}`)));
  }
  duplicates.forEach(id => errors.push(`Duplicate state id: ${id}`));
  const visit = (state: StateNode) => {
    state.transitions.flatMap(t => t.targets).filter(target => !ids.has(target)).forEach(target => errors.push(`State ${state.id} targets missing state ${target}.`));
    state.children.forEach(visit);
  };
  states.forEach(visit);
  if (root['@_initial'] && !ids.has(root['@_initial'])) { errors.push(`Initial state ${root['@_initial']} does not exist.`); }
  return { name: root['@_name'], initial: root['@_initial'], states, ids, errors };
}
