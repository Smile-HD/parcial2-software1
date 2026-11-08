/**
 * Compartimento de métodos (operaciones) de ClassNode: lista de métodos, edición inline y formulario de agregado.
 */
import { useState, type KeyboardEvent } from 'react';
import type { Method, Parameter, Visibility } from '@app/core';
import { useT } from '../../i18n';
import type { ClassNodeData } from '../ClassNode';

export function parseParameters(input: string): Parameter[] {
  return input
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const colon = entry.indexOf(':');
      const name = (colon === -1 ? entry : entry.slice(0, colon)).trim();
      const type = (colon === -1 ? '' : entry.slice(colon + 1)).trim();
      return { name, type: type || 'any' };
    })
    .filter((param) => param.name.length > 0);
}

export function renderMethod(method: Method): string {
  const vis = method.visibility ?? '+';
  const params = method.parameters.map((p) => p.type).join(', ');
  return `${vis}${method.name}(${params}): ${method.returnType}`;
}

export interface ClassNodeMethodsProps {
  data: ClassNodeData;
}

export function ClassNodeMethods({ data }: ClassNodeMethodsProps) {
  const { t } = useT();

  const [methodName, setMethodName] = useState('');
  const [methodReturnType, setMethodReturnType] = useState('');
  const [methodParams, setMethodParams] = useState('');
  const [methodVisibility, setMethodVisibility] = useState<Visibility>('+' as Visibility);
  const [methodStatic, setMethodStatic] = useState(false);
  const [methodError, setMethodError] = useState<string | null>(null);

  const [editingMethodId, setEditingMethodId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');
  const [editParams, setEditParams] = useState('');
  const [editVisibility, setEditVisibility] = useState<Visibility>('+' as Visibility);
  const [editStatic, setEditStatic] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const submitMethod = (): void => {
    const name = methodName.trim();
    if (name.length === 0) {
      setMethodError(t('node.methodNameRequired'));
      return;
    }
    setMethodError(null);
    data.onAddMethod(name, methodReturnType.trim() || 'void', parseParameters(methodParams), {
      visibility: methodVisibility,
      isStatic: methodStatic,
    });
    setMethodName('');
    setMethodReturnType('');
    setMethodParams('');
    setMethodStatic(false);
  };

  const startEditMethod = (method: Method): void => {
    setEditingMethodId(method.id);
    setEditName(method.name);
    setEditType(method.returnType);
    setEditParams(method.parameters.map((param) => `${param.name}: ${param.type}`).join(', '));
    setEditVisibility((method.visibility ?? '+') as Visibility);
    setEditStatic(method.isStatic ?? false);
    setEditError(null);
  };

  const cancelEdit = (): void => {
    setEditingMethodId(null);
    setEditError(null);
  };

  const commitEdit = (): void => {
    if (editingMethodId === null) return;
    const name = editName.trim();
    const type = editType.trim();
    if (name.length === 0 || type.length === 0) {
      setEditError(t('node.nameTypeRequired'));
      return;
    }
    data.onEditMethod(editingMethodId, name, type, parseParameters(editParams), {
      visibility: editVisibility,
      isStatic: editStatic,
    });
    setEditingMethodId(null);
    setEditError(null);
  };

  const editKeyHandlers = {
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') commitEdit();
      if (e.key === 'Escape') cancelEdit();
    },
  };

  return (
    <div className="uml-class__compartment uml-class__compartment--operations">
      {data.methods.length > 0 && (
        <div className="uml-class__section">
          {data.methods.map((method) => {
            if (editingMethodId === method.id) {
              return (
                <div key={method.id} className="uml-class__member uml-class__edit">
                  <input
                    className="uml-class__add-input"
                    aria-label={t('node.editMethodNameAria')}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    {...editKeyHandlers}
                  />
                  <input
                    className="uml-class__add-input"
                    aria-label={t('node.editMethodReturnTypeAria')}
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    {...editKeyHandlers}
                  />
                  <input
                    className="uml-class__add-input"
                    aria-label={t('node.editMethodParamsAria')}
                    placeholder={t('node.phParams')}
                    value={editParams}
                    onChange={(e) => setEditParams(e.target.value)}
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
              );
            }
            return (
              <div key={method.id} className="uml-class__member">
                <span
                  className={`uml-class__member-text${method.isStatic ? ' uml-member--static' : ''}`}
                  data-testid={`method-${method.name}`}
                >
                  {renderMethod(method)}
                </span>
                <button
                  type="button"
                  className="uml-class__edit-button"
                  aria-label={t('node.editMethodAria', { name: method.name })}
                  onClick={() => startEditMethod(method)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="uml-class__remove"
                  aria-label={t('node.removeMethodAria', { name: method.name })}
                  onClick={() => data.onRemoveMethod(method.id)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="uml-class__section uml-class__add">
        <select
          className="uml-class__add-input"
          aria-label={t('node.methodVisibilityAria')}
          value={methodVisibility}
          onChange={(e) => setMethodVisibility(e.target.value as Visibility)}
        >
          <option value="+">+</option>
          <option value="-">-</option>
          <option value="#">#</option>
          <option value="~">~</option>
        </select>
        <input
          className="uml-class__add-input"
          aria-label={t('node.methodNameAria')}
          placeholder={t('node.phName')}
          value={methodName}
          onChange={(e) => setMethodName(e.target.value)}
        />
        <input
          className="uml-class__add-input"
          aria-label={t('node.methodReturnTypeAria')}
          placeholder={t('node.phReturnType')}
          value={methodReturnType}
          onChange={(e) => setMethodReturnType(e.target.value)}
        />
        <input
          className="uml-class__add-input"
          aria-label={t('node.methodParamsAria')}
          placeholder={t('node.phParams')}
          value={methodParams}
          onChange={(e) => setMethodParams(e.target.value)}
        />
        <label className="uml-class__toggle">
          <input
            type="checkbox"
            aria-label={t('node.methodStaticAria')}
            checked={methodStatic}
            onChange={(e) => setMethodStatic(e.target.checked)}
          />
          {t('node.static')}
        </label>
        <button
          type="button"
          className="uml-class__add-button"
          aria-label={t('node.addMethodAria')}
          onClick={submitMethod}
        >
          +
        </button>
        {methodError !== null && (
          <p className="uml-class__validation" role="alert">
            {methodError}
          </p>
        )}
      </div>
    </div>
  );
}

