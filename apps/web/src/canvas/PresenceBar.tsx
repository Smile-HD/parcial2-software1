/**
 * PresenceBar — nombres de usuarios conectados mediante awareness de Yjs (realtime:R2, 6b.3).
 * Componente puramente presentacional para que la integración con awareness se mantenga testeable.
 *
 * unidad 13e.10 — el aria-label pasa por el diccionario i18n (reactivo).
 * unidad 13e.11 — chips claros estilo EA: avatar con iniciales + punto verde en línea +
 * nombre, dentro del contrato existente `presence-bar__user`.
 */
import { useT } from '../i18n';
import { pickUserColor } from '../presence/palette';

/**
 * Iniciales para el avatar del chip: las primeras letras de los dos primeros
 * tokens alfanuméricos del nombre ("User-a1b2" → "UA", "Ana López" → "AL");
 * un nombre de un solo token aporta sus dos primeras letras.
 */
export function presenceInitials(name: string): string {
  const tokens = name.split(/[^a-zA-Z0-9À-ɏ]+/).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return '';
  }
  if (tokens.length === 1) {
    return tokens[0]!.slice(0, 2).toUpperCase();
  }
  return (tokens[0]![0]! + tokens[1]![0]!).toUpperCase();
}

export type BotStatus = 'idle' | 'thinking' | 'applying';

export interface BotPresence {
  name?: string;
  status: BotStatus;
}

export interface PresenceUser {
  name: string;
  color?: string;
  isSelf?: boolean;
}

export interface PresenceBarProps {
  names?: readonly string[];
  users?: readonly PresenceUser[];
  onEditSelf?: () => void;
  bot?: BotPresence | null;
}

const BOT_DEFAULT_NAME = '🤖 Bot IA';
const BOT_COLOR = '#8b5cf6';

function getBotStatusMeta(status: BotStatus): { title: string; badge?: string } {
  switch (status) {
    case 'thinking':
      return { title: 'Bot IA pensando...', badge: 'Pensando...' };
    case 'applying':
      return { title: 'Bot IA aplicando cambios...', badge: 'Aplicando...' };
    case 'idle':
    default:
      return { title: 'Bot IA disponible' };
  }
}

export function PresenceBar({ names, users, onEditSelf, bot }: PresenceBarProps) {
  const { t } = useT();
  const userList: PresenceUser[] = users
    ? [...users]
    : names
      ? names.map((name) => ({ name, color: pickUserColor(name) }))
      : [];

  if (userList.length === 0 && !bot) {
    return null;
  }

  const botMeta = bot ? getBotStatusMeta(bot.status) : null;

  return (
    <div className="presence-bar" aria-label={t('presence.onlineUsers')}>
      {userList.map((user) => {
        const userColor = user.color ?? pickUserColor(user.name);
        return (
          <span
            key={user.name}
            className={`presence-bar__user ${user.isSelf && onEditSelf ? 'presence-bar__user--self' : ''}`}
            onClick={user.isSelf && onEditSelf ? onEditSelf : undefined}
            style={user.isSelf && onEditSelf ? { cursor: 'pointer' } : undefined}
            title={user.isSelf && onEditSelf ? 'Hacé clic para cambiar tu nombre' : undefined}
          >
            {/* Chip estilo EA / Figma: avatar con iniciales y color determinista + punto en línea + nombre */}
            <span
              className="presence-bar__avatar"
              aria-hidden="true"
              style={{
                backgroundColor: userColor,
                color: '#ffffff',
              }}
            >
              {presenceInitials(user.name)}
            </span>
            <span
              className="presence-bar__dot"
              aria-hidden="true"
              style={{ backgroundColor: userColor }}
            />
            <span className="presence-bar__name">{user.name}</span>
          </span>
        );
      })}

      {bot && botMeta && (
        <span
          className={`presence-bar__user presence-bar__user--bot presence-bar__user--bot-${bot.status}`}
          title={botMeta.title}
        >
          <span
            className="presence-bar__avatar presence-bar__avatar--bot"
            aria-hidden="true"
            style={{
              backgroundColor: BOT_COLOR,
              color: '#ffffff',
            }}
          >
            IA
          </span>
          <span
            className={`presence-bar__dot presence-bar__dot--bot ${
              bot.status !== 'idle' ? 'presence-bar__dot--pulse' : ''
            }`}
            aria-hidden="true"
            style={{ backgroundColor: BOT_COLOR }}
          />
          <span className="presence-bar__name">{bot.name ?? BOT_DEFAULT_NAME}</span>
          {botMeta.badge && (
            <span className="presence-bar__bot-status">
              {botMeta.badge}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
