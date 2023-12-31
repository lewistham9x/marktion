import { Fragment, Node as ProseMirrorNode, ParseOptions } from 'prosemirror-model';

import { selectionToInsertionEnd, createNodeFromContent } from '../helpers';
import { Content, Range, RawCommands } from '../types';

declare global {
  interface Commands<ReturnType> {
    insertContentAt: {
      /**
       * Insert a node or string of HTML at a specific position.
       */
      insertContentAt: (
        position: number | Range,
        value: Content,
        options?: {
          parseOptions?: ParseOptions;
          updateSelection?: boolean;
        }
      ) => ReturnType;
    };
  }
}

const isFragment = (nodeOrFragment: ProseMirrorNode | Fragment): nodeOrFragment is Fragment => {
  return nodeOrFragment.toString().startsWith('<');
};

export const insertContentAt: RawCommands['insertContentAt'] =
  (position, value, options) =>
  ({ tr, dispatch, view }) => {
    if (dispatch) {
      options = {
        parseOptions: {},
        updateSelection: true,
        ...options
      };

      const content = createNodeFromContent(value, view.state.schema, {
        parseOptions: {
          preserveWhitespace: 'full',
          ...options.parseOptions
        }
      });

      // don’t dispatch an empty fragment because this can lead to strange errors
      if (content.toString() === '<>') {
        return true;
      }

      let { from, to } =
        typeof position === 'number'
          ? { from: position, to: position }
          : { from: position.from, to: position.to };

      let isOnlyTextContent = true;
      let isOnlyBlockContent = true;
      const nodes = isFragment(content) ? content : [content];

      nodes.forEach(node => {
        // check if added node is valid
        node.check();

        isOnlyTextContent = isOnlyTextContent ? node.isText && node.marks.length === 0 : false;

        isOnlyBlockContent = isOnlyBlockContent ? node.isBlock : false;
      });

      // check if we can replace the wrapping node by
      // the newly inserted content
      // example:
      // replace an empty paragraph by an inserted image
      // instead of inserting the image below the paragraph
      if (from === to && isOnlyBlockContent) {
        const { parent } = tr.doc.resolve(from);
        const isEmptyTextBlock = parent.isTextblock && !parent.type.spec.code && !parent.childCount;

        if (isEmptyTextBlock) {
          from -= 1;
          to += 1;
        }
      }

      // if there is only plain text we have to use `insertText`
      // because this will keep the current marks
      if (isOnlyTextContent) {
        // if value is string, we can use it directly
        // otherwise if it is an array, we have to join it
        if (Array.isArray(value)) {
          tr.insertText(value.map(v => v.text || '').join(''), from, to);
        } else if (typeof value === 'object' && !!value && !!value.text) {
          tr.insertText(value.text, from, to);
        } else {
          tr.insertText(value as string, from, to);
        }
      } else {
        tr.replaceWith(from, to, content);
      }

      // set cursor at end of inserted content
      if (options.updateSelection) {
        selectionToInsertionEnd(tr, tr.steps.length - 1, -1);
      }
    }

    return true;
  };
