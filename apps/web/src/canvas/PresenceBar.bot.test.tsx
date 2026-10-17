import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PresenceBar } from './PresenceBar';

describe('PresenceBar - Presencia Virtual del Bot IA (Unidad 22.1)', () => {
  it('renderiza el chip del Bot IA cuando se provee la prop bot', () => {
    render(
      <PresenceBar
        users={[{ name: 'Ana', color: '#0ea5e9' }]}
        bot={{ status: 'idle' }}
      />
    );

    const botChip = screen.getByText('🤖 Bot IA');
    expect(botChip).toBeTruthy();
    const botUserElement = botChip.closest('.presence-bar__user--bot');
    expect(botUserElement).not.toBeNull();
    expect(botUserElement?.getAttribute('title')).toContain('disponible');
  });

  it('permite personalizar el nombre del bot', () => {
    render(
      <PresenceBar
        users={[]}
        bot={{ name: 'Asistente UML', status: 'idle' }}
      />
    );

    expect(screen.getByText('Asistente UML')).toBeTruthy();
  });

  it('muestra estado "pensando" con clase y texto indicador', () => {
    const { container } = render(
      <PresenceBar
        users={[{ name: 'Ana', color: '#0ea5e9' }]}
        bot={{ status: 'thinking' }}
      />
    );

    const botElement = container.querySelector('.presence-bar__user--bot-thinking');
    expect(botElement).not.toBeNull();
    expect(botElement?.getAttribute('title')).toContain('pensando');
    expect(screen.getByText('Pensando...')).toBeTruthy();
  });

  it('muestra estado "aplicando" con clase y texto indicador', () => {
    const { container } = render(
      <PresenceBar
        users={[{ name: 'Ana', color: '#0ea5e9' }]}
        bot={{ status: 'applying' }}
      />
    );

    const botElement = container.querySelector('.presence-bar__user--bot-applying');
    expect(botElement).not.toBeNull();
    expect(botElement?.getAttribute('title')).toContain('aplicando');
    expect(screen.getByText('Aplicando...')).toBeTruthy();
  });

  it('no renderiza el chip del bot si bot es null o no se provee', () => {
    render(
      <PresenceBar
        users={[{ name: 'Ana', color: '#0ea5e9' }]}
        bot={null}
      />
    );

    expect(screen.queryByText('🤖 Bot IA')).toBeNull();
  });
});
