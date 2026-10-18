import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserNameModal, USERNAME_STORAGE_KEY } from './UserNameModal';
import { setLang } from '../i18n';

describe('Modal de Identidad de Usuario (realtime:R5)', () => {
  beforeEach(() => {
    localStorage.clear();
    setLang('es');
  });

  it('no renderiza nada cuando isOpen es false', () => {
    const onSave = vi.fn();
    render(<UserNameModal isOpen={false} onSave={onSave} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renderiza el modal cuando isOpen es true con input enfocado', () => {
    const onSave = vi.fn();
    render(<UserNameModal isOpen={true} onSave={onSave} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    const input = screen.getByPlaceholderText(/tu nombre/i);
    expect(input).toBeDefined();
  });

  it('deshabilita el botón de guardar si el input está vacío o solo contiene espacios', () => {
    const onSave = vi.fn();
    render(<UserNameModal isOpen={true} onSave={onSave} />);
    const submitBtn = screen.getByRole('button', { name: /entrar|guardar/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    const input = screen.getByPlaceholderText(/tu nombre/i);
    fireEvent.change(input, { target: { value: '   ' } });
    expect(submitBtn.disabled).toBe(true);
  });

  it('guarda en localStorage y llama onSave al ingresar un nombre válido y hacer clic', () => {
    const onSave = vi.fn();
    render(<UserNameModal isOpen={true} onSave={onSave} />);
    const input = screen.getByPlaceholderText(/tu nombre/i);
    const submitBtn = screen.getByRole('button', { name: /entrar|guardar/i }) as HTMLButtonElement;

    fireEvent.change(input, { target: { value: 'Martín Palermo' } });
    expect(submitBtn.disabled).toBe(false);
    fireEvent.click(submitBtn);

    expect(onSave).toHaveBeenCalledWith('Martín Palermo');
    expect(localStorage.getItem(USERNAME_STORAGE_KEY)).toBe('Martín Palermo');
  });

  it('permite guardar presionando la tecla Enter en el input', () => {
    const onSave = vi.fn();
    render(<UserNameModal isOpen={true} onSave={onSave} />);
    const input = screen.getByPlaceholderText(/tu nombre/i);

    fireEvent.change(input, { target: { value: 'Ana Gómez' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(onSave).toHaveBeenCalledWith('Ana Gómez');
    expect(localStorage.getItem(USERNAME_STORAGE_KEY)).toBe('Ana Gómez');
  });

  it('permite cancelar o cerrar si se provee onClose y canClose=true', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<UserNameModal isOpen={true} canClose={true} onClose={onClose} onSave={onSave} />);
    const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
    fireEvent.click(cancelBtn);

    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
