export interface XmlSourceAttribute {
  name: string;
  value: string;
  quote: '"' | "'";
  start: number;
  end: number;
  valueStart: number;
  valueEnd: number;
}

export interface XmlSourceElement {
  name: string;
  localName: string;
  start: number;
  openEnd: number;
  closeStart: number;
  end: number;
  selfClosing: boolean;
  parent?: XmlSourceElement;
  children: XmlSourceElement[];
  attributes: XmlSourceAttribute[];
}

export interface XmlSourceProblem {
  message: string;
  start: number;
  end: number;
  code: 'xml.unterminated' | 'xml.unexpectedClose' | 'xml.mismatchedClose' | 'xml.unclosed' | 'xml.duplicateAttribute' | 'xml.multipleRoots' | 'xml.outsideRoot' | 'xml.invalidName';
}

export interface XmlSourceDocument {
  text: string;
  roots: XmlSourceElement[];
  elements: XmlSourceElement[];
  problems: XmlSourceProblem[];
}

function findTagEnd(text: string, start: number): number {
  let quote = '';
  for (let index = start + 1; index < text.length; index++) {
    const char = text[index];
    if (quote) { if (char === quote) { quote = ''; } continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '>') { return index + 1; }
  }
  return text.length;
}

function readAttributes(text: string, start: number, end: number): XmlSourceAttribute[] {
  const source = text.slice(start, end);
  const result: XmlSourceAttribute[] = [];
  const nameEnd = /^<\s*[^\s/>]+/.exec(source)?.[0].length ?? 1;
  const pattern = /\s+([A-Za-z_][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/g;
  pattern.lastIndex = nameEnd;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const absolute = start + match.index;
    const valueOffset = match[0].indexOf(match[3], match[0].indexOf(match[2]) + 1);
    result.push({ name: match[1], value: match[3], quote: match[2] as '"' | "'", start: absolute, end: absolute + match[0].length, valueStart: absolute + valueOffset, valueEnd: absolute + valueOffset + match[3].length });
  }
  return result;
}

export function parseXmlSource(text: string): XmlSourceDocument {
  const roots: XmlSourceElement[] = [], elements: XmlSourceElement[] = [], stack: XmlSourceElement[] = [], problems: XmlSourceProblem[] = [];
  const addProblem = (message: string, start: number, end: number, code: XmlSourceProblem['code']): void => { problems.push({ message, start, end: Math.max(start + 1, end), code }); };
  const validName = /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/;
  let index = 0;
  while (index < text.length) {
    const start = text.indexOf('<', index);
    const outsideText = text.slice(index, start < 0 ? text.length : start);
    if (!stack.length && outsideText.trim()) { addProblem('Non-whitespace text is not allowed outside the document root.', index, index + outsideText.length, 'xml.outsideRoot'); }
    if (start < 0) { break; }
    if (text.startsWith('<!--', start)) { const end = text.indexOf('-->', start + 4); if (end < 0) { addProblem('Unterminated XML comment.', start, text.length, 'xml.unterminated'); break; } index = end + 3; continue; }
    if (text.startsWith('<![CDATA[', start)) { const end = text.indexOf(']]>', start + 9); if (end < 0) { addProblem('Unterminated CDATA section.', start, text.length, 'xml.unterminated'); break; } index = end + 3; continue; }
    if (text.startsWith('<?', start)) { const end = text.indexOf('?>', start + 2); if (end < 0) { addProblem('Unterminated processing instruction.', start, text.length, 'xml.unterminated'); break; } index = end + 2; continue; }
    if (text.startsWith('<!', start)) { const end = findTagEnd(text, start); if (end >= text.length && text[text.length - 1] !== '>') { addProblem('Unterminated XML declaration.', start, text.length, 'xml.unterminated'); break; } index = end; continue; }
    const openEnd = findTagEnd(text, start);
    if (openEnd >= text.length && text[text.length - 1] !== '>') { addProblem('Unterminated XML element or attribute value.', start, text.length, 'xml.unterminated'); break; }
    const token = text.slice(start, openEnd);
    const closing = /^<\s*\//.test(token);
    const name = /^<\s*\/?\s*([^\s/>]+)/.exec(token)?.[1];
    if (!name) { addProblem('Invalid XML element syntax.', start, openEnd, 'xml.invalidName'); index = openEnd; continue; }
    if (!validName.test(name)) { addProblem(`Invalid qualified XML name ${name}.`, start, openEnd, 'xml.invalidName'); }
    if (closing) {
      const current = stack[stack.length - 1];
      if (!current) { addProblem(`Unexpected closing element </${name}>.`, start, openEnd, 'xml.unexpectedClose'); index = openEnd; continue; }
      if (current.name !== name) {
        addProblem(`Mismatched closing element </${name}>; expected </${current.name}>.`, start, openEnd, 'xml.mismatchedClose');
        index = openEnd; continue;
      }
      current.closeStart = start; current.end = openEnd; stack.pop(); index = openEnd; continue;
    }
    const selfClosing = /\/\s*>$/.test(token);
    const parent = stack[stack.length - 1];
    const attributes = readAttributes(text, start, openEnd);
    const seen = new Set<string>();
    for (const attribute of attributes) {
      if (seen.has(attribute.name)) { addProblem(`Duplicate attribute ${attribute.name}.`, attribute.start, attribute.end, 'xml.duplicateAttribute'); }
      seen.add(attribute.name);
    }
    const element: XmlSourceElement = { name, localName: name.includes(':') ? name.slice(name.indexOf(':') + 1) : name, start, openEnd, closeStart: openEnd, end: openEnd, selfClosing, parent, children: [], attributes };
    elements.push(element); parent ? parent.children.push(element) : roots.push(element);
    if (!parent && roots.length > 1) { addProblem('An XML document may contain only one root element.', start, openEnd, 'xml.multipleRoots'); }
    if (!selfClosing) { stack.push(element); }
    index = openEnd;
  }
  for (const element of stack) { element.closeStart = element.end = text.length; addProblem(`Unclosed element <${element.name}>.`, element.start, element.openEnd, 'xml.unclosed'); }
  return { text, roots, elements, problems };
}
export function getAttribute(element: XmlSourceElement, name: string): XmlSourceAttribute | undefined {
  return element.attributes.find(attribute => attribute.name === name);
}

export function findElementById(document: XmlSourceDocument, localNames: Set<string>, id: string): XmlSourceElement | undefined {
  return document.elements.find(element => localNames.has(element.localName) && getAttribute(element, 'id')?.value === id);
}

export function directChildren(element: XmlSourceElement, localName?: string): XmlSourceElement[] {
  return localName ? element.children.filter(child => child.localName === localName) : [...element.children];
}

export function replaceRange(text: string, start: number, end: number, replacement: string): string {
  return text.slice(0, start) + replacement + text.slice(end);
}

export function setSourceAttribute(text: string, element: XmlSourceElement, name: string, value: string): string {
  const existing = getAttribute(element, name);
  if (!value) {
    if (!existing) { return text; }
    return replaceRange(text, existing.start, existing.end, '');
  }
  const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  if (existing) { return replaceRange(text, existing.valueStart, existing.valueEnd, escaped); }
  const insert = element.openEnd - (element.selfClosing ? text.slice(element.start, element.openEnd).match(/\/\s*>$/)?.[0].length ?? 2 : 1);
  return replaceRange(text, insert, insert, ` ${name}="${escaped}"`);
}
