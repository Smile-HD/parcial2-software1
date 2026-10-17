import React, { useState } from 'react';
import { AmongusAvatar } from '../chat/AmongusAvatar';
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
  icon: React.ReactNode;
}

export function TutorialModal({ isOpen, onClose }: TutorialModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const steps: TutorialStep[] = [
    {
      title: 'Bienvenido a UML Studio',
      subtitle: 'Modelado colaborativo asistido por Amongus',
      description:
        'Soy Amongus, tu asistente de diseño. Aquí podrás construir diagramas de clases UML completos, colaborar con tu equipo en tiempo real y acelerar el desarrollo con comandos inteligentes.',
      tip: 'Podés volver a abrir esta guía cuando lo necesites usando el botón Guía en la barra de herramientas.',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      ),
    },
    {
      title: 'Caja de Herramientas y Clases',
      subtitle: 'Creación de entidades, atributos y métodos',
      description:
        'Agregá clases desde el panel lateral izquierdo. Podés definir atributos, tipos de datos, métodos y visibilidades estándar (+ público, - privado, # protegido, ~ paquete).',
      tip: 'Hacé doble clic en una clase para editar sus propiedades o arrastrala para reposicionarla en el lienzo.',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
      ),
    },
    {
      title: 'Relaciones UML Estándar',
      subtitle: 'Asociación, agregación, composición y herencia',
      description:
        'Conectá clases arrastrando desde los conectores. Soportamos asociaciones simples y dirigidas, agregaciones (rombo blanco), composiciones (rombo lleno), generalizaciones de herencia y realizaciones.',
      tip: 'Configurá multiplicidades precisas (1, 0..1, 1..*, *) para definir reglas de negocio claras.',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="18" r="3" />
          <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" />
        </svg>
      ),
    },
    {
      title: 'Colaboración en Vivo y Chat',
      subtitle: 'Presencia espacial, cursores y diálogo de equipo',
      description:
        'Compartí el enlace para trabajar simultáneamente. Observá los cursores en vivo de tus compañeros a 60 FPS y abrí el panel de Chat para conversar con el equipo o interactuar en privado conmigo.',
      tip: 'En el chat grupal podés mencionar a @Amongus para solicitar sugerencias que todo el equipo pueda ver.',
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
      title: 'Asistente Amongus y Exportación',
      subtitle: 'Comandos de lenguaje natural, fotos y código',
      description:
        'Pedime cambios por voz o texto ("agrega clase Pedido con total y fecha"), importá bocetos desde fotos de pizarra y exportá tu modelo a Enterprise Architect XMI o código Spring Boot ejecutable.',
      tip: 'Hacé clic en Generar Spring Boot en la barra para descargar el proyecto Maven con entidades JPA y repositorios listos.',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      ),
    },
  ];

  const step = steps[currentStep]!;
  const isLast = currentStep === steps.length - 1;

  const handleFinish = () => {
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
    } catch {
      // Ignorar fallos de cuota o modo privado
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

  return (
    <div
      className="tutorial-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial interactivo de UML Studio con Amongus"
      data-testid="tutorial-modal"
    >
      <div className="tutorial-card">
        {/* Cabecera con Amongus animado */}
        <div className="tutorial-card__header">
          <AmongusAvatar size={48} isAnimated={true} />
          <div className="tutorial-card__header-text">
            <h3>{step.title}</h3>
            <p>{step.subtitle}</p>
          </div>
          <button
            type="button"
            className="tutorial-card__close-btn"
            onClick={handleFinish}
            aria-label="Cerrar tutorial"
            title="Cerrar"
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
            <span>Paso {currentStep + 1} de {steps.length}</span>
          </div>
          <p className="tutorial-card__step-desc">{step.description}</p>
          <div className="tutorial-card__step-tip">
            <strong>Consejo: </strong>
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
              Omitir
            </button>
            {currentStep > 0 && (
              <button
                type="button"
                className="tutorial-btn tutorial-btn--secondary"
                onClick={handlePrev}
                data-testid="tutorial-prev-btn"
              >
                Anterior
              </button>
            )}
            <button
              type="button"
              className="tutorial-btn tutorial-btn--primary"
              onClick={handleNext}
              data-testid="tutorial-next-btn"
            >
              {isLast ? 'Comenzar a modelar' : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
