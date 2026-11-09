import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRemoteCursors } from './useRemoteCursors';

describe('Hook useRemoteCursors (realtime:R6)', () => {
  let mockAwareness: {
    clientID: number;
    states: Map<number, any>;
    listeners: Record<string, Function[]>;
    on: any;
    off: any;
    setLocalStateField: any;
    getStates: any;
  };
  let mockProvider: any;

  beforeEach(() => {
    const states = new Map<number, any>();
    const listeners: Record<string, Function[]> = {};

    mockAwareness = {
      clientID: 100,
      states,
      listeners,
      on: vi.fn((event: string, cb: Function) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      }),
      off: vi.fn((event: string, cb: Function) => {
        listeners[event] = (listeners[event] || []).filter((l) => l !== cb);
      }),
      setLocalStateField: vi.fn((field: string, val: any) => {
        const local = states.get(100) || {};
        local[field] = val;
        states.set(100, local);
      }),
      getStates: vi.fn(() => states),
    };

    mockProvider = {
      awareness: mockAwareness,
    };
  });

  it('devuelve lista vacía cuando no hay pares remotos o provider es nulo', () => {
    const { result } = renderHook(() =>
      useRemoteCursors({ provider: null }),
    );
    expect(result.current.remotePeers).toEqual([]);
  });

  it('sincroniza cursores de pares remotos ignorando al cliente local', () => {
    mockAwareness.states.set(100, {
      user: { name: 'Local User', color: '#000000' },
      cursor: { x: 10, y: 10 },
    });
    mockAwareness.states.set(200, {
      user: { name: 'Remoto 1', color: '#0284c7' },
      cursor: { x: 150, y: 250 },
    });

    const { result } = renderHook(() =>
      useRemoteCursors({ provider: mockProvider }),
    );

    expect(result.current.remotePeers.length).toBe(1);
    expect(result.current.remotePeers[0]).toEqual({
      clientId: 200,
      name: 'Remoto 1',
      color: '#0284c7',
      cursor: { x: 150, y: 250 },
      selectedNodeIds: [],
    });
  });

  it('convierte coordenadas con screenToFlowPosition y actualiza awareness en rAF', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb: Function) => {
      cb();
      return 1;
    });

    const screenToFlowPosition = vi.fn((pos: { x: number; y: number }) => ({
      x: pos.x * 2,
      y: pos.y * 2,
    }));

    const { result } = renderHook(() =>
      useRemoteCursors({
        provider: mockProvider,
        screenToFlowPosition,
      }),
    );

    act(() => {
      result.current.updateCursor(50, 75);
    });

    expect(screenToFlowPosition).toHaveBeenCalledWith({ x: 50, y: 75 });
    expect(mockAwareness.setLocalStateField).toHaveBeenCalledWith('cursor', {
      x: 100,
      y: 150,
    });
  });

  it('envía cursor null al ejecutar clearCursor', () => {
    const { result } = renderHook(() =>
      useRemoteCursors({ provider: mockProvider }),
    );

    act(() => {
      result.current.clearCursor();
    });

    expect(mockAwareness.setLocalStateField).toHaveBeenCalledWith('cursor', null);
  });
});
