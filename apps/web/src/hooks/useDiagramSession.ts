/**
 * Hook de ciclo de vida de sesión de diagrama, persistencia de Yjs y colaboración en tiempo real.
 */
import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import {
  applyUpdateToYDoc,
  encodeYDoc,
  projectYDocToDiagram,
  type Diagram,
} from '@app/core';
import {
  DiagramApiError,
  createDiagram,
  loadDiagram,
  saveDiagram,
  type DiagramResource,
} from '../api/diagramApi';
import { base64ToBytes, bytesToBase64 } from '../api/base64';
import { pickUserColor } from '../presence/palette';
import { USERNAME_STORAGE_KEY } from '../presence/UserNameModal';
import type { PresenceUser } from '../canvas/PresenceBar';
import { t } from '../i18n';

const DIAGRAM_NAME = 'Untitled';
const COLLAB_URL: string = import.meta.env.VITE_COLLAB_URL ?? 'ws://localhost:1234';
const SAVE_MAX_ATTEMPTS = 3;

export function diagramIdFromHash(hash: string): string | null {
  const match = /^#\/d\/(.+)$/.exec(hash);
  return match?.[1] ?? null;
}

export function createEmptyDiagram(id: string): Diagram {
  return {
    id,
    name: DIAGRAM_NAME,
    classes: [],
    associations: [],
    generalizations: [],
    realizations: [],
    dependencies: [],
    naryAssociations: [],
  };
}

export function hydrateDiagramIntoDoc(doc: Y.Doc, yjsStateBase64: string): Y.Doc {
  return applyUpdateToYDoc(doc, base64ToBytes(yjsStateBase64));
}

export type SaveOutcome =
  | { ok: true; version: number }
  | { ok: false; status: number; message: string; currentVersion?: number | undefined };

export async function saveDiagramFromDoc(
  doc: Y.Doc,
  expectedVersion: number,
  maxAttempts: number = SAVE_MAX_ATTEMPTS,
): Promise<SaveOutcome> {
  let version = expectedVersion;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const diagram = projectYDocToDiagram(doc);
    const yjsState = bytesToBase64(encodeYDoc(doc));
    try {
      const resource = await saveDiagram(diagram.id, diagram.name, diagram, version, yjsState);
      return { ok: true, version: resource.version };
    } catch (error) {
      if (error instanceof DiagramApiError && error.status === 409 && error.currentVersion !== undefined) {
        version = error.currentVersion;
        continue;
      }
      if (error instanceof DiagramApiError) {
        return {
          ok: false,
          status: error.status,
          message: error.message,
          currentVersion: error.currentVersion,
        };
      }
      return { ok: false, status: 0, message: t('app.apiConnectFailed') };
    }
  }
  return {
    ok: false,
    status: 409,
    message: t('app.saveRetryExhausted'),
  };
}

export type LoadStatus = 'loading' | 'ready' | 'error';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

interface AwarenessUser {
  user?: {
    name?: string;
    color?: string;
  };
}

export function getInitialUserName(): { name: string; isPromptNeeded: boolean } {
  try {
    const stored = localStorage.getItem(USERNAME_STORAGE_KEY);
    if (stored && stored.trim().length > 0) {
      return { name: stored.trim(), isPromptNeeded: false };
    }
  } catch {}
  return {
    name: `User-${Math.random().toString(16).slice(2, 6)}`,
    isPromptNeeded: import.meta.env.MODE !== 'test',
  };
}

export function resolveCollabUrl(collabUrl?: string | null): string | null {
  if (collabUrl !== undefined) {
    return collabUrl;
  }
  if (import.meta.env.MODE === 'test') {
    return null;
  }
  return COLLAB_URL;
}

export interface UseDiagramSessionOptions {
  doc: Y.Doc;
  collabUrl?: string | null;
}

export function useDiagramSession({ doc, collabUrl }: UseDiagramSessionOptions) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [peers, setPeers] = useState<readonly string[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const didInit = useRef(false);
  const initialUser = useRef(getInitialUserName());
  const [userName, setUserName] = useState(initialUser.current.name);
  const [isNameModalOpen, setIsNameModalOpen] = useState(initialUser.current.isPromptNeeded);
  const [peerUsers, setPeerUsers] = useState<readonly PresenceUser[]>([]);
  const providerRef = useRef<WebsocketProvider | null>(null);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const hydrate = (resource: DiagramResource): void => {
      hydrateDiagramIntoDoc(doc, resource.yjsState);
      setVersion(resource.version);
      setRoomId(resource.id);
      setStatus('ready');
    };

    const fail = (error: unknown): void => {
      setErrorMessage(error instanceof DiagramApiError ? error.message : t('app.apiConnectFailed'));
      setStatus('error');
    };

    const existingId = diagramIdFromHash(window.location.hash);
    if (existingId !== null) {
      loadDiagram(existingId).then(hydrate).catch(fail);
      return;
    }

    const newId = crypto.randomUUID();
    createDiagram(DIAGRAM_NAME, createEmptyDiagram(newId))
      .then((resource) => {
        window.location.hash = `#/d/${resource.diagram.id}`;
        hydrate(resource);
      })
      .catch(fail);
  }, [doc]);

  useEffect(() => {
    if (providerRef.current !== null) {
      providerRef.current.awareness.setLocalStateField('user', {
        name: userName,
        color: pickUserColor(userName),
      });
    }
  }, [userName]);

  const resolvedCollabUrl = resolveCollabUrl(collabUrl);
  useEffect(() => {
    if (status !== 'ready' || roomId === null || resolvedCollabUrl === null) {
      return;
    }
    if (providerRef.current !== null) {
      return;
    }
    const provider = new WebsocketProvider(resolvedCollabUrl, `diagrams/${roomId}`, doc, {
      connect: true,
    });
    providerRef.current = provider;
    provider.awareness.setLocalStateField('user', {
      name: userName,
      color: pickUserColor(userName),
    });

    const syncPresence = (): void => {
      const states = provider.awareness.getStates();
      const localClientId = provider.awareness.clientID;
      const currentUsers: PresenceUser[] = [];
      const names: string[] = [];

      for (const [clientId, state] of states.entries()) {
        const u = (state as AwarenessUser).user;
        if (typeof u?.name === 'string') {
          names.push(u.name);
          currentUsers.push({
            name: u.name,
            color: u.color ?? pickUserColor(u.name),
            isSelf: clientId === localClientId,
          });
        }
      }
      setPeers((prev) => {
        if (prev.length === names.length && prev.every((n, i) => n === names[i])) {
          return prev;
        }
        return names;
      });
      setPeerUsers((prev) => {
        if (
          prev.length === currentUsers.length &&
          prev.every(
            (u, i) =>
              u.name === currentUsers[i]?.name &&
              u.color === currentUsers[i]?.color &&
              u.isSelf === currentUsers[i]?.isSelf,
          )
        ) {
          return prev;
        }
        return currentUsers;
      });
    };
    provider.awareness.on('change', syncPresence);
    syncPresence();

    return () => {
      provider.awareness.off('change', syncPresence);
      provider.destroy();
      providerRef.current = null;
    };
  }, [status, roomId, doc, resolvedCollabUrl, userName]);

  const handleSave = (): void => {
    if (version === null || status !== 'ready') return;
    setSaveStatus('saving');
    setSaveMessage(null);
    void saveDiagramFromDoc(doc, version).then((outcome) => {
      if (outcome.ok) {
        setVersion(outcome.version);
        setSaveStatus('saved');
        setSaveMessage(null);
        return;
      }
      setSaveStatus('failed');
      setSaveMessage(
        outcome.status === 409 && outcome.currentVersion !== undefined
          ? `${outcome.message} (current version: ${outcome.currentVersion})`
          : outcome.message,
      );
    });
  };

  return {
    status,
    errorMessage,
    version,
    roomId,
    peers,
    peerUsers,
    userName,
    setUserName,
    isNameModalOpen,
    setIsNameModalOpen,
    initialUser,
    saveStatus,
    saveMessage,
    setSaveMessage,
    handleSave,
    providerRef,
  };
}

