import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";

/**
 * DragHandle extension — adds a grip handle on the left of each top-level block.
 * Hover over a block to reveal the handle; drag to reorder blocks.
 */
export const DragHandle = Extension.create({
  name: "dragHandle",

  addProseMirrorPlugins() {
    let dragHandleEl: HTMLDivElement | null = null;
    let currentBlockPos: number | null = null;
    let editorView: EditorView | null = null;

    function createHandle() {
      const el = document.createElement("div");
      el.className = "notebook-drag-handle";
      el.contentEditable = "false";
      el.draggable = true;
      el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;

      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (currentBlockPos === null || !editorView) return;
        const { state } = editorView;
        const resolved = state.doc.resolve(currentBlockPos);
        if (!resolved.nodeAfter) return;
        const tr = state.tr.setSelection(NodeSelection.create(state.doc, currentBlockPos));
        editorView.dispatch(tr);
      });

      el.addEventListener("dragstart", (e) => {
        if (currentBlockPos === null || !editorView) return;
        const { state } = editorView;
        const resolved = state.doc.resolve(currentBlockPos);
        if (!resolved.nodeAfter) return;
        const tr = state.tr.setSelection(NodeSelection.create(state.doc, currentBlockPos));
        editorView.dispatch(tr);
        // Let ProseMirror handle the drag from the NodeSelection
        const dom = editorView.nodeDOM(currentBlockPos);
        if (dom instanceof HTMLElement && e.dataTransfer) {
          e.dataTransfer.setDragImage(dom, 0, 0);
        }
      });

      document.body.appendChild(el);
      return el;
    }

    function showHandle(view: EditorView, pos: number, dom: HTMLElement) {
      if (!dragHandleEl) {
        dragHandleEl = createHandle();
      }
      currentBlockPos = pos;
      editorView = view;

      const editorRect = view.dom.getBoundingClientRect();
      const blockRect = dom.getBoundingClientRect();
      dragHandleEl.style.top = `${blockRect.top + window.scrollY + 2}px`;
      dragHandleEl.style.left = `${editorRect.left + window.scrollX - 24}px`;
      dragHandleEl.style.display = "flex";
    }

    function hideHandle() {
      if (dragHandleEl) {
        dragHandleEl.style.display = "none";
      }
      currentBlockPos = null;
    }

    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            mouseover: (view, event) => {
              const target = event.target as HTMLElement;
              if (!target || target.closest?.(".notebook-drag-handle")) return false;

              const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (!pos) {
                hideHandle();
                return false;
              }

              const resolved = view.state.doc.resolve(pos.pos);
              if (resolved.depth < 1) {
                hideHandle();
                return false;
              }

              const blockPos = resolved.before(1);
              const blockNode = view.state.doc.nodeAt(blockPos);
              if (!blockNode) {
                hideHandle();
                return false;
              }

              const dom = view.nodeDOM(blockPos);
              if (dom instanceof HTMLElement) {
                showHandle(view, blockPos, dom);
              }

              return false;
            },
            mouseleave: () => {
              setTimeout(() => {
                if (dragHandleEl && !dragHandleEl.matches(":hover")) {
                  hideHandle();
                }
              }, 150);
              return false;
            },
          },
        },
        view() {
          return {
            destroy() {
              if (dragHandleEl) {
                dragHandleEl.remove();
                dragHandleEl = null;
              }
            },
          };
        },
      }),
    ];
  },
});
