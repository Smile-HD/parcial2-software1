import React, { useEffect, useRef, useState } from 'react';
import { pickUserColor } from './palette';
import { presenceInitials } from '../canvas/PresenceBar';

export const USERNAME_STORAGE_KEY = 'ai_uml_username';

export interface UserNameModalProps {
  isOpen: boolean;
  initialName?: string;
  canClose?: boolean;
  onClose?: () => void;
  onSave: (name: string) => void;
}

export function UserNameModal({
  isOpen,
  initialName = '',
  canClose = false,
  onClose,
  onSave,
}: UserNameModalProps) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialName]);

  if (!isOpen) {
    return null;
  }

  const trimmed = name.trim();
  const isValid = trimmed.length > 0;
  const previewColor = isValid ? pickUserColor(trimmed) : '#94a3b8';

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isValid) return;
    try {
      localStorage.setItem(USERNAME_STORAGE_KEY, trimmed);
    } catch {
      // Ignorar errores de acceso a almacenamiento
    }
    onSave(trimmed);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="username-modal-title"
        style={{ maxWidth: '420px', textAlign: 'center' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: previewColor,
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              transition: 'background-color 0.2s ease',
            }}
            aria-hidden="true"
          >
            {trimmed ? presenceInitials(trimmed) : '?'}
          </div>
        </div>

        <h3 id="username-modal-title" style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600 }}>
          {canClose ? 'Editar tu Nombre' : 'Bienvenido al Diagramador UML'}
        </h3>
        <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#64748b' }}>
          Ingresá tu nombre para que tus compañeros y el asistente IA te reconozcan en tiempo real.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="input-text"
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: '15px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              marginBottom: '20px',
              boxSizing: 'border-box',
              outline: 'none',
            }}
            placeholder="Tu nombre (ej. Ana López)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
            maxLength={32}
            autoFocus
          />

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            {canClose && onClose && (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={onClose}
                style={{ padding: '8px 16px', borderRadius: '6px' }}
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              className="btn btn--primary"
              disabled={!isValid}
              style={{
                padding: '8px 20px',
                borderRadius: '6px',
                opacity: isValid ? 1 : 0.5,
                cursor: isValid ? 'pointer' : 'not-allowed',
              }}
            >
              {canClose ? 'Guardar' : 'Entrar a la sala'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
