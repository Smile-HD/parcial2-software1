import React from 'react';

export interface AmongusAvatarProps {
  size?: number;
  className?: string;
  isAnimated?: boolean;
}

/**
 * Avatar 2D Vectorial de Amongus — Asistente Inteligente.
 * Diseño SVG estilizado con visor de cian brillante, mochila y antena con pulso.
 * Libre de emojis por completo.
 */
export function AmongusAvatar({
  size = 36,
  className = '',
  isAnimated = true,
}: AmongusAvatarProps) {
  return (
    <div
      className={`amongus-avatar ${isAnimated ? 'amongus-avatar--animated' : ''} ${className}`}
      style={{ width: size, height: size }}
      aria-label="Avatar de Amongus"
      role="img"
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="amongus-avatar__svg"
      >
        <defs>
          {/* Gradiente del cuerpo */}
          <linearGradient id="amongusBodyGrad" x1="20" y1="20" x2="80" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="60%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#4f46e5" />
          </linearGradient>

          {/* Gradiente del visor */}
          <linearGradient id="amongusVisorGrad" x1="45" y1="35" x2="85" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="50%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#0891b2" />
          </linearGradient>

          {/* Reflejo del visor */}
          <linearGradient id="amongusVisorReflect" x1="50" y1="36" x2="75" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
          </linearGradient>

          {/* Sombra sutil de la base */}
          <radialGradient id="amongusShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Sombra inferior en el suelo */}
        <ellipse cx="50" cy="94" rx="30" ry="5" fill="url(#amongusShadow)" />

        {/* Antena / Sensor superior */}
        <g className="amongus-avatar__antenna">
          <line x1="50" y1="18" x2="50" y2="8" stroke="#4338ca" strokeWidth="4" strokeLinecap="round" />
          <circle cx="50" cy="6" r="5" fill="#22d3ee" className="amongus-avatar__beacon" />
        </g>

        {/* Mochila / Jetpack trasero */}
        <rect
          x="14"
          y="35"
          width="16"
          height="38"
          rx="7"
          fill="#4338ca"
          stroke="#312e81"
          strokeWidth="3.5"
        />

        {/* Cuerpo principal (cápsula con piernas cortas estilo Among Us) */}
        <path
          d="M 30 40 
             C 30 18, 70 18, 70 40 
             L 70 78 
             C 70 85, 58 85, 58 78 
             L 58 72 
             C 58 70, 52 70, 52 72 
             L 52 78 
             C 52 85, 40 85, 40 78 
             L 40 78 
             C 30 78, 30 65, 30 40 Z"
          fill="url(#amongusBodyGrad)"
          stroke="#312e81"
          strokeWidth="4"
          strokeLinejoin="round"
        />

        {/* Visor panorámico */}
        <rect
          x="44"
          y="32"
          width="36"
          height="22"
          rx="11"
          fill="url(#amongusVisorGrad)"
          stroke="#1e1b4b"
          strokeWidth="3.5"
          className="amongus-avatar__visor"
        />

        {/* Reflejo curvo del cristal del visor */}
        <ellipse
          cx="58"
          cy="38"
          rx="10"
          ry="4"
          fill="url(#amongusVisorReflect)"
          transform="rotate(-15 58 38)"
        />
      </svg>
    </div>
  );
}
