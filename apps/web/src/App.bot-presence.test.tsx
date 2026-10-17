import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { App, createEmptyDiagram } from './App';
import { bytesToBase64 } from './api/base64';
import { encodeYDoc, buildYDocFromDiagram } from '@app/core';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('App - Presencia y Estados Reactivos del Bot IA (Unidad 22.3)', () => {
  const diagramId = '11111111-2222-4333-8444-555555555555';
  const emptyDiag = createEmptyDiagram(diagramId);

  beforeEach(() => {
    window.location.hash = `#/d/${diagramId}`;
    localStorage.setItem('ea_uml_user_name', 'Ana');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renderiza permanentemente el chip del 🤖 Bot IA en estado disponible', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes(`/diagrams/${diagramId}`)) {
        return Promise.resolve(
          jsonResponse({
            id: diagramId,
            name: 'Untitled',
            diagram: emptyDiag,
            yjsState: bytesToBase64(encodeYDoc(buildYDocFromDiagram(emptyDiag))),
            version: 1,
            createdAt: 't',
            updatedAt: 't',
          })
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App collabUrl={null} />);

    await waitFor(() => {
      expect(screen.getByText('🤖 Bot IA')).toBeTruthy();
    });

    const botChip = screen.getByText('🤖 Bot IA').closest('.presence-bar__user--bot');
    expect(botChip).not.toBeNull();
    expect(botChip?.getAttribute('title')).toContain('disponible');
  });

  it('cambia el estado del bot a "pensando" al enviar un comando de lenguaje natural', async () => {
    let resolveInterpret: ((value: any) => void) | null = null;
    const interpretPromise = new Promise((resolve) => {
      resolveInterpret = resolve;
    });

    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes(`/diagrams/${diagramId}/interpret`)) {
        return interpretPromise;
      }
      if (url.includes(`/diagrams/${diagramId}`)) {
        return Promise.resolve(
          jsonResponse({
            id: diagramId,
            name: 'Untitled',
            diagram: emptyDiag,
            yjsState: bytesToBase64(encodeYDoc(buildYDocFromDiagram(emptyDiag))),
            version: 1,
            createdAt: 't',
            updatedAt: 't',
          })
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App collabUrl={null} />);

    await waitFor(() => {
      expect(screen.getByText('🤖 Bot IA')).toBeTruthy();
    });

    const input = screen.getByRole('textbox', { name: /natural language command/i });
    fireEvent.change(input, { target: { value: 'crear clase Persona' } });

    const sendBtn = screen.getByRole('button', { name: /send/i });
    fireEvent.click(sendBtn);

    // Estado pensando en el chip del bot
    await waitFor(() => {
      const botThinking = document.querySelector('.presence-bar__user--bot-thinking');
      expect(botThinking).not.toBeNull();
      expect(screen.getByText('Pensando...')).toBeTruthy();
    });

    // Resolver interpretación
    await act(async () => {
      resolveInterpret?.(
        jsonResponse({
          outcome: 'success',
          deltaId: 'd1',
          delta: {
            operations: [],
          },
        })
      );
    });
  });
});
