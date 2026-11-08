/**
 * Encabezado del nodo de clase UML: título editable, estereotipo, insignia remota,
 * pestaña de esquina doblada EA, flecha Quick Linker y menú contextual.
 */
import { useRef, useState } from 'react';
import { useT } from '../../i18n';
import type { ClassNodeData } from '../ClassNode';

export interface ClassNodeHeaderProps {
  data: ClassNodeData;
  isInterface: boolean;
  isItalicName: boolean;
  remoteSelection?: { name: string; color: string };
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
}

export function ClassNodeHeader({
  data,
  isInterface,
  isItalicName,
  remoteSelection,
  menuOpen,
  setMenuOpen,
}: ClassNodeHeaderProps) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.name);
  const doneRef = useRef(false);

  const startEditing = (): void => {
    doneRef.current = false;
    setDraft(data.name);
    setEditing(true);
  };

  const commit = (): void => {
    if (doneRef.current) return;
    doneRef.current = true;
    const trimmed = draft.trim();
    if (trimmed.length > 0 && trimmed !== data.name) {
      data.onRename(trimmed);
    }
    setEditing(false);
  };

  const cancel = (): void => {
    doneRef.current = true;
    setEditing(false);
  };

  return (
    <>
      {remoteSelection && (
        <span
          className="uml-class__remote-badge"
          data-testid={`remote-selection-badge-${data.name}`}
          style={{
            position: 'absolute',
            top: '-20px',
            left: '0',
            backgroundColor: remoteSelection.color,
            color: '#ffffff',
            fontSize: '10px',
            fontWeight: 600,
            padding: '1px 5px',
            borderRadius: '3px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            userSelect: 'none',
            lineHeight: '1.2',
            boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
            zIndex: 10,
          }}
        >
          {remoteSelection.name}
        </span>
      )}

      {menuOpen && (
        <div className="uml-class__context-menu" role="menu" data-testid="class-context-menu">
          {data.otherClasses.length === 0 ? (
            <span className="uml-class__context-empty">{t('node.noOtherClasses')}</span>
          ) : (
            data.otherClasses.map((other) => (
              <button
                key={other.id}
                type="button"
                role="menuitem"
                aria-label={t('node.makeSubclassOf', { name: other.name })}
                onClick={(event) => {
                  event.stopPropagation();
                  data.onMakeSubclass(other.id);
                  setMenuOpen(false);
                }}
              >
                {t('node.makeSubclassOf', { name: other.name })}
              </button>
            ))
          )}
          {data.otherInterfaces.map((iface) => (
            <button
              key={iface.id}
              type="button"
              role="menuitem"
              aria-label={t('node.realize', { name: iface.name })}
              onClick={(event) => {
                event.stopPropagation();
                data.onRealize(iface.id);
                setMenuOpen(false);
              }}
            >
              {t('node.realize', { name: iface.name })}
            </button>
          ))}
          {data.otherClasses.map((other) => (
            <button
              key={`dep-${other.id}`}
              type="button"
              role="menuitem"
              aria-label={t('panel.dependsOn', { name: other.name })}
              onClick={(event) => {
                event.stopPropagation();
                data.onDependOn(other.id);
                setMenuOpen(false);
              }}
            >
              {t('panel.dependsOn', { name: other.name })}
            </button>
          ))}
          {!isInterface && (
            <button
              type="button"
              role="menuitem"
              aria-label={data.isAbstract ? t('node.unmarkAbstract') : t('node.markAbstract')}
              onClick={(event) => {
                event.stopPropagation();
                data.onToggleAbstract(!data.isAbstract);
                setMenuOpen(false);
              }}
            >
              {data.isAbstract ? t('node.unmarkAbstract') : t('node.markAbstract')}
            </button>
          )}
          <button
            type="button"
            aria-label={t('node.closeMenuAria')}
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen(false);
            }}
          >
            {t('node.close')}
          </button>
        </div>
      )}

      {data.selected === true && (
        <button
          type="button"
          className="uml-class__quicklinker nodrag nopan"
          data-testid="quicklinker-arrow"
          aria-label="Quick Linker"
          title={t('node.quickLinkerTitle')}
          onPointerDown={(event) => {
            event.stopPropagation();
            event.preventDefault();
            data.onQuickLinkStart?.(event.clientX, event.clientY);
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path
              d="M 2 12 L 12 2 M 12 2 L 5.5 2 M 12 2 L 12 8.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}

      <span className="uml-class__corner-tab" aria-hidden="true" />

      <div className="uml-class__compartment uml-class__compartment--name">
        {editing ? (
          <input
            className="uml-class__title-input"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') cancel();
            }}
          />
        ) : (
          <div className="uml-class__title" onDoubleClick={startEditing}>
            {isInterface && <div className="uml-class__stereotype">«interface»</div>}
            <span className={`uml-class__name${isItalicName ? ' uml-class__name--italic' : ''}`}>{data.name}</span>
            <button
              type="button"
              className="uml-class__delete"
              aria-label={t('node.deleteAria', { name: data.name })}
              onClick={data.onDelete}
            >
              ×
            </button>
          </div>
        )}
      </div>
    </>
  );
}

