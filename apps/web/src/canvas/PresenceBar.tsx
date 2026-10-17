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

export interface PresenceUser {
  name: string;
  color?: string;
  isSelf?: boolean;
}

export interface PresenceBarProps {
  names?: readonly string[];
  users?: readonly PresenceUser[];
  onEditSelf?: () => void;
}

export function PresenceBar({ names, users, onEditSelf }: PresenceBarProps) {
  const { t } = useT();
  const userList: PresenceUser[] = users
    ? [...users]
    : names
      ? names.map((name) => ({ name, color: pickUserColor(name) }))
      : [];

  if (userList.length === 0) {
    return null;
  }

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
    </div>
  );
}
