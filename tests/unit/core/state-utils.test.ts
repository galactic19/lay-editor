import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { findNodeByAttr, findParent, getMarkRange, isMarkActive, isNodeActive } from '../../../src/core/state-utils';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    heading: { group: 'block', content: 'inline*', attrs: { level: { default: 1 } } },
    quote: { group: 'block', content: 'block+' },
    img: { group: 'block', atom: true, attrs: { id: { default: null } } },
    text: { group: 'inline' },
  },
  marks: { strong: {}, link: { attrs: { href: {} } } },
});

const p = (...c: Parameters<typeof schema.text>[]) => schema.node('paragraph', null, c.map((a) => schema.text(...a)));

function stateWith(doc: ReturnType<typeof schema.node>, from: number, to = from) {
  const s = EditorState.create({ doc });
  return s.apply(s.tr.setSelection(TextSelection.create(s.doc, from, to)));
}

describe('state-utils', () => {
  it('isMarkActive for ranges and cursors', () => {
    const doc = schema.node('doc', null, [p(['ab', [schema.marks.strong!.create()]], ['c'])]);
    expect(isMarkActive(stateWith(doc, 1, 3), schema.marks.strong!)).toBe(true);
    expect(isMarkActive(stateWith(doc, 2), schema.marks.strong!)).toBe(true);
    expect(isMarkActive(stateWith(doc, 3, 4), schema.marks.strong!)).toBe(false);
  });

  it('isMarkActive matches attrs', () => {
    const link = schema.marks.link!.create({ href: 'a' });
    const doc = schema.node('doc', null, [p(['ab', [link]])]);
    expect(isMarkActive(stateWith(doc, 2), schema.marks.link!, { href: 'a' })).toBe(true);
    expect(isMarkActive(stateWith(doc, 2), schema.marks.link!, { href: 'b' })).toBe(false);
  });

  it('isNodeActive checks ancestors, attrs and node selections', () => {
    const doc = schema.node('doc', null, [
      schema.node('quote', null, [schema.node('heading', { level: 2 }, [schema.text('a')])]),
      schema.node('img', { id: 'x' }),
    ]);
    const s = stateWith(doc, 3);
    expect(isNodeActive(s, schema.nodes.quote!)).toBe(true);
    expect(isNodeActive(s, schema.nodes.heading!, { level: 2 })).toBe(true);
    expect(isNodeActive(s, schema.nodes.heading!, { level: 1 })).toBe(false);
    const sel = s.apply(s.tr.setSelection(NodeSelection.create(s.doc, 5)));
    expect(isNodeActive(sel, schema.nodes.img!)).toBe(true);
  });

  it('getMarkRange returns the full extent around the cursor', () => {
    const link = schema.marks.link!.create({ href: 'a' });
    const doc = schema.node('doc', null, [p(['x'], ['abc', [link]], ['y'])]);
    expect(getMarkRange(stateWith(doc, 3), schema.marks.link!)).toEqual({ from: 2, to: 5 });
    expect(getMarkRange(stateWith(doc, 1), schema.marks.link!)).toBeNull();
  });

  it('findParent and findNodeByAttr', () => {
    const doc = schema.node('doc', null, [schema.node('quote', null, [p(['a'])]), schema.node('img', { id: 'u1' })]);
    expect(findParent(stateWith(doc, 2), (n) => n.type.name === 'quote')).toMatchObject({ pos: 0, depth: 1 });
    expect(findNodeByAttr(doc, 'id', 'u1')).toMatchObject({ pos: 5 });
    expect(findNodeByAttr(doc, 'id', 'nope')).toBeNull();
  });
});
