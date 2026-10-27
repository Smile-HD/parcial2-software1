import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatPanel } from './ChatPanel';
import * as chatApi from './chatApi';
import { setLang } from '../i18n';

vi.mock('./chatApi', () => ({
  DEVICE_ID_STORAGE_KEY: 'uml_device_id',
  getDeviceId: vi.fn(() => 'test-device-uuid'),
  fetchChatMessages: vi.fn(),
  sendChatMessage: vi.fn(),
}));

describe('ChatPanel — Panel de Chat Colaborativo y Asistente Amongus (PR 24)', () => {
  const mockDiagramId = 'diag-1234';
  const mockUserName = 'Pepe';
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    setLang('es');
    vi.mocked(chatApi.fetchChatMessages).mockResolvedValue([]);
    vi.mocked(chatApi.sendChatMessage).mockResolvedValue({
      id: 'msg-1',
      diagramId: mockDiagramId,
      deviceId: 'test-device-uuid',
      senderName: mockUserName,
      senderType: 'user',
      channelType: 'group',
      targetUser: null,
      content: 'Mensaje de prueba',
      createdAt: new Date().toISOString(),
    });
  });

  it('no renderiza nada cuando isOpen es false', () => {
    render(
      <ChatPanel
        diagramId={mockDiagramId}
        userName={mockUserName}
        isOpen={false}
        onClose={mockOnClose}
      />
    );
    expect(screen.queryByTestId('chat-panel')).toBeNull();
  });

  it('renderiza cabecera, pestañas Equipo/Amongus e input cuando isOpen es true', async () => {
    render(
      <ChatPanel
        diagramId={mockDiagramId}
        userName={mockUserName}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByTestId('chat-panel')).toBeDefined();
    expect(screen.getByText('Chat del Diagrama')).toBeDefined();
    expect(screen.getByTestId('chat-tab-group')).toBeDefined();
    expect(screen.getByTestId('chat-tab-amongus')).toBeDefined();
    expect(screen.getByTestId('chat-input')).toBeDefined();
    expect(screen.getByTestId('chat-send-btn')).toBeDefined();
  });

  it('renderiza mensajes de usuarios y de Amongus correctamente sin emojis', async () => {
    vi.mocked(chatApi.fetchChatMessages).mockResolvedValueOnce([
      {
        id: '1',
        diagramId: mockDiagramId,
        deviceId: 'other-device',
        senderName: 'Ana',
        senderType: 'user',
        channelType: 'group',
        targetUser: null,
        content: 'Hola Pepe',
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        diagramId: mockDiagramId,
        deviceId: 'bot-device',
        senderName: 'Amongus',
        senderType: 'bot',
        channelType: 'group',
        targetUser: null,
        content: 'Hola a todos, soy Amongus',
        createdAt: new Date().toISOString(),
      },
    ]);

    render(
      <ChatPanel
        diagramId={mockDiagramId}
        userName={mockUserName}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Hola Pepe')).toBeDefined();
      expect(screen.getByText('Hola a todos, soy Amongus')).toBeDefined();
    });

    expect(screen.getByText('Ana')).toBeDefined();
    expect(screen.getAllByText('Amongus').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Bot')).toBeDefined();
  });

  it('permite cambiar a la pestaña de Amongus y consulta mensajes de direct_bot', async () => {
    render(
      <ChatPanel
        diagramId={mockDiagramId}
        userName={mockUserName}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    const amongusTab = screen.getByTestId('chat-tab-amongus');
    fireEvent.click(amongusTab);

    await waitFor(() => {
      expect(chatApi.fetchChatMessages).toHaveBeenCalledWith(
        mockDiagramId,
        'direct_bot',
        'test-device-uuid',
        mockUserName
      );
    });
  });

  it('envía un nuevo mensaje al hacer clic en el botón de enviar o presionar Enter', async () => {
    render(
      <ChatPanel
        diagramId={mockDiagramId}
        userName={mockUserName}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: 'Nuevo mensaje para el equipo' } });

    const sendBtn = screen.getByTestId('chat-send-btn') as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(false);
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(chatApi.sendChatMessage).toHaveBeenCalledWith(
        mockDiagramId,
        expect.objectContaining({
          deviceId: 'test-device-uuid',
          senderName: mockUserName,
          channelType: 'group',
          content: 'Nuevo mensaje para el equipo',
          language: 'es',
        }),
      );
    });
  });

  it('cierra el panel cuando se presiona el botón de cerrar', () => {
    render(
      <ChatPanel
        diagramId={mockDiagramId}
        userName={mockUserName}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    const closeBtn = screen.getByLabelText('Cerrar chat');
    fireEvent.click(closeBtn);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('renderiza la interfaz en inglés cuando se selecciona lang=en', () => {
    setLang('en');
    render(
      <ChatPanel
        diagramId={mockDiagramId}
        userName={mockUserName}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText('Diagram Chat')).toBeDefined();
    expect(screen.getByText('Team')).toBeDefined();
    expect(screen.getByPlaceholderText(/Write a message/i)).toBeDefined();
  });

  it('despliega el popover de comandos al escribir / y permite autocompletar', async () => {
    render(
      <ChatPanel
        diagramId={mockDiagramId}
        userName={mockUserName}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    const input = screen.getByTestId('chat-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '/' } });

    // El popover de comandos debe renderizarse
    expect(screen.getByRole('listbox', { name: 'Comandos slash' })).toBeDefined();
    expect(screen.getByText('/help [comando]')).toBeDefined();
    expect(screen.getByText('/model <tema>')).toBeDefined();
    expect(screen.getByText('/audit')).toBeDefined();

    // Presionar Tab o hacer clic para autocompletar
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(input.value).toBe('/help ');
  });

  it('ejecuta /help en el cliente mostrando la tarjeta de ayuda instantánea', async () => {
    render(
      <ChatPanel
        diagramId={mockDiagramId}
        userName={mockUserName}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: '/help' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Debe mostrar la respuesta de ayuda de Amongus sin llamar a la API
    await waitFor(() => {
      expect(screen.getByText(/Guía de Comandos de Amongus/i)).toBeDefined();
    });
    expect(chatApi.sendChatMessage).not.toHaveBeenCalled();
  });

  it('no muestra el banner de error cuando es un error de delta ya utilizado (already used)', () => {
    render(
      <ChatPanel
        diagramId={mockDiagramId}
        userName={mockUserName}
        isOpen={true}
        onClose={mockOnClose}
        interpreterError="Unknown or already used delta id"
      />
    );

    expect(screen.queryByText(/Unknown or already used/i)).toBeNull();
  });

  it('permite descartar manualmente el mensaje de error con el botón de cierre', async () => {
    render(
      <ChatPanel
        diagramId={mockDiagramId}
        userName={mockUserName}
        isOpen={true}
        onClose={mockOnClose}
        interpreterError="Falla de conexión con el modelo"
      />
    );

    expect(screen.getByText('Falla de conexión con el modelo')).toBeDefined();
    const dismissBtn = screen.getByRole('button', { name: 'Cerrar error' });
    fireEvent.click(dismissBtn);

    expect(screen.queryByText('Falla de conexión con el modelo')).toBeNull();
  });

  it('ejecuta /apply para confirmar una propuesta activa pendiente', async () => {
    const mockOnConfirm = vi.fn();
    render(
      <ChatPanel
        diagramId={mockDiagramId}
        userName={mockUserName}
        isOpen={true}
        onClose={mockOnClose}
        onConfirmProposal={mockOnConfirm}
        activeProposal={{
          deltaId: 'proposal-999',
          delta: {
            kind: 'class',
            op: 'create',
            name: 'Devolucion',
            attributes: [],
            methods: [],
            position: { x: 100, y: 100 },
          },
        }}
      />
    );

    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: '/apply' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalledWith('proposal-999', expect.any(Object));
    });
  });

  it('delega /apply al backend mediante sendMessage sin duplicar mensajes locales cuando no hay propuesta activa', async () => {
    render(
      <ChatPanel
        diagramId={mockDiagramId}
        userName={mockUserName}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: '/apply' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(chatApi.sendChatMessage).toHaveBeenCalledWith(
        mockDiagramId,
        expect.objectContaining({ content: '/apply' })
      );
    });
  });
});
