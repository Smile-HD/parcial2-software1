import { useState, useMemo, useEffect, type RefObject } from 'react';
import { matchSlashCommands, type SlashCommand } from './commands.js';

export interface UseSlashCommandsOptions {
  draft: string;
  setDraft: (val: string) => void;
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  peerUsers?: readonly { name: string; color?: string }[];
  userName: string;
  isEn: boolean;
  onSendSubmit?: (text: string) => void;
}

export function useSlashCommands({
  draft,
  setDraft,
  inputRef,
  peerUsers,
  userName,
  isEn,
  onSendSubmit,
}: UseSlashCommandsOptions) {
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  const isSlashQuery = draft.startsWith('/') && !draft.includes(' ');
  const matchingCommands = isSlashQuery ? matchSlashCommands(draft) : [];

  // Detección de menciones @ en cualquier posición del texto donde la última palabra empiece con @
  const mentionMatch = /(?:^|\s)@([a-zA-Z0-9_ñÑáéíóúÁÉÍÓÚ]*)$/.exec(draft);
  const isMentionQuery = Boolean(mentionMatch);
  const mentionPrefix = mentionMatch ? mentionMatch[1]!.toLowerCase() : '';

  const availableMentions = useMemo(() => {
    const list: Array<{ name: string; role: string; isBot: boolean }> = [
      { name: 'Amongus', role: isEn ? 'AI Tutor & Assistant' : 'Tutor y Asistente IA', isBot: true },
    ];
    if (Array.isArray(peerUsers)) {
      for (const peer of peerUsers) {
        const pName = typeof peer === 'string' ? peer : (peer as any)?.name;
        if (
          pName &&
          pName.trim() &&
          pName.trim().toLowerCase() !== (userName || '').toLowerCase() &&
          !list.some((m) => m.name.toLowerCase() === pName.trim().toLowerCase())
        ) {
          list.push({ name: pName.trim(), role: isEn ? 'Team Member' : 'Miembro del equipo', isBot: false });
        }
      }
    }
    return list;
  }, [peerUsers, userName, isEn]);

  const matchingMentions = isMentionQuery
    ? availableMentions.filter((m) => m.name.toLowerCase().startsWith(mentionPrefix))
    : [];

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [mentionPrefix]);

  useEffect(() => {
    setSelectedCommandIndex(0);
  }, [draft]);

  const handleSelectMention = (name: string) => {
    if (!mentionMatch) return;
    const matchIndex = mentionMatch.index + (mentionMatch[0].startsWith(' ') ? 1 : 0);
    const beforeMention = draft.slice(0, matchIndex);
    const newDraft = `${beforeMention}@${name} `;
    setDraft(newDraft);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, fallbackSubmit?: () => void) => {
    if (isSlashQuery && matchingCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev + 1) % matchingCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev - 1 + matchingCommands.length) % matchingCommands.length);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const cmd = matchingCommands[selectedCommandIndex];
        if (cmd) {
          const zeroArg = ['audit', 'suggest', 'context', 'layout', 'apply', 'reset', 'clear'];
          if (zeroArg.includes(cmd.name)) {
            setDraft(`/${cmd.name}`);
          } else {
            setDraft(`/${cmd.name} `);
          }
        }
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        const exactMatch = matchingCommands.find((c) => `/${c.name}` === draft);
        if (!exactMatch) {
          e.preventDefault();
          const cmd = matchingCommands[selectedCommandIndex];
          if (cmd) {
            const zeroArg = ['audit', 'suggest', 'context', 'help', 'layout', 'apply', 'reset'];
            if (zeroArg.includes(cmd.name)) {
              setDraft('');
              onSendSubmit?.(`/${cmd.name}`);
              return;
            } else {
              setDraft(`/${cmd.name} `);
            }
          }
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDraft('');
        return;
      }
    }

    if (!isSlashQuery && isMentionQuery && matchingMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev + 1) % matchingMentions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev - 1 + matchingMentions.length) % matchingMentions.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        const selected = matchingMentions[selectedMentionIndex];
        if (selected) {
          handleSelectMention(selected.name);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        const matchIndex = mentionMatch ? mentionMatch.index : -1;
        if (matchIndex >= 0) {
          setDraft(draft.slice(0, matchIndex));
        }
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      fallbackSubmit?.();
    }
  };

  return {
    selectedCommandIndex,
    selectedMentionIndex,
    isSlashQuery,
    matchingCommands,
    isMentionQuery,
    matchingMentions,
    handleSelectMention,
    handleKeyDown,
  };
}
