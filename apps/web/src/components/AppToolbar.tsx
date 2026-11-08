/**
 * Barra de herramientas principal de la aplicación: compartir, generador Spring Boot,
 * importación/exportación XMI/fotos/imágenes, barra de presencia, idioma y guía interactiva.
 */
import { useState, useRef, useEffect } from 'react';
import type * as Y from 'yjs';
import { GenerateSpringButton } from '../codegen/GenerateSpringButton';
import { ExportToolbarButtons } from '../canvas/imageExport';
import { ImportXmiButton } from '../xmi/ImportXmiButton';
import { ExportXmiButton } from '../xmi/ExportXmiButton';
import { ImportPhotoButton } from '../photo/ImportPhotoButton';
import { PresenceBar, type PresenceUser } from '../canvas/PresenceBar';
import { LanguageToggle, useT } from '../i18n';
import { AmongusAvatar } from '../chat/AmongusAvatar';

export interface AppToolbarProps {
  doc: Y.Doc;
  diagramId: string | null;
  isReady: boolean;
  peers: readonly string[];
  peerUsers: readonly PresenceUser[];
  onEditSelf: () => void;
  botStatus: 'idle' | 'thinking' | 'applying';
  onOpenTutorial: () => void;
}

export function AppToolbar({
  doc,
  diagramId,
  isReady,
  peers,
  peerUsers,
  onEditSelf,
  botStatus,
  onOpenTutorial,
}: AppToolbarProps) {
  const { t: tr, lang } = useT();
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleShareUrl = async (): Promise<void> => {
    const url = window.location.href;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 2500);
    } catch {
      // Ignorar fallo de portapapeles
    }
  };

  return (
    <div className="app-toolbar">
      <button
        type="button"
        onClick={handleShareUrl}
        data-testid="toolbar-share"
        className={copied ? 'toolbar-btn--copied' : ''}
        title={tr('toolbar.shareTitle')}
        aria-label={tr('toolbar.shareTitle')}
      >
        {copied ? `✓ ${tr('toolbar.copied')}` : tr('toolbar.share')}
      </button>

      <GenerateSpringButton diagramId={diagramId} disabled={!isReady} />
      <ImportXmiButton doc={doc} diagramId={diagramId} disabled={!isReady} />
      <ExportXmiButton diagramId={diagramId} disabled={!isReady} doc={doc} />
      <ExportToolbarButtons doc={doc} />
      <ImportPhotoButton doc={doc} diagramId={diagramId} disabled={!isReady} />

      <PresenceBar
        names={peers}
        users={peerUsers}
        onEditSelf={onEditSelf}
        bot={{ status: botStatus }}
      />

      <LanguageToggle />

      <button
        type="button"
        className="tutorial-toolbar-btn"
        onClick={onOpenTutorial}
        aria-label={lang === 'en' ? 'Open interactive guide with Amongus' : 'Abrir guía interactiva con Amongus'}
        title={lang === 'en' ? 'Interactive guide with Amongus' : 'Guía interactiva con Amongus'}
        data-testid="toolbar-tutorial-btn"
      >
        <AmongusAvatar size={18} isAnimated={false} />
        <span>{lang === 'en' ? 'Guide' : 'Guía'}</span>
      </button>
    </div>
  );
}

