/**
 * Compartimento de atributos de ClassNode: lista de atributos, edición inline y formulario de agregado.
 */
import { useState, type KeyboardEvent } from 'react';
import type { Attribute, Visibility } from '@app/core';
import { useT } from '../../i18n';
import type { ClassNodeData, MemberAdornments } from '../ClassNode';

export function renderAttribute(attr: Attribute): string {
  const vis = attr.visibility ?? '+';
  const name = (attr.isDerived ? '/' : '') + attr.name;
  const mult = attr.multiplicity !== undefined ? ` [${attr.multiplicity}]` : '';
  return `${vis}${name}: ${attr.type}${mult}`;
}

export interface ClassNodeAttributesProps {
  data: ClassNodeData;
}

export function ClassNodeAttributes({ data }: ClassNodeAttributesProps) {
  const { t } = useT();

  const [attrName, setAttrName] = useState('');
  const [attrType, setAttrType] = useState('');
  const [attrVisibility, setAttrVisibility] = useState<Visibility>('+' as Visibility);
  const [attrStatic, setAttrStatic] = useState(false);
  const [attrDerived, setAttrDerived] = useState(false);
  const [attrMultiplicity, setAttrMultiplicity] = useState('');
  const [attrError, setAttrError] = useState<string | null>(null);

  const [editingAttrId, setEditingAttrId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');
  const [editVisibility, setEditVisibility] = useState<Visibility>('+' as Visibility);
  const [editStatic, setEditStatic] = useState(false);
  const [editDerived, setEditDerived] = useState(false);
  const [editMultiplicity, setEditMultiplicity] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const submitAttribute = (): void => {
    const name = attrName.trim();
    const type = attrType.trim();
    if (name.length === 0) {
      setAttrError(t('node.attrNameRequired'));
      return;
    }
    setAttrError(null);
    data.onAddAttribute(name, type, {
      visibility: attrVisibility,
      isStatic: attrStatic,
      isDerived: attrDerived,
      multiplicity: attrMultiplicity.trim() || undefined,
    });
    setAttrName('');
    setAttrType('');
    setAttrMultiplicity('');
    setAttrStatic(false);
    setAttrDerived(false);
  };

  const startEditAttribute = (attr: Attribute): void => {
    setEditingAttrId(attr.id);
    setEditName(attr.name);
    setEditType(attr.type);
    setEditVisibility((attr.visibility ?? '+') as Visibility);
    setEditStatic(attr.isStatic ?? false);
    setEditDerived(attr.isDerived ?? false);
    setEditMultiplicity(attr.multiplicity ?? '');
    setEditError(null);
  };

  const cancelEdit = (): void => {
    setEditingAttrId(null);
    setEditError(null);
  };

  const commitEdit = (): void => {
    if (editingAttrId === null) return;
    const name = editName.trim();
    const type = editType.trim();
    if (name.length === 0 || type.length === 0) {
      setEditError(t('node.nameTypeRequired'));
      return;
    }
    data.onEditAttribute(editingAttrId, name, type, {
      visibility: editVisibility,
      isStatic: editStatic,
      isDerived: editDerived,
      multiplicity: editMultiplicity.trim() || undefined,
    });
    setEditingAttrId(null);
    setEditError(null);
  };

  const editKeyHandlers = {
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') commitEdit();
      if (e.key === 'Escape') cancelEdit();
    },
  };

  return (
    <div className="uml-class__compartment uml-class__compartment--attributes">
      {data.attributes.length > 0 && (
        <div className="uml-class__section">
          {data.attributes.map((attr) =>
            editingAttrId === attr.id ? (
              <div key={attr.id} className="uml-class__member uml-class__edit">
                <input
                  className="uml-class__add-input"
                  aria-label={t('node.editAttrNameAria')}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  {...editKeyHandlers}
                />
                <input
                  className="uml-class__add-input"
                  aria-label={t('node.editAttrTypeAria')}
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  {...editKeyHandlers}
                />
                <button
                  type="button"
                  className="uml-class__add-button"
                  aria-label={t('node.confirmEditAria')}
                  onClick={commitEdit}
                >
                  ✓
                </button>
                <button
                  type="button"
                  className="uml-class__remove"
                  aria-label={t('node.cancelEditAria')}
                  onClick={cancelEdit}
                >
                  ×
                </button>
                {editError !== null && (
                  <p className="uml-class__validation" role="alert">
                    {editError}
                  </p>
                )}
              </div>
            ) : (
              <div
                key={attr.id}
                className={`uml-class__member ${(attr as any).isGhost ? 'uml-class__member--ghost' : ''}`}
              >
                <span
                  className={`uml-class__member-text${attr.isStatic ? ' uml-member--static' : ''}`}
                  data-testid={`attr-${attr.name}`}
                >
                  {renderAttribute(attr)}
                  {(attr as any).isGhost && <span className="uml-class__ghost-tag"> (propuesta)</span>}
                </span>
                {!(attr as any).isGhost && (
                  <>
                    <button
                      type="button"
                      className="uml-class__edit-button"
                      aria-label={t('node.editAttrAria', { name: attr.name })}
                      onClick={() => startEditAttribute(attr)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="uml-class__remove"
                      aria-label={t('node.removeAttrAria', { name: attr.name })}
                      onClick={() => data.onRemoveAttribute(attr.id)}
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            ),
          )}
        </div>
      )}

      <div className="uml-class__section uml-class__add">
        <select
          className="uml-class__add-input"
          aria-label={t('node.attrVisibilityAria')}
          value={attrVisibility}
          onChange={(e) => setAttrVisibility(e.target.value as Visibility)}
        >
          <option value="+">+</option>
          <option value="-">-</option>
          <option value="#">#</option>
          <option value="~">~</option>
        </select>
        <input
          className="uml-class__add-input"
          aria-label={t('node.attrNameAria')}
          placeholder={t('node.phName')}
          value={attrName}
          onChange={(e) => setAttrName(e.target.value)}
        />
        <input
          className="uml-class__add-input"
          aria-label={t('node.attrTypeAria')}
          placeholder={t('node.phType')}
          value={attrType}
          onChange={(e) => setAttrType(e.target.value)}
        />
        <input
          className="uml-class__add-input"
          aria-label={t('node.attrMultiplicityAria')}
          placeholder="[0..*]"
          value={attrMultiplicity}
          onChange={(e) => setAttrMultiplicity(e.target.value)}
        />
        <label className="uml-class__toggle">
          <input
            type="checkbox"
            aria-label={t('node.attrStaticAria')}
            checked={attrStatic}
            onChange={(e) => setAttrStatic(e.target.checked)}
          />
          {t('node.static')}
        </label>
        <label className="uml-class__toggle">
          <input
            type="checkbox"
            aria-label={t('node.attrDerivedAria')}
            checked={attrDerived}
            onChange={(e) => setAttrDerived(e.target.checked)}
          />
          {t('node.derived')}
        </label>
        <button
          type="button"
          className="uml-class__add-button"
          aria-label={t('node.addAttrAria')}
          onClick={submitAttribute}
        >
          +
        </button>
        {attrError !== null && (
          <p className="uml-class__validation" role="alert">
            {attrError}
          </p>
        )}
      </div>
    </div>
  );
}

