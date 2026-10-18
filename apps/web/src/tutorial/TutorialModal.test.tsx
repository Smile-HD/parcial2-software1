import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TutorialModal, TUTORIAL_STORAGE_KEY } from './TutorialModal';
import { setLang } from '../i18n';

describe('TutorialModal — Tutorial Interactivo Guiado por Amongus (PR 25)', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setLang('es');
  });

  it('no renderiza nada cuando isOpen es false', () => {
    render(<TutorialModal isOpen={false} onClose={mockOnClose} />);
    expect(screen.queryByTestId('tutorial-modal')).toBeNull();
  });

  it('renderiza el primer paso con Amongus cuando isOpen es true', () => {
    render(<TutorialModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByTestId('tutorial-modal')).toBeDefined();
    expect(screen.getByText('Bienvenido a UML Studio')).toBeDefined();
    expect(screen.getByText(/Paso 1 de 5/i)).toBeDefined();
    expect(screen.getByTestId('tutorial-next-btn')).toBeDefined();
    expect(screen.queryByTestId('tutorial-prev-btn')).toBeNull();
  });

  it('avanza por los 5 pasos interactivos al presionar Siguiente', () => {
    render(<TutorialModal isOpen={true} onClose={mockOnClose} />);

    // Paso 1 -> Paso 2
    fireEvent.click(screen.getByTestId('tutorial-next-btn'));
    expect(screen.getByText('1. Seleccionar y Crear la Clase "Cliente"')).toBeDefined();
    expect(screen.getByText(/Paso 2 de 5/i)).toBeDefined();
    expect(screen.getByTestId('tutorial-prev-btn')).toBeDefined();
    expect(screen.getByTestId('tutorial-spotlight-badge')).toBeDefined();
    expect(screen.getByText(/Herramienta: Clase/i)).toBeDefined();

    // Paso 2 -> Paso 3
    fireEvent.click(screen.getByTestId('tutorial-next-btn'));
    expect(screen.getByText('2. Crear la Clase "Pedido"')).toBeDefined();
    expect(screen.getByText(/Paso 3 de 5/i)).toBeDefined();

    // Paso 3 -> Paso 4
    fireEvent.click(screen.getByTestId('tutorial-next-btn'));
    expect(screen.getByText('3. Conectar con Relación (Asociación)')).toBeDefined();
    expect(screen.getByText(/Paso 4 de 5/i)).toBeDefined();

    // Paso 4 -> Paso 5
    fireEvent.click(screen.getByTestId('tutorial-next-btn'));
    expect(screen.getByText('4. Asistente IA y Generar Spring Boot')).toBeDefined();
    expect(screen.getByText(/Paso 5 de 5/i)).toBeDefined();
    expect(screen.getByText('Comenzar a modelar')).toBeDefined();
  });

  it('permite retroceder con el botón Anterior', () => {
    render(<TutorialModal isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(screen.getByTestId('tutorial-next-btn'));
    expect(screen.getByText(/Paso 2 de 5/i)).toBeDefined();

    fireEvent.click(screen.getByTestId('tutorial-prev-btn'));
    expect(screen.getByText(/Paso 1 de 5/i)).toBeDefined();
    expect(screen.getByText('Bienvenido a UML Studio')).toBeDefined();
  });

  it('guarda en localStorage y llama onClose al hacer clic en Omitir', () => {
    render(<TutorialModal isOpen={true} onClose={mockOnClose} />);

    const skipBtn = screen.getByText('Omitir');
    fireEvent.click(skipBtn);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(TUTORIAL_STORAGE_KEY)).toBe('true');
  });

  it('completa el tutorial en el paso final y guarda el estado', () => {
    render(<TutorialModal isOpen={true} onClose={mockOnClose} />);

    // Avanzar hasta el paso 5
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByTestId('tutorial-next-btn'));
    }

    const finishBtn = screen.getByText('Comenzar a modelar');
    fireEvent.click(finishBtn);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(TUTORIAL_STORAGE_KEY)).toBe('true');
  });

  it('renderiza el tutorial en inglés cuando lang es en', () => {
    setLang('en');
    render(<TutorialModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText('Welcome to UML Studio')).toBeDefined();
    expect(screen.getByText(/Step 1 of 5/i)).toBeDefined();
    expect(screen.getByText('Skip')).toBeDefined();
    expect(screen.getByTestId('tutorial-next-btn').textContent).toContain('Next');
  });
});
