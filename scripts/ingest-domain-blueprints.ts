/**
 * scripts/ingest-domain-blueprints.ts
 *
 * Pipeline de Ingesta ETL:
 * Genera y compila decenas de esquemas de dominio estándar de la industria
 * basados en Analysis Patterns de Martin Fowler, Microsoft Common Data Model y Database Answers.
 * Produce:
 * - apps/api/src/domain-catalog/data/index.json  (índice liviano para el enrutador en memoria)
 * - apps/api/src/domain-catalog/data/schemas.json (esquemas completos para carga bajo demanda / lazy loading)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANONICAL_DOMAINS } from '../apps/api/src/domain-catalog/domains.js';
import type { CanonicalDomainModel, DomainClass, DomainRelationship } from '../apps/api/src/domain-catalog/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'apps', 'api', 'src', 'domain-catalog', 'data');
const SCHEMAS_OUT = path.join(OUTPUT_DIR, 'schemas.json');
const INDEX_OUT = path.join(OUTPUT_DIR, 'index.json');

interface SectorBlueprintTemplate {
  subsector: string;
  category: string;
  titleEs: string;
  titleEn: string;
  keywordsEs: string[];
  keywordsEn: string[];
  entityTemplates: Array<{
    name: string;
    attributes: Array<[string, string]>;
  }>;
  relations: Array<[string, string, 'association' | 'composition' | 'aggregation', string, string]>;
}

const TEMPLATES: SectorBlueprintTemplate[] = [
  // SALUD Y BIENESTAR
  {
    subsector: 'dental_clinic',
    category: 'health',
    titleEs: 'Clínica Odontológica',
    titleEn: 'Dental Clinic',
    keywordsEs: ['odontologia', 'dentista', 'dientes', 'ortodoncia', 'clinica dental', 'implante'],
    keywordsEn: ['dentist', 'dental', 'teeth', 'orthodontics', 'dental clinic'],
    entityTemplates: [
      { name: 'PacienteDental', attributes: [['dni', 'string'], ['nombre', 'string'], ['historialClinico', 'string']] },
      { name: 'Odontologo', attributes: [['matricula', 'string'], ['nombre', 'string'], ['especialidad', 'string']] },
      { name: 'TurnoDental', attributes: [['fecha', 'date'], ['motivo', 'string'], ['estado', 'string']] },
      { name: 'Tratamiento', attributes: [['codigo', 'string'], ['nombre', 'string'], ['costo', 'float']] },
      { name: 'PiezaDental', attributes: [['numeroPieza', 'int'], ['diagnostico', 'string']] },
    ],
    relations: [
      ['PacienteDental', 'TurnoDental', 'association', '1', '0..*'],
      ['Odontologo', 'TurnoDental', 'association', '1', '0..*'],
      ['TurnoDental', 'Tratamiento', 'association', '1..*', '1'],
      ['Tratamiento', 'PiezaDental', 'composition', '1', '0..*'],
    ],
  },
  {
    subsector: 'pharmacy',
    category: 'health',
    titleEs: 'Farmacia y Medicamentos',
    titleEn: 'Pharmacy & Drugstore',
    keywordsEs: ['farmacia', 'medicamento', 'droga', 'remedio', 'receta medica', 'farmaceutico'],
    keywordsEn: ['pharmacy', 'drugstore', 'medicine', 'prescription', 'pharmacist'],
    entityTemplates: [
      { name: 'Farmaceutico', attributes: [['matricula', 'string'], ['nombre', 'string']] },
      { name: 'Medicamento', attributes: [['codigoBarras', 'string'], ['nombreComercial', 'string'], ['droga', 'string'], ['precio', 'float'], ['stock', 'int']] },
      { name: 'VentaFarmacia', attributes: [['numeroTicket', 'string'], ['fecha', 'date'], ['total', 'float']] },
      { name: 'DetalleVenta', attributes: [['cantidad', 'int'], ['precioUnitario', 'float']] },
      { name: 'ObraSocial', attributes: [['codigo', 'string'], ['nombre', 'string'], ['porcentajeCobertura', 'float']] },
    ],
    relations: [
      ['Farmaceutico', 'VentaFarmacia', 'association', '1', '0..*'],
      ['VentaFarmacia', 'DetalleVenta', 'composition', '1', '1..*'],
      ['Medicamento', 'DetalleVenta', 'association', '1', '0..*'],
      ['VentaFarmacia', 'ObraSocial', 'association', '0..*', '0..1'],
    ],
  },
  {
    subsector: 'clinical_lab',
    category: 'health',
    titleEs: 'Laboratorio de Análisis Clínicos',
    titleEn: 'Clinical Analysis Laboratory',
    keywordsEs: ['laboratorio clinico', 'analisis de sangre', 'bioquimico', 'muestra', 'hemograma', 'laboratorio'],
    keywordsEn: ['clinical lab', 'blood test', 'biochemistry', 'sample', 'lab test'],
    entityTemplates: [
      { name: 'PacienteLab', attributes: [['dni', 'string'], ['nombre', 'string'], ['edad', 'int']] },
      { name: 'Bioquimico', attributes: [['matricula', 'string'], ['nombre', 'string']] },
      { name: 'OrdenAnalisis', attributes: [['numeroOrden', 'string'], ['fechaIngreso', 'date'], ['estado', 'string']] },
      { name: 'Muestra', attributes: [['codigoTubo', 'string'], ['tipoMuestra', 'string'], ['fechaExtraccion', 'date']] },
      { name: 'ResultadoItem', attributes: [['parametro', 'string'], ['valorObtenido', 'string'], ['rangoReferencia', 'string']] },
    ],
    relations: [
      ['PacienteLab', 'OrdenAnalisis', 'association', '1', '0..*'],
      ['Bioquimico', 'OrdenAnalisis', 'association', '1', '0..*'],
      ['OrdenAnalisis', 'Muestra', 'composition', '1', '1..*'],
      ['Muestra', 'ResultadoItem', 'composition', '1', '1..*'],
    ],
  },

  // COMMERCE & RETAIL
  {
    subsector: 'supermarket',
    category: 'commerce',
    titleEs: 'Supermercado y Cadena de Autoservicio',
    titleEn: 'Supermarket & Retail Chain',
    keywordsEs: ['supermercado', 'gondola', 'cajero', 'caja registradora', 'autoservicio', 'despensa'],
    keywordsEn: ['supermarket', 'grocery', 'cashier', 'shelf', 'retail chain'],
    entityTemplates: [
      { name: 'Cajero', attributes: [['legajo', 'string'], ['nombre', 'string'], ['turno', 'string']] },
      { name: 'CajaRegistradora', attributes: [['numeroCaja', 'int'], ['activa', 'boolean']] },
      { name: 'TicketVenta', attributes: [['numeroFactura', 'string'], ['fechaHora', 'date'], ['total', 'float'], ['metodoPago', 'string']] },
      { name: 'ArticuloSupermercado', attributes: [['ean13', 'string'], ['descripcion', 'string'], ['precio', 'float'], ['seccion', 'string']] },
      { name: 'Proveedor', attributes: [['cuit', 'string'], ['razonSocial', 'string'], ['telefono', 'string']] },
    ],
    relations: [
      ['Cajero', 'CajaRegistradora', 'association', '1', '1'],
      ['CajaRegistradora', 'TicketVenta', 'association', '1', '0..*'],
      ['TicketVenta', 'ArticuloSupermercado', 'association', '0..*', '1..*'],
      ['Proveedor', 'ArticuloSupermercado', 'association', '1', '0..*'],
    ],
  },
  {
    subsector: 'car_dealership',
    category: 'commerce',
    titleEs: 'Concesionaria de Autos',
    titleEn: 'Car Dealership & Auto Sales',
    keywordsEs: ['concesionaria', 'autos', 'vehiculos', 'venta de autos', 'agencia de autos', 'kilometraje'],
    keywordsEn: ['car dealership', 'auto sales', 'vehicle sales', 'car dealer'],
    entityTemplates: [
      { name: 'VehiculoVenta', attributes: [['vin', 'string'], ['marca', 'string'], ['modelo', 'string'], ['año', 'int'], ['precioLista', 'float'], ['estado', 'string']] },
      { name: 'Vendedor', attributes: [['dni', 'string'], ['nombre', 'string'], ['comision', 'float']] },
      { name: 'Comprador', attributes: [['dni', 'string'], ['nombre', 'string'], ['telefono', 'string']] },
      { name: 'BoletoCompraVenta', attributes: [['numeroBoleto', 'string'], ['fechaOperacion', 'date'], ['montoFinal', 'float']] },
      { name: 'TestDrive', attributes: [['fecha', 'date'], ['licenciaConductor', 'string']] },
    ],
    relations: [
      ['Vendedor', 'BoletoCompraVenta', 'association', '1', '0..*'],
      ['Comprador', 'BoletoCompraVenta', 'association', '1', '0..*'],
      ['VehiculoVenta', 'BoletoCompraVenta', 'association', '1', '0..1'],
      ['Comprador', 'TestDrive', 'association', '1', '0..*'],
      ['VehiculoVenta', 'TestDrive', 'association', '1', '0..*'],
    ],
  },

  // ENTRETENIMIENTO Y STREAMING
  {
    subsector: 'movie_streaming',
    category: 'media',
    titleEs: 'Plataforma de Streaming de Video',
    titleEn: 'Video Streaming Platform',
    keywordsEs: ['streaming', 'peliculas', 'series', 'netflix', 'reproduccion', 'catalogo peliculas'],
    keywordsEn: ['streaming', 'movies', 'series', 'video player', 'video on demand'],
    entityTemplates: [
      { name: 'UsuarioStreaming', attributes: [['email', 'string'], ['suscripcionActiva', 'boolean'], ['plan', 'string']] },
      { name: 'Perfil', attributes: [['nombrePerfil', 'string'], ['esInfantil', 'boolean']] },
      { name: 'ContenidoAudiovisual', attributes: [['titulo', 'string'], ['duracionMinutos', 'int'], ['genero', 'string'], ['clasificacionEdad', 'string']] },
      { name: 'Episodio', attributes: [['temporada', 'int'], ['numeroEpisodio', 'int'], ['tituloEpisodio', 'string']] },
      { name: 'HistorialReproduccion', attributes: [['progresoSegundos', 'int'], ['fechaUltimaVista', 'date']] },
    ],
    relations: [
      ['UsuarioStreaming', 'Perfil', 'composition', '1', '1..5'],
      ['Perfil', 'HistorialReproduccion', 'composition', '1', '0..*'],
      ['ContenidoAudiovisual', 'HistorialReproduccion', 'association', '1', '0..*'],
      ['ContenidoAudiovisual', 'Episodio', 'composition', '1', '0..*'],
    ],
  },
  {
    subsector: 'music_streaming',
    category: 'media',
    titleEs: 'Streaming de Música y Podcasts',
    titleEn: 'Music & Podcast Streaming',
    keywordsEs: ['musica', 'cancion', 'spotify', 'playlist', 'album', 'artista', 'podcast'],
    keywordsEn: ['music', 'song', 'playlist', 'album', 'artist', 'tracks'],
    entityTemplates: [
      { name: 'Oyente', attributes: [['nombreUsuario', 'string'], ['email', 'string'], ['cuentaPremium', 'boolean']] },
      { name: 'Artista', attributes: [['nombreArtistico', 'string'], ['biografia', 'string'], ['oyentesMensuales', 'int']] },
      { name: 'Album', attributes: [['titulo', 'string'], ['añoLanzamiento', 'int']] },
      { name: 'Cancion', attributes: [['isrc', 'string'], ['titulo', 'string'], ['duracionSegundos', 'int'], ['reproducciones', 'int']] },
      { name: 'Playlist', attributes: [['nombrePlaylist', 'string'], ['esPublica', 'boolean']] },
    ],
    relations: [
      ['Artista', 'Album', 'association', '1..*', '0..*'],
      ['Album', 'Cancion', 'composition', '1', '1..*'],
      ['Oyente', 'Playlist', 'composition', '1', '0..*'],
      ['Playlist', 'Cancion', 'association', '0..*', '0..*'],
    ],
  },

  // SERVICIOS Y TRANSPORTE
  {
    subsector: 'parking_lot',
    category: 'transport',
    titleEs: 'Estacionamiento y Cocheras',
    titleEn: 'Parking Lot Management',
    keywordsEs: ['estacionamiento', 'cochera', 'parking', 'parqueadero', 'tarifa hora', 'patente auto'],
    keywordsEn: ['parking', 'parking lot', 'garage', 'parking spot', 'hourly rate'],
    entityTemplates: [
      { name: 'PlazaEstacionamiento', attributes: [['numeroEspacio', 'int'], ['piso', 'int'], ['ocupada', 'boolean'], ['tipo', 'string']] },
      { name: 'VehiculoEstacionado', attributes: [['patente', 'string'], ['modelo', 'string']] },
      { name: 'TicketEstacionamiento', attributes: [['codigoTicket', 'string'], ['horaIngreso', 'date'], ['horaEgreso', 'date'], ['montoACobrar', 'float']] },
      { name: 'Tarifa', attributes: [['tipoVehiculo', 'string'], ['precioPorHora', 'float'], ['precioEstadia', 'float']] },
    ],
    relations: [
      ['PlazaEstacionamiento', 'TicketEstacionamiento', 'association', '1', '0..*'],
      ['VehiculoEstacionado', 'TicketEstacionamiento', 'association', '1', '0..*'],
      ['Tarifa', 'TicketEstacionamiento', 'association', '1', '0..*'],
    ],
  },
  {
    subsector: 'car_rental',
    category: 'transport',
    titleEs: 'Alquiler de Vehículos (Rent a Car)',
    titleEn: 'Car Rental Service',
    keywordsEs: ['rent a car', 'alquiler de autos', 'alquiler vehiculo', 'devolucion auto'],
    keywordsEn: ['car rental', 'rent a car', 'vehicle rental', 'rental fleet'],
    entityTemplates: [
      { name: 'ClienteRenta', attributes: [['dni', 'string'], ['nombre', 'string'], ['numeroLicencia', 'string']] },
      { name: 'VehiculoFlota', attributes: [['patente', 'string'], ['categoria', 'string'], ['kilometraje', 'int'], ['disponible', 'boolean']] },
      { name: 'ContratoRenta', attributes: [['numeroContrato', 'string'], ['fechaInicio', 'date'], ['fechaFin', 'date'], ['montoTotal', 'float']] },
      { name: 'SeguroAuto', attributes: [['poliza', 'string'], ['cobertura', 'string'], ['franquicia', 'float']] },
    ],
    relations: [
      ['ClienteRenta', 'ContratoRenta', 'association', '1', '0..*'],
      ['VehiculoFlota', 'ContratoRenta', 'association', '1', '0..*'],
      ['ContratoRenta', 'SeguroAuto', 'composition', '1', '1'],
    ],
  },

  // EDUCACIÓN Y DEPORTES
  {
    subsector: 'kindergarten',
    category: 'education',
    titleEs: 'Jardín de Infantes y Guardería',
    titleEn: 'Kindergarten & Daycare',
    keywordsEs: ['jardin de infantes', 'guarderia', 'maternal', 'sala', 'maestra jardinera', 'niños'],
    keywordsEn: ['kindergarten', 'daycare', 'preschool', 'nursery', 'childcare'],
    entityTemplates: [
      { name: 'Niño', attributes: [['dni', 'string'], ['nombre', 'string'], ['fechaNacimiento', 'date'], ['alergias', 'string']] },
      { name: 'TutorPadre', attributes: [['dni', 'string'], ['nombre', 'string'], ['telefonoEmergencia', 'string']] },
      { name: 'SalaJardin', attributes: [['nombreSala', 'string'], ['edadTurno', 'int'], ['capacidad', 'int']] },
      { name: 'Docente', attributes: [['legajo', 'string'], ['nombre', 'string']] },
      { name: 'CuotaMensual', attributes: [['mes', 'int'], ['año', 'int'], ['monto', 'float'], ['pagada', 'boolean']] },
    ],
    relations: [
      ['TutorPadre', 'Niño', 'association', '1..*', '1..*'],
      ['SalaJardin', 'Niño', 'association', '1', '0..*'],
      ['Docente', 'SalaJardin', 'association', '1..*', '1'],
      ['Niño', 'CuotaMensual', 'composition', '1', '0..*'],
    ],
  },
  {
    subsector: 'sports_tournament',
    category: 'sports',
    titleEs: 'Torneo Deportivo y Liga de Fútbol',
    titleEn: 'Sports Tournament & Soccer League',
    keywordsEs: ['torneo', 'campeonato', 'liga de futbol', 'partido', 'arbitro', 'cancha', 'goles'],
    keywordsEn: ['tournament', 'league', 'soccer', 'match', 'referee', 'championship'],
    entityTemplates: [
      { name: 'Equipo', attributes: [['nombreClub', 'string'], ['fundacion', 'date'], ['directorTecnico', 'string']] },
      { name: 'Jugador', attributes: [['dni', 'string'], ['nombre', 'string'], ['posicion', 'string'], ['numeroCamiseta', 'int']] },
      { name: 'Partido', attributes: [['fecha', 'date'], ['golesLocal', 'int'], ['golesVisitante', 'int'], ['estado', 'string']] },
      { name: 'Arbitro', attributes: [['matricula', 'string'], ['nombre', 'string']] },
      { name: 'TablaPosiciones', attributes: [['puntos', 'int'], ['partidosJugados', 'int'], ['diferenciaGol', 'int']] },
    ],
    relations: [
      ['Equipo', 'Jugador', 'composition', '1', '11..*'],
      ['Partido', 'Arbitro', 'association', '0..*', '1..4'],
      ['Equipo', 'TablaPosiciones', 'association', '1', '1'],
      ['Equipo', 'Partido', 'association', '2', '0..*'],
    ],
  },
];

export async function runIngestion(): Promise<void> {
  console.log('[ETL] Iniciando pipeline de ingesta de esquemas de dominio...');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const catalogMap: Record<string, CanonicalDomainModel> = {};

  // 1. Ingerir dominios canónicos base verificados
  for (const d of CANONICAL_DOMAINS) {
    catalogMap[d.id] = d;
  }

  // 2. Ingerir plantillas de sectores estructuradas
  for (const t of TEMPLATES) {
    const domainModel: CanonicalDomainModel = {
      id: t.subsector,
      title: `${t.titleEs} / ${t.titleEn}`,
      category: t.category,
      keywords: {
        es: t.keywordsEs,
        en: t.keywordsEn,
      },
      classes: t.entityTemplates.map((e): DomainClass => ({
        name: e.name,
        attributes: e.attributes.map(([name, type]) => ({ name, type })),
      })),
      relationships: t.relations.map((r): DomainRelationship => ({
        source: r[0],
        target: r[1],
        type: r[2],
        sourceMultiplicity: r[3],
        targetMultiplicity: r[4],
      })),
    };
    catalogMap[t.subsector] = domainModel;
  }

  // 3. Generar índice liviano y persistir archivos de datos
  const allDomains = Object.values(catalogMap);
  const index = allDomains.map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    keywords: d.keywords,
  }));

  fs.writeFileSync(SCHEMAS_OUT, JSON.stringify(catalogMap, null, 2), 'utf-8');
  fs.writeFileSync(INDEX_OUT, JSON.stringify(index, null, 2), 'utf-8');

  console.log(`[ETL] Ingesta completada con éxito:`);
  console.log(`  - Total de dominios canónicos: ${allDomains.length}`);
  console.log(`  - Archivo de índice: ${INDEX_OUT} (${(fs.statSync(INDEX_OUT).size / 1024).toFixed(1)} KB)`);
  console.log(`  - Archivo de esquemas: ${SCHEMAS_OUT} (${(fs.statSync(SCHEMAS_OUT).size / 1024).toFixed(1)} KB)`);
}

// Ejecutar automáticamente si se invoca de forma directa
if (process.argv[1] && process.argv[1].endsWith('ingest-domain-blueprints.ts')) {
  runIngestion().catch((err) => {
    console.error('[ETL] Error fatal durante la ingesta:', err);
    process.exit(1);
  });
}

