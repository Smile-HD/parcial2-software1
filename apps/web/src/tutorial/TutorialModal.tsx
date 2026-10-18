import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AmongusAvatar } from '../chat/AmongusAvatar';
import { useT } from '../i18n';
import './tutorial.css';

export const TUTORIAL_STORAGE_KEY = 'uml_tutorial_completed';

export interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TutorialStep {
  title: string;
  subtitle: string;
  description: string;
  tip: string;
  targetSelector?: string;
  targetLabel?: string;
  positionClass: string;
  arrowType?: 'left' | 'canvas' | 'up' | 'up-left';
  icon: React.ReactNode;
}

export function TutorialModal({ isOpen, onClose }: TutorialModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; initialX: number; initialY: number } | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const { lang } = useT();
  const isEn = lang === 'en';

  const steps: TutorialStep[] = useMemo(() => {
    if (isEn) {
      return [
        {
          title: 'Welcome to UML Studio',
          subtitle: 'Learn with a practical step-by-step example',
          description:
            'I will guide you through a real modeling example: we will create two classes ("Customer" and "Order") and connect them with an association relationship with multiplicities.\n\nThis guide floats on top of the studio as a non-intrusive layer so you can follow along seamlessly.',
          tip: 'You can interact with the canvas or reopen this guide anytime from the top bar.',
          positionClass: 'tutorial-card--center',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          ),
        },
        {
          title: '1. Select & Create the "Customer" Class',
          subtitle: 'Class tool, naming, and attributes',
          description:
            '1. In the left toolbox, click on the "Class" tool.\n2. In the properties panel, set the name: "Customer".\n3. Add the following attributes:\n   • + id: Long\n   • + name: String\n   • + email: String\n4. Add a method: + register(): void.',
          tip: 'The "+" sign indicates public visibility in standard UML. Double-click the class to edit properties.',
          targetSelector: '.palette, .canvas-toolbox, [aria-label="UML element palette"]',
          targetLabel: 'Tool: Class (Left Toolbox)',
          positionClass: 'tutorial-card--toolbox',
          arrowType: 'left',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
          ),
        },
        {
          title: '2. Create the "Order" Class',
          subtitle: 'Second entity for the sales flow',
          description:
            '1. Select the "Class" tool again in the left toolbox.\n2. Click or drag it to the canvas to the right of Customer.\n3. Name this class: "Order".\n4. Add these attributes:\n   • + id: Long\n   • + orderDate: Date\n   • + total: Double\n   • + status: String\n5. Add the method: + calculateTotal(): Double.',
          tip: 'Drag any class to position it neatly, or use the mouse wheel to zoom in and out.',
          targetSelector: '[data-testid="palette-class"], .palette',
          targetLabel: 'Tool: Class (Left Toolbox)',
          positionClass: 'tutorial-card--toolbox',
          arrowType: 'left',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="3" />
              <circle cx="18" cy="18" r="3" />
              <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" />
            </svg>
          ),
        },
        {
          title: '3. Connect with Relationship (Association)',
          subtitle: 'Link Customer to Order and set multiplicities',
          description:
            '1. Select the "Association" relation from the toolbox (or drag between connector handles).\n2. Name the relationship: "places".\n3. Set multiplicities:\n   • Customer side: 1 (one customer)\n   • Order side: 0..* (zero to many orders).',
          tip: 'Multiplicity 1 to 0..* models the business rule: each customer can place multiple orders.',
          targetSelector: '[data-testid="palette-association"], .palette',
          targetLabel: 'Tool: Association Relationship',
          positionClass: 'tutorial-card--relation',
          arrowType: 'left',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          ),
        },
        {
          title: '4. AI Assistant & Spring Boot Export',
          subtitle: 'Command automation and code generation',
          description:
            '1. You can also ask Amongus in the bottom bar or Chat: "add Product class with name and price".\n2. When finished, click "Generate Spring Boot" in the top bar to download complete Maven code with JPA entities (@Entity), @OneToMany, and Spring Data repositories ready to run.',
          tip: 'Click "Start modeling" to begin creating your diagrams with Amongus!',
          targetSelector: '.interpreter-bar, [data-testid="toolbar-share"]',
          targetLabel: 'Command Bar & Export Tools',
          positionClass: 'tutorial-card--commands-export',
          arrowType: 'up-left',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          ),
        },
      ];
    }

    return [
      {
        title: 'Bienvenido a UML Studio',
        subtitle: 'Aprende con un ejemplo práctico paso a paso',
        description:
          'Vamos a construir juntos un modelo de software real: dos clases ("Cliente" y "Pedido") y las conectaremos con una relación de asociación con multiplicidades.\n\nEsta guía flota sobre la aplicación como una capa superior sin bloquear el lienzo para que puedas seguir cada paso.',
        tip: 'Podés interactuar con el lienzo o volver a abrir esta guía cuando quieras desde el botón Guía en la barra superior.',
        positionClass: 'tutorial-card--center',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        ),
      },
      {
        title: '1. Seleccionar y Crear la Clase "Cliente"',
        subtitle: 'Herramienta Clase, nombre y atributos',
        description:
          '1. En la caja de herramientas (izquierda), seleccioná la herramienta "Clase".\n2. En el panel de propiedades, poné el nombre: "Cliente".\n3. Agregale sus atributos:\n   • + id: Long\n   • + nombre: String\n   • + email: String\n4. Agregale el método: + registrar(): void.',
        tip: 'El prefijo "+" indica visibilidad pública en UML. Hacé doble clic en la clase para editar sus campos.',
        targetSelector: '[data-testid="palette-class"], .palette',
        targetLabel: 'Herramienta: Clase (Panel Izquierdo)',
        positionClass: 'tutorial-card--toolbox',
        arrowType: 'left',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
        ),
      },
      {
        title: '2. Crear la Clase "Pedido"',
        subtitle: 'Segunda entidad para el flujo de compras',
        description:
          '1. Seleccioná nuevamente la herramienta "Clase" en la caja de herramientas (a la izquierda).\n2. Hacé clic o arrastrala al lienzo a la derecha de Cliente.\n3. Ponele de nombre: "Pedido".\n4. Agregale estos atributos:\n   • + id: Long\n   • + fecha: Date\n   • + total: Double\n   • + estado: String\n5. Agregale el método: + calcularTotal(): Double.',
        tip: 'Podés arrastrar cualquier clase para ubicarla donde gustes, o usar la rueda del mouse para hacer zoom.',
        targetSelector: '[data-testid="palette-class"], .palette',
        targetLabel: 'Herramienta: Clase (Panel Izquierdo)',
        positionClass: 'tutorial-card--toolbox',
        arrowType: 'left',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="3" />
            <circle cx="18" cy="18" r="3" />
            <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" />
          </svg>
        ),
      },
      {
        title: '3. Conectar con Relación (Asociación)',
        subtitle: 'Vincular Cliente con Pedido y configurar multiplicidades',
        description:
          '1. En la caja de herramientas, seleccioná la relación "Asociación" (o arrastrá desde el conector de Cliente hacia Pedido).\n2. En el nombre de la relación, escribí: "realiza".\n3. Configurá las multiplicidades:\n   • Lado Cliente: 1 (un cliente)\n   • Lado Pedido: 0..* (cero o muchos pedidos).',
        tip: 'La multiplicidad 1 a 0..* modela la regla de negocio: un cliente puede realizar múltiples pedidos.',
        targetSelector: '[data-testid="palette-association"], .palette',
        targetLabel: 'Herramienta: Relación Asociación',
        positionClass: 'tutorial-card--relation',
        arrowType: 'left',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        ),
      },
      {
        title: '4. Asistente IA y Generar Spring Boot',
        subtitle: 'Automatización por comandos y exportación de código',
        description:
          '1. También podés pedirle a Amongus en la barra inferior o el Chat: "agrega clase Producto con nombre y precio".\n2. Para finalizar, hacé clic en "Generar Spring Boot" en la barra superior para descargar el código Maven con entidades JPA (@Entity), @OneToMany y repositorios listos para compilar.',
        tip: '¡Hacé clic en "Comenzar a modelar" para empezar a diseñar con Amongus!',
        targetSelector: '.interpreter-bar, [data-testid="toolbar-share"]',
        targetLabel: 'Barra de Comandos y Exportación',
        positionClass: 'tutorial-card--commands-export',
        arrowType: 'up-left',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        ),
      },
    ];
  }, [isEn]);

  const step = steps[currentStep]!;
  const isLast = currentStep === steps.length - 1;

  // Efecto de spotlight dinámico sobre el elemento objetivo
  useEffect(() => {
    if (!isOpen) return;
    const selector = step.targetSelector;
    if (!selector) return;

    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => el.classList.add('tutorial-target-highlight'));

      return () => {
        elements.forEach((el) => el.classList.remove('tutorial-target-highlight'));
      };
    } catch {
      // Ignorar selectores en entornos de prueba
    }
  }, [currentStep, step.targetSelector, isOpen]);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      try {
        document.querySelectorAll('.tutorial-target-highlight').forEach((el) => {
          el.classList.remove('tutorial-target-highlight');
        });
      } catch {
        // Ignorar
      }
    };
  }, []);

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    // Si se hizo clic en el botón de cerrar u otro control, no iniciar arrastre
    if ((e.target as HTMLElement).closest('.tutorial-card__close-btn')) return;
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialX: rect.left,
      initialY: rect.top,
    };
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;
      const newX = Math.max(10, Math.min(window.innerWidth - 320, dragStartRef.current.initialX + deltaX));
      const newY = Math.max(10, Math.min(window.innerHeight - 140, dragStartRef.current.initialY + deltaY));
      setDragPos({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleFinish = () => {
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
    } catch {
      // Ignorar fallos de cuota o almacenamiento
    }
    onClose();
  };

  const handleNext = () => {
    if (isLast) {
      handleFinish();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="tutorial-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={isEn ? 'Interactive UML Studio Tutorial with Amongus' : 'Tutorial interactivo de UML Studio con Amongus'}
      data-testid="tutorial-modal"
    >
      <div
        ref={cardRef}
        className={`tutorial-card ${dragPos ? '' : step.positionClass} ${isDragging ? 'tutorial-card--dragging' : ''}`}
        style={dragPos ? { left: `${dragPos.x}px`, top: `${dragPos.y}px`, transform: 'none' } : undefined}
      >
        {/* Flecha dinámica sólo visible en posición inicial predeterminada */}
        {!dragPos && step.arrowType === 'left' && (
          <div className="tutorial-card__arrow tutorial-card__arrow--left" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </div>
        )}

        {!dragPos && step.arrowType === 'up' && (
          <div className="tutorial-card__arrow tutorial-card__arrow--up" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </div>
        )}

        {!dragPos && step.arrowType === 'up-left' && (
          <div className="tutorial-card__arrow tutorial-card__arrow--up-left" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </div>
        )}

        {!dragPos && step.arrowType === 'canvas' && (
          <div className="tutorial-card__arrow tutorial-card__arrow--canvas" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
          </div>
        )}

        {/* Cabecera con Amongus animado y soporte de arrastre */}
        <div
          className="tutorial-card__header"
          onMouseDown={handleHeaderMouseDown}
          title={isEn ? 'Click and drag to move this guide' : 'Hacé clic y arrastrá para mover esta guía'}
        >
          <AmongusAvatar size={44} isAnimated={true} />
          <div className="tutorial-card__header-text">
            <h3>{step.title}</h3>
            <p>{step.subtitle}</p>
          </div>
          <div className="tutorial-card__drag-hint" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="5" r="1.5" fill="currentColor"/>
              <circle cx="9" cy="12" r="1.5" fill="currentColor"/>
              <circle cx="9" cy="19" r="1.5" fill="currentColor"/>
              <circle cx="15" cy="5" r="1.5" fill="currentColor"/>
              <circle cx="15" cy="12" r="1.5" fill="currentColor"/>
              <circle cx="15" cy="19" r="1.5" fill="currentColor"/>
            </svg>
            <span>{isEn ? 'Move' : 'Mover'}</span>
          </div>
          <button
            type="button"
            className="tutorial-card__close-btn"
            onClick={handleFinish}
            aria-label={isEn ? 'Close tutorial' : 'Cerrar tutorial'}
            title={isEn ? 'Close' : 'Cerrar'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Cuerpo del paso */}
        <div className="tutorial-card__body">
          <div className="tutorial-card__step-title">
            <span className="tutorial-card__step-icon">{step.icon}</span>
            <span>
              {isEn ? `Step ${currentStep + 1} of ${steps.length}` : `Paso ${currentStep + 1} de ${steps.length}`}
            </span>
          </div>

          {step.targetLabel && (
            <div className="tutorial-card__spotlight-badge" data-testid="tutorial-spotlight-badge">
              <span className="tutorial-card__spotlight-dot" />
              <span>{step.targetLabel}</span>
            </div>
          )}

          <div className="tutorial-card__step-desc">
            {step.description.split('\n').map((line, idx) => {
              const trimmed = line.trim();
              if (!trimmed) {
                return <div key={idx} className="tutorial-card__desc-spacer" />;
              }
              if (trimmed.startsWith('• ') || trimmed.startsWith('- ')) {
                return (
                  <div key={idx} className="tutorial-card__desc-bullet">
                    <span className="tutorial-card__bullet-dot" />
                    <code>{trimmed.substring(2)}</code>
                  </div>
                );
              }
              if (/^\d+\.\s/.test(trimmed)) {
                const spaceIdx = trimmed.indexOf(' ');
                const num = trimmed.substring(0, spaceIdx);
                const text = trimmed.substring(spaceIdx + 1);
                return (
                  <div key={idx} className="tutorial-card__desc-numbered">
                    <span className="tutorial-card__numbered-badge">{num}</span>
                    <span>{text}</span>
                  </div>
                );
              }
              return (
                <p key={idx} className="tutorial-card__desc-paragraph">
                  {line}
                </p>
              );
            })}
          </div>
          <div className="tutorial-card__step-tip">
            <strong>{isEn ? 'Tip: ' : 'Consejo: '}</strong>
            {step.tip}
          </div>
        </div>

        {/* Pie con navegación e indicadores */}
        <div className="tutorial-card__footer">
          <div className="tutorial-card__dots" aria-hidden="true">
            {steps.map((_, idx) => (
              <span
                key={idx}
                className={`tutorial-card__dot ${idx === currentStep ? 'tutorial-card__dot--active' : ''}`}
              />
            ))}
          </div>

          <div className="tutorial-card__actions">
            <button
              type="button"
              className="tutorial-btn tutorial-btn--secondary"
              onClick={handleFinish}
            >
              {isEn ? 'Skip' : 'Omitir'}
            </button>
            {currentStep > 0 && (
              <button
                type="button"
                className="tutorial-btn tutorial-btn--secondary"
                onClick={handlePrev}
                data-testid="tutorial-prev-btn"
              >
                {isEn ? 'Previous' : 'Anterior'}
              </button>
            )}
            <button
              type="button"
              className="tutorial-btn tutorial-btn--primary"
              onClick={handleNext}
              data-testid="tutorial-next-btn"
            >
              {isLast ? (isEn ? 'Start modeling' : 'Comenzar a modelar') : (isEn ? 'Next' : 'Siguiente')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
