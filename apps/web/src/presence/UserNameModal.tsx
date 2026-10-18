import React, { useEffect, useRef, useState } from 'react';
import { pickUserColor } from './palette';
import { presenceInitials } from '../canvas/PresenceBar';
import { useT } from '../i18n';
import './userNameModal.css';

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
  const { lang } = useT();
  const isEn = lang === 'en';

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
      // Ignorar errores en navegadores con almacenamiento deshabilitado
    }
    onSave(trimmed);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-dialog username-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="username-modal-title"
      >
        <div className="username-modal__header">
          <div className="username-modal__badge">
            <span className="username-modal__badge-dot" />
            <span>{isEn ? 'Collaboration Profile' : 'Perfil de Colaboración'}</span>
          </div>

          <div className="username-modal__avatar-wrapper">
            <div
              className="username-modal__avatar"
              style={{ backgroundColor: previewColor }}
              aria-hidden="true"
            >
              {trimmed ? presenceInitials(trimmed) : '?'}
            </div>
            {isValid && <div className="username-modal__status-dot" />}
          </div>

          <h3 id="username-modal-title" className="username-modal__title">
            {canClose
              ? isEn
                ? 'Edit Your Name'
                : 'Editar tu Nombre'
              : isEn
                ? 'Welcome to UML Studio'
                : 'Bienvenido a UML Studio'}
          </h3>
          <p className="username-modal__subtitle">
            {isEn
              ? 'Enter your name so your team and the assistant can identify you in real time.'
              : 'Ingresá tu nombre para que tus compañeros y el asistente te reconozcan en tiempo real.'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="username-modal__body">
            <div className="username-modal__field">
              <label htmlFor="username-input" className="username-modal__label">
                {isEn ? 'Your Display Name' : 'Tu Nombre Visible'}
              </label>
              <div className="username-modal__input-wrapper">
                <span className="username-modal__input-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <input
                  id="username-input"
                  ref={inputRef}
                  type="text"
                  className="username-modal__input"
                  placeholder={isEn ? 'Your name (e.g. Ana López)' : 'Tu nombre (ej. Ana López)'}
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
              </div>
              <div className="username-modal__hint">
                <span>{isEn ? 'Visible on your cursor and chat' : 'Visible en tus cursores y chat'}</span>
                <span>{name.length} / 32</span>
              </div>
            </div>
          </div>

          <div className="username-modal__footer">
            {canClose && onClose && (
              <button
                type="button"
                className="username-modal__btn username-modal__btn--secondary"
                onClick={onClose}
              >
                {isEn ? 'Cancel' : 'Cancelar'}
              </button>
            )}
            <button
              type="submit"
              className="username-modal__btn username-modal__btn--primary"
              disabled={!isValid}
            >
              {canClose
                ? isEn
                  ? 'Save'
                  : 'Guardar'
                : isEn
                  ? 'Enter canvas'
                  : 'Entrar a la sala'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
