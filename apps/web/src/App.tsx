/**
 * App — posee el Y.Doc canónico y el ciclo de vida de carga/guardado/colaboración.
 * Ensambla los subcomponentes AppToolbar, DiagramCanvas, ChatPanel, UserNameModal y TutorialModal.
 */
import { useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { projectYDocToDiagram, type Diagram } from '@app/core';
import { createBrowserVoiceRecorder, type VoiceRecorder } from './voice/recorder';
import { DiagramCanvas } from './canvas/DiagramCanvas';
import { CanvasErrorBoundary } from './canvas/CanvasErrorBoundary';
import { UserNameModal } from './presence/UserNameModal';
import { useT } from './i18n';
import { ChatPanel } from './chat/ChatPanel';
import { TutorialModal } from './tutorial/TutorialModal';
import { AppToolbar } from './components/AppToolbar';
import {
  useDiagramSession,
  diagramIdFromHash,
  createEmptyDiagram,
  hydrateDiagramIntoDoc,
  saveDiagramFromDoc,
  type SaveOutcome,
} from './hooks/useDiagramSession';
import { useDiagramInterpreter } from './hooks/useDiagramInterpreter';
import './canvas/canvas.css';

export {
  diagramIdFromHash,
  createEmptyDiagram,
  hydrateDiagramIntoDoc,
  saveDiagramFromDoc,
  type SaveOutcome,
};

export interface AppProps {
  doc?: Y.Doc;
  collabUrl?: string | null;
  voiceRecorder?: VoiceRecorder;
}

export function App({ doc: injectedDoc, collabUrl, voiceRecorder }: AppProps = {}) {
  const { t: tr, lang } = useT();
  const docRef = useRef<Y.Doc | null>(null);
  if (docRef.current === null) {
    docRef.current = injectedDoc ?? new Y.Doc();
  }
  const doc = docRef.current;

  const recorderRef = useRef<VoiceRecorder | null>(null);
  if (recorderRef.current === null && voiceRecorder === undefined) {
    recorderRef.current = createBrowserVoiceRecorder();
  }
  const activeRecorder: VoiceRecorder | null = voiceRecorder ?? recorderRef.current;

  const {
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
    setSaveMessage,
    providerRef,
  } = useDiagramSession({ doc, collabUrl });

  const {
    commandDraft,
    setCommandDraft,
    interpreter,
    recording,
    ghostDelta,
    setGhostDelta,
    virtualPeer,
    buildingDeltaId,
    activeProposal,
    isTranscribing,
    handleSubmitCommand,
    handleConfirmDelta,
    handleRejectDelta,
    handleAutoLayout,
    handleClearCanvas,
    handleToggleRecord,
  } = useDiagramInterpreter({
    doc,
    roomId,
    version,
    status,
    activeRecorder,
    setSaveMessage,
  });

  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);

  const botStatus =
    interpreter.phase === 'thinking' || Boolean(buildingDeltaId)
      ? 'thinking'
      : interpreter.phase === 'pending'
        ? 'applying'
        : 'idle';

  return (
    <main className="app-shell">
      <h1 className="app-shell__title">{tr('app.title')}</h1>
      {status === 'loading' && <p>{tr('app.loading')}</p>}
      {status === 'error' && (
        <div role="alert">
          <p>{errorMessage ?? tr('app.loadError')}</p>
        </div>
      )}
      {status === 'ready' && (
        <>
          <AppToolbar
            doc={doc}
            diagramId={roomId}
            isReady={status === 'ready'}
            peers={peers}
            peerUsers={peerUsers}
            onEditSelf={() => setIsNameModalOpen(true)}
            botStatus={botStatus}
            onOpenTutorial={() => setIsTutorialOpen(true)}
          />

          <div className="app-canvas">
            <CanvasErrorBoundary>
              <DiagramCanvas
                doc={doc}
                provider={providerRef.current}
                ghostDelta={ghostDelta}
                virtualPeer={virtualPeer}
              />
            </CanvasErrorBoundary>
          </div>

          <UserNameModal
            isOpen={isNameModalOpen}
            initialName={userName.startsWith('User-') ? '' : userName}
            canClose={!initialUser.current.isPromptNeeded || userName.length > 0}
            onClose={() => setIsNameModalOpen(false)}
            onSave={(newName) => {
              setUserName(newName);
              setIsNameModalOpen(false);
            }}
          />

          {!isChatOpen && (
            <button
              type="button"
              className="chat-launcher-btn"
              onClick={() => setIsChatOpen(true)}
              aria-label={lang === 'en' ? 'Open chat' : 'Abrir chat'}
              data-testid="chat-launcher"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Chat</span>
            </button>
          )}

          <ChatPanel
            diagramId={roomId ?? ''}
            userName={userName}
            isOpen={isChatOpen && Boolean(roomId)}
            onClose={() => setIsChatOpen(false)}
            peerUsers={peerUsers}
            voiceRecorder={activeRecorder}
            onConfirmProposal={handleConfirmDelta}
            onRejectProposal={handleRejectDelta}
            onPreviewProposal={setGhostDelta}
            onClearCanvas={handleClearCanvas}
            onAutoLayout={handleAutoLayout}
            canvasClassCount={projectYDocToDiagram(doc).classes?.length || 0}
            existingClasses={projectYDocToDiagram(doc).classes || []}
            buildingDeltaId={buildingDeltaId}
            activeProposal={activeProposal}
            interpreterPhase={interpreter.phase}
            interpreterError={interpreter.phase === 'error' ? interpreter.message : null}
            interpreterRefusal={interpreter.phase === 'refused' ? interpreter.reason : null}
            onSubmitCommand={handleSubmitCommand}
            commandDraft={commandDraft}
            onCommandDraftChange={setCommandDraft}
            recording={recording}
            onToggleRecord={handleToggleRecord}
            isTranscribing={isTranscribing}
            getCurrentDiagram={() => projectYDocToDiagram(doc)}
          />

          <TutorialModal
            isOpen={isTutorialOpen}
            onClose={() => setIsTutorialOpen(false)}
          />
        </>
      )}
    </main>
  );
}
