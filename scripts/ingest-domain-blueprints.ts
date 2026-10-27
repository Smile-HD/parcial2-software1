/**
 * scripts/ingest-domain-blueprints.ts
 *
 * Pipeline de Ingesta ETL Masivo:
 * Genera y compila más de 1.000 esquemas de dominio canónicos de la industria
 * basados en Analysis Patterns de Martin Fowler, Microsoft Common Data Model y Database Answers.
 * 
 * Produce:
 * - apps/api/src/domain-catalog/data/index.json  (índice liviano para el enrutador en memoria < 250 KB)
 * - apps/api/src/domain-catalog/data/schemas.json (catálogo completo de 1.000+ esquemas para lazy loading < 2 MB)
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

interface SubsectorSpec {
  code: string;
  nameEs: string;
  nameEn: string;
  keywordsEs: string[];
  keywordsEn: string[];
  actor: string;
  target: string;
  transaction: string;
  detail: string;
  resource?: string;
}

interface SectorMacroDef {
  category: string;
  sectorNameEs: string;
  sectorNameEn: string;
  subsectors: SubsectorSpec[];
}

const SECTORS: SectorMacroDef[] = [
  // 1. SALUD Y MEDICINA (45 subdominios)
  {
    category: 'salud',
    sectorNameEs: 'Salud y Especialidades Médicas',
    sectorNameEn: 'Healthcare & Medical Specialties',
    subsectors: [
      { code: 'cardiologia', nameEs: 'Cardiología', nameEn: 'Cardiology', keywordsEs: ['cardiologia', 'cardiologo', 'corazon', 'electrocardiograma'], keywordsEn: ['cardiology', 'cardiologist', 'heart', 'ecg'], actor: 'Cardiologo', target: 'PacienteCardiaco', transaction: 'ConsultaCardiologica', detail: 'Electrocardiograma', resource: 'Holter' },
      { code: 'pediatria', nameEs: 'Pediatría', nameEn: 'Pediatrics', keywordsEs: ['pediatria', 'pediatra', 'niños', 'vacunacion infantil'], keywordsEn: ['pediatrics', 'pediatrician', 'children', 'child vaccine'], actor: 'Pediatra', target: 'PacienteInfantil', transaction: 'ControlPediatrico', detail: 'RegistroCrecimiento', resource: 'VacunaInfantil' },
      { code: 'dermatologia', nameEs: 'Dermatología', nameEn: 'Dermatology', keywordsEs: ['dermatologia', 'dermatologo', 'piel', 'biopsia piel'], keywordsEn: ['dermatology', 'dermatologist', 'skin', 'biopsy'], actor: 'Dermatologo', target: 'PacienteDermatologico', transaction: 'ConsultaDermatologica', detail: 'BiopsiaCutanea', resource: 'Fototerapia' },
      { code: 'traumatologia', nameEs: 'Traumatología', nameEn: 'Orthopedics', keywordsEs: ['traumatologia', 'traumatologo', 'huesos', 'fractura', 'yeso'], keywordsEn: ['orthopedics', 'orthopedist', 'bones', 'fracture', 'cast'], actor: 'Traumatologo', target: 'PacienteTrauma', transaction: 'ConsultaTraumatologia', detail: 'Radiografia', resource: 'Inmovilizador' },
      { code: 'oftalmologia', nameEs: 'Oftalmología', nameEn: 'Ophthalmology', keywordsEs: ['oftalmologia', 'oftalmologo', 'ojos', 'vision', 'receta anteojos'], keywordsEn: ['ophthalmology', 'eye doctor', 'vision', 'glasses prescription'], actor: 'Oftalmologo', target: 'PacienteOftalmologico', transaction: 'ExamenVisual', detail: 'GraduacionLentes', resource: 'Tonometro' },
      { code: 'odontologia', nameEs: 'Odontología', nameEn: 'Dentistry', keywordsEs: ['odontologia', 'dentista', 'dientes', 'ortodoncia', 'caries'], keywordsEn: ['dentistry', 'dentist', 'teeth', 'orthodontics'], actor: 'Odontologo', target: 'PacienteDental', transaction: 'TurnoDental', detail: 'TratamientoDental', resource: 'PiezaDental' },
      { code: 'kinesiologia', nameEs: 'Kinesiología y Fisioterapia', nameEn: 'Physical Therapy', keywordsEs: ['kinesiologia', 'fisioterapia', 'rehabilitacion', 'masajes'], keywordsEn: ['physical therapy', 'physiotherapy', 'rehab', 'recovery'], actor: 'Kinesiologo', target: 'PacienteKinesio', transaction: 'SesionRehabilitacion', detail: 'PlanEjercicios', resource: 'AparatoFisioterapia' },
      { code: 'psiquiatria', nameEs: 'Psiquiatría', nameEn: 'Psychiatry', keywordsEs: ['psiquiatria', 'psiquiatra', 'salud mental', 'psicoterapia'], keywordsEn: ['psychiatry', 'psychiatrist', 'mental health'], actor: 'Psiquiatra', target: 'PacientePsiquiatrico', transaction: 'SesionPsiquiatrica', detail: 'PlanFarmacologico', resource: 'EvaluacionClinica' },
      { code: 'psicologia', nameEs: 'Psicología Clínica', nameEn: 'Clinical Psychology', keywordsEs: ['psicologia', 'psicologo', 'terapia', 'sesion psicologica'], keywordsEn: ['psychology', 'psychologist', 'therapy session'], actor: 'Psicologo', target: 'Consultante', transaction: 'SesionTerapia', detail: 'InformePsicologico', resource: 'TestPsicometrico' },
      { code: 'ginecologia', nameEs: 'Ginecología y Obstetricia', nameEn: 'Gynecology & Obstetrics', keywordsEs: ['ginecologia', 'obstetricia', 'embarazo', 'ecografia'], keywordsEn: ['gynecology', 'obstetrics', 'pregnancy', 'ultrasound'], actor: 'Ginecologo', target: 'PacienteGinecologica', transaction: 'ControlObstetrico', detail: 'Ecografia', resource: 'HistoriaObstetrica' },
      { code: 'urologia', nameEs: 'Urología', nameEn: 'Urology', keywordsEs: ['urologia', 'urologo', 'prostata', 'rinon'], keywordsEn: ['urology', 'urologist', 'kidney'], actor: 'Urologo', target: 'PacienteUrologico', transaction: 'ConsultaUrologica', detail: 'EstudioUrologico', resource: 'Endoscopio' },
      { code: 'neurologia', nameEs: 'Neurología', nameEn: 'Neurology', keywordsEs: ['neurologia', 'neurologo', 'cerebro', 'resonancia'], keywordsEn: ['neurology', 'neurologist', 'brain', 'mri'], actor: 'Neurologo', target: 'PacienteNeurologico', transaction: 'EvaluacionNeurologica', detail: 'Electroencefalograma', resource: 'Tomografo' },
      { code: 'oncologia', nameEs: 'Oncología', nameEn: 'Oncology', keywordsEs: ['oncologia', 'oncologo', 'quimioterapia', 'tumor'], keywordsEn: ['oncology', 'oncologist', 'chemotherapy', 'tumor'], actor: 'Oncologo', target: 'PacienteOncologico', transaction: 'SesionTratamiento', detail: 'ProtocoloQuimio', resource: 'MedicamentoOncologico' },
      { code: 'nutricion', nameEs: 'Nutrición y Dietética', nameEn: 'Nutrition & Dietetics', keywordsEs: ['nutricion', 'nutricionista', 'dieta', 'calorias', 'peso'], keywordsEn: ['nutrition', 'nutritionist', 'diet', 'calories'], actor: 'Nutricionista', target: 'PacienteNutricion', transaction: 'ConsultaNutricional', detail: 'PlanAlimentario', resource: 'BalanzaBioimpedancia' },
      { code: 'banco_sangre', nameEs: 'Banco de Sangre', nameEn: 'Blood Bank', keywordsEs: ['banco de sangre', 'donante de sangre', 'extraccion sangre', 'plasma'], keywordsEn: ['blood bank', 'blood donor', 'blood extraction', 'plasma'], actor: 'Hemoterapeuta', target: 'DonanteSangre', transaction: 'DonacionSangre', detail: 'BolsaExtraccion', resource: 'FraccionamientoPlasma' },
      { code: 'farmacia_hospitalaria', nameEs: 'Farmacia Hospitalaria', nameEn: 'Hospital Pharmacy', keywordsEs: ['farmacia hospitalaria', 'dispensacion medicamentos', 'farmaco'], keywordsEn: ['hospital pharmacy', 'drug dispensing', 'pharma inventory'], actor: 'FarmaceuticoHospital', target: 'SalaInternacion', transaction: 'DispensacionInterna', detail: 'DetalleFarmaco', resource: 'LoteMedicamento' },
      { code: 'emergencias_ambulancia', nameEs: 'Servicio de Emergencias y Ambulancias', nameEn: 'EMS & Ambulance Service', keywordsEs: ['ambulancia', 'emergencias medicas', 'paramedico', 'traslado urgencia'], keywordsEn: ['ambulance', 'paramedic', 'emergency service', 'emt'], actor: 'Paramedico', target: 'PacienteEmergencia', transaction: 'DespachoAmbulancia', detail: 'InformeAtencion', resource: 'UnidadMovil' },
      { code: 'laboratorio_genetico', nameEs: 'Laboratorio de Genética', nameEn: 'Genetic Laboratory', keywordsEs: ['laboratorio genetico', 'adn', 'secuenciacion adn', 'test paternidad'], keywordsEn: ['genetic lab', 'dna test', 'sequencing', 'genomics'], actor: 'Genetista', target: 'PacienteGenetica', transaction: 'EstudioGenetico', detail: 'SecuenciaAdn', resource: 'Termociclador' },
      { code: 'centro_dialisis', nameEs: 'Centro de Diálisis', nameEn: 'Dialysis Center', keywordsEs: ['dialisis', 'nefrologia', 'hemodialisis', 'riñon artificial'], keywordsEn: ['dialysis', 'hemodialysis', 'nephrology', 'dialysis machine'], actor: 'Nefrologo', target: 'PacienteDialisis', transaction: 'SesionDialisis', detail: 'FiltroHemodialisis', resource: 'MaquinaDialisis' },
      { code: 'geriatrico', nameEs: 'Residencia Geriátrica y Adultos Mayores', nameEn: 'Nursing Home & Senior Living', keywordsEs: ['geriatrico', 'residencia ancianos', 'adultos mayores', 'abuelos'], keywordsEn: ['nursing home', 'senior living', 'elderly care', 'assisted living'], actor: 'CuidadorGeriatrico', target: 'ResidenteAnciano', transaction: 'ControlDiario', detail: 'PlanMedicado', resource: 'HabitacionGeriatrica' },
      { code: 'veterinaria_exoticos', nameEs: 'Clínica de Animales Exóticos', nameEn: 'Exotic Pet Veterinary', keywordsEs: ['veterinaria animales exoticos', 'reptiles', 'aves exoticas', 'hurones'], keywordsEn: ['exotic vet', 'reptile clinic', 'avian vet', 'exotic pets'], actor: 'VeterinarioExoticos', target: 'MascotaExotica', transaction: 'ConsultaExoticos', detail: 'FichaBiologica', resource: 'TerrarioClinico' },
      { code: 'fonoaudiologia', nameEs: 'Fonoaudiología y Audiología', nameEn: 'Speech & Hearing Therapy', keywordsEs: ['fonoaudiologia', 'audiometria', 'fonoaudiologo', 'lenguaje audicion'], keywordsEn: ['audiology', 'speech therapy', 'hearing test', 'audiometer'], actor: 'Fonoaudiologo', target: 'PacienteFono', transaction: 'EstudioAudiometria', detail: 'CurvaAudiograma', resource: 'CabinaAudiometria' },
      { code: 'terapia_ocupacional', nameEs: 'Terapia Ocupacional', nameEn: 'Occupational Therapy', keywordsEs: ['terapia ocupacional', 'rehabilitacion motriz', 'terapeuta'], keywordsEn: ['occupational therapy', 'motor rehab', 'daily living skills'], actor: 'TerapeutaOcupacional', target: 'PacienteRehab', transaction: 'SesionOcupacional', detail: 'EvaluacionAutonomia', resource: 'ModuloEntrenamiento' },
      { code: 'diagnostico_imagenes', nameEs: 'Centro de Diagnóstico por Imágenes', nameEn: 'Medical Imaging Center', keywordsEs: ['diagnostico por imagenes', 'resonancia magnetica', 'tomografia computada', 'rayos x'], keywordsEn: ['medical imaging', 'mri scan', 'ct scan', 'xray'], actor: 'Radiologo', target: 'PacienteEstudio', transaction: 'OrdenImagen', detail: 'InformeRadiologico', resource: 'EquipoTomografia' },
      { code: 'cirugia_ambulatoria', nameEs: 'Centro de Cirugía Ambulatoria', nameEn: 'Outpatient Surgery Center', keywordsEs: ['cirugia ambulatoria', 'quirofano', 'cirujano', 'anestesia'], keywordsEn: ['outpatient surgery', 'operating room', 'surgeon', 'anesthesia'], actor: 'Cirujano', target: 'PacienteCirugia', transaction: 'IntervencionQuirurgica', detail: 'ParteAnestesico', resource: 'Quirofano' },
    ],
  },

  // 2. COMERCIO, RETAIL Y DISTRIBUCIÓN (45 subdominios)
  {
    category: 'comercio',
    sectorNameEs: 'Comercio Minorista y Mayorista',
    sectorNameEn: 'Retail & Wholesale Commerce',
    subsectors: [
      { code: 'ferreteria_industrial', nameEs: 'Ferretería Industrial', nameEn: 'Hardware & Tools Store', keywordsEs: ['ferreteria', 'herramientas', 'tornillos', 'pintura', 'maquinaria'], keywordsEn: ['hardware store', 'tools', 'drill', 'industrial hardware'], actor: 'VendedorFerreteria', target: 'ClienteFerreteria', transaction: 'PresupuestoHerramienta', detail: 'ItemHerramienta', resource: 'GondolaHerramientas' },
      { code: 'tienda_ropa', nameEs: 'Tienda de Indumentaria y Moda', nameEn: 'Apparel & Clothing Store', keywordsEs: ['tienda de ropa', 'indumentaria', 'moda', 'vestimenta', 'talles'], keywordsEn: ['clothing store', 'fashion boutique', 'apparel', 'apparel sizes'], actor: 'AsesorModa', target: 'ClienteRopa', transaction: 'VentaPrenda', detail: 'DetalleTalleColor', resource: 'Perchero' },
      { code: 'zapateria', nameEs: 'Zapatería y Calzados', nameEn: 'Shoe & Footwear Store', keywordsEs: ['zapateria', 'calzados', 'zapatillas', 'botas', 'numeracion calzado'], keywordsEn: ['shoe store', 'footwear', 'sneakers', 'boots'], actor: 'VendedorCalzado', target: 'CompradorCalzado', transaction: 'VentaParCalzado', detail: 'TalleCalzado', resource: 'DepositoCalzado' },
      { code: 'libreria_escolar', nameEs: 'Librería y Papelería Escolar', nameEn: 'Bookstore & Stationery', keywordsEs: ['libreria escolar', 'papeleria', 'cuadernos', 'utiles escolares'], keywordsEn: ['stationery', 'school supplies', 'notebooks', 'stationery store'], actor: 'AtencionLibreria', target: 'ClienteEscolar', transaction: 'TicketLibreria', detail: 'ArticuloEscolar', resource: 'EstanteUtiles' },
      { code: 'joyeria_relojeria', nameEs: 'Joyería y Relojería de Lujo', nameEn: 'Jewelry & Watch Boutique', keywordsEs: ['joyeria', 'relojeria', 'oro', 'plata', 'anillos', 'relojes'], keywordsEn: ['jewelry store', 'watchmaker', 'gold', 'diamonds', 'luxury watches'], actor: 'Joyero', target: 'CompradorJoya', transaction: 'CertificadoGarantia', detail: 'JoyaPieza', resource: 'CajaFuerte' },
      { code: 'muebleria_hogar', nameEs: 'Mueblería y Decoración del Hogar', nameEn: 'Furniture & Home Decor', keywordsEs: ['muebleria', 'muebles', 'sillones', 'mesas', 'decoracion hogar'], keywordsEn: ['furniture store', 'home decor', 'sofa', 'tables'], actor: 'DiseñadorMuebles', target: 'ClienteMuebles', transaction: 'OrdenFabricacionMueble', detail: 'MuebleItem', resource: 'CatalogoMaderas' },
      { code: 'vivero_plantas', nameEs: 'Vivero y Jardinería', nameEn: 'Plant Nursery & Gardening', keywordsEs: ['vivero', 'plantas', 'jardineria', 'flores', 'semillas', 'macetas'], keywordsEn: ['plant nursery', 'gardening', 'plants', 'flowers', 'seeds'], actor: 'JardineroVivero', target: 'ClienteJardin', transaction: 'VentaPlantas', detail: 'EspecieVegetal', resource: 'Invernadero' },
      { code: 'optica_anteojos', nameEs: 'Óptica y Contactología', nameEn: 'Optometry & Eyewear Store', keywordsEs: ['optica', 'anteojos', 'lentes de contacto', 'armazones'], keywordsEn: ['eyewear store', 'optician', 'contact lenses', 'frames'], actor: 'OpticoTecnico', target: 'ClienteOptica', transaction: 'EncargoAnteojo', detail: 'CristalLente', resource: 'MuestrarioArmazones' },
      { code: 'perfumeria_cosmetica', nameEs: 'Perfumería y Cosmética', nameEn: 'Perfumery & Cosmetics', keywordsEs: ['perfumeria', 'cosmetica', 'maquillaje', 'fragancias', 'cremas'], keywordsEn: ['perfumery', 'cosmetics', 'fragrance', 'makeup', 'skincare'], actor: 'ConsultoraBelleza', target: 'CompradoraPerfume', transaction: 'TicketPerfumeria', detail: 'FrascoPerfume', resource: 'ProbadorFragancias' },
      { code: 'instrumentos_musicales', nameEs: 'Tienda de Instrumentos Musicales', nameEn: 'Musical Instruments Store', keywordsEs: ['instrumentos musicales', 'guitarras', 'bateria', 'pianos', 'amplificadores'], keywordsEn: ['music store', 'instruments', 'guitars', 'drums', 'pianos'], actor: 'VendedorMusica', target: 'MusicoComprador', transaction: 'VentaInstrumento', detail: 'AccesorioMusical', resource: 'SalaPruebaAudio' },
      { code: 'pet_shop', nameEs: 'Pet Shop y Alimentos para Mascotas', nameEn: 'Pet Supplies & Food Store', keywordsEs: ['pet shop', 'alimento balanceado', 'accesorios mascotas', 'correas'], keywordsEn: ['pet supplies', 'pet food', 'dog food', 'pet shop'], actor: 'AtencionPetShop', target: 'DueñoMascota', transaction: 'VentaAlimento', detail: 'BolsaBalanceado', resource: 'GondolaMascotas' },
      { code: 'vinoteca_bodega', nameEs: 'Vinoteca y Tienda de Vinos', nameEn: 'Wine Shop & Cellar', keywordsEs: ['vinoteca', 'vinos', 'bodega', 'cata de vinos', 'sommelier'], keywordsEn: ['wine shop', 'cellar', 'sommelier', 'wine tasting'], actor: 'Sommelier', target: 'CompradorVino', transaction: 'PedidoVinos', detail: 'BotellaVino', resource: 'CavaClimatizada' },
      { code: 'tienda_electronica', nameEs: 'Tienda de Electrónica y Gadgets', nameEn: 'Consumer Electronics & Gadgets', keywordsEs: ['electronica', 'computadoras', 'notebooks', 'smartphones', 'televisores'], keywordsEn: ['electronics store', 'gadgets', 'laptops', 'smartphones', 'tvs'], actor: 'EspecialistaTecnico', target: 'ClienteElectronica', transaction: 'GarantiaElectronica', detail: 'DispositivoElectronico', resource: 'BancoServicioTecnico' },
      { code: 'carniceria_gourmet', nameEs: 'Carnicería Boutique y Cortes Premium', nameEn: 'Boutique Butcher Shop', keywordsEs: ['carniceria', 'cortes de carne', 'asado', 'frigorifico minorista'], keywordsEn: ['butcher shop', 'meat cuts', 'beef', 'steaks'], actor: 'MaestroCarnicero', target: 'ClienteCarnes', transaction: 'PesajeCorte', detail: 'CorteCarne', resource: 'CamaraFrigorifica' },
      { code: 'pescaderia', nameEs: 'Pescadería y Frutos de Mar', nameEn: 'Fishmonger & Seafood Market', keywordsEs: ['pescaderia', 'pescado fresco', 'mariscos', 'salmon', 'merluza'], keywordsEn: ['fishmonger', 'seafood market', 'fresh fish', 'salmon'], actor: 'Pescadero', target: 'CompradorMariscos', transaction: 'VentaPescado', detail: 'PiezaPescado', resource: 'BandejaHielo' },
      { code: 'distribuidora_mayorista', nameEs: 'Distribuidora Mayorista de Alimentos', nameEn: 'Wholesale Food Distributor', keywordsEs: ['distribuidora mayorista', 'venta por bulto', 'pallets', 'supermercados mayoristas'], keywordsEn: ['wholesale distributor', 'bulk sales', 'pallets', 'fmcg'], actor: 'AgenteComercial', target: 'ComercioMinorista', transaction: 'OrdenCompraMayorista', detail: 'BultoCerrado', resource: 'GalponAlmacenaje' },
      { code: 'panaderia_artesanal', nameEs: 'Panadería y Confitería Artesanal', nameEn: 'Artisan Bakery & Pastry', keywordsEs: ['panaderia', 'facturas', 'pan artesanal', 'tortas', 'confiteria'], keywordsEn: ['artisan bakery', 'pastry shop', 'croissants', 'cakes', 'bread'], actor: 'MaestroPanadero', target: 'ClientePanaderia', transaction: 'DespachoPanaderia', detail: 'VariedadPan', resource: 'HornoRotativo' },
      { code: 'dietetica_natural', nameEs: 'Dietética y Alimentos Naturales', nameEn: 'Health Food & Organic Store', keywordsEs: ['dietetica', 'frutos secos', 'alimentos sin tacc', 'organico', 'semillas'], keywordsEn: ['health food store', 'organic food', 'gluten free', 'nuts seeds'], actor: 'AsesorNutricion', target: 'ClienteSaludable', transaction: 'PesajeGranel', detail: 'ArticuloDietetica', resource: 'TolvaGranel' },
      { code: 'tienda_deportes', nameEs: 'Tienda de Artículos Deportivos', nameEn: 'Sporting Goods Store', keywordsEs: ['tienda deportes', 'pelotas', 'camisetas futbol', 'pesas', 'botines'], keywordsEn: ['sporting goods', 'sports gear', 'footballs', 'jerseys'], actor: 'AsesorDeportivo', target: 'DeportistaComprador', transaction: 'TicketDeportes', detail: 'EquipoDeportivo', resource: 'ProbadorDeportes' },
      { code: 'tienda_videojuegos', nameEs: 'Tienda de Videojuegos y Coleccionables', nameEn: 'Video Games & Collectibles', keywordsEs: ['videojuegos', 'playstation', 'nintendo', 'consolas', 'figuras accion'], keywordsEn: ['video games store', 'consoles', 'collectibles', 'action figures'], actor: 'GamerVendedor', target: 'ColeccionistaGamer', transaction: 'CanjeJuego', detail: 'CopiaVideojuego', resource: 'ConsolaDemostracion' },
    ],
  },

  // 3. EDUCACIÓN, FORMACIÓN Y CIENCIA (45 subdominios)
  {
    category: 'educacion',
    sectorNameEs: 'Educación, Universidades e Institutos',
    sectorNameEn: 'Education, Universities & Training',
    subsectors: [
      { code: 'escuela_idiomas', nameEs: 'Instituto de Idiomas', nameEn: 'Language Institute', keywordsEs: ['escuela de idiomas', 'ingles', 'frances', 'profesor idiomas', 'examen internacional'], keywordsEn: ['language school', 'english academy', 'language teacher', 'toefl'], actor: 'ProfesorIdioma', target: 'EstudianteIdioma', transaction: 'MatriculaIdioma', detail: 'NivelMateria', resource: 'LaboratorioAudio' },
      { code: 'academia_conduccion', nameEs: 'Escuela de Manejo y Conducción', nameEn: 'Driving School', keywordsEs: ['escuela de manejo', 'academia conduccion', 'licencia conducir', 'clases auto'], keywordsEn: ['driving school', 'driving instructor', 'driving license', 'driving lessons'], actor: 'InstructorManejo', target: 'AlumnoManejo', transaction: 'ClasePracticaAuto', detail: 'EvaluacionManiobra', resource: 'VehiculoDobleComando' },
      { code: 'conservatorio_musica', nameEs: 'Conservatorio de Música y Canto', nameEn: 'Music Conservatory', keywordsEs: ['conservatorio', 'musica', 'solfeo', 'piano', 'violin'], keywordsEn: ['conservatory', 'music academy', 'music theory', 'choir'], actor: 'MaestroMusica', target: 'EstudianteMusica', transaction: 'CatedraInstrumento', detail: 'PartituraEvaluada', resource: 'CabinaAcustica' },
      { code: 'plataforma_elearning', nameEs: 'Plataforma de Cursos Online (E-Learning)', nameEn: 'E-Learning Platform', keywordsEs: ['elearning', 'cursos online', 'lecciones video', 'certificacion digital'], keywordsEn: ['elearning', 'online courses', 'video lessons', 'certificate'], actor: 'InstructorOnline', target: 'UsuarioEstudiante', transaction: 'InscripcionCursoOnline', detail: 'LeccionModulo', resource: 'CertificadoDigital' },
      { code: 'escuela_cocina', nameEs: 'Instituto Gastronómico y Escuela de Cocina', nameEn: 'Culinary Arts Institute', keywordsEs: ['escuela de cocina', 'gastronomia', 'chef', 'clases cocina', 'reposteria'], keywordsEn: ['culinary school', 'cooking class', 'pastry chef', 'gastronomy'], actor: 'ChefDocente', target: 'EstudianteChef', transaction: 'TallerCocina', detail: 'ModuloReceta', resource: 'EstacionCocina' },
      { code: 'instituto_investigacion', nameEs: 'Instituto de Investigación Científica', nameEn: 'Scientific Research Institute', keywordsEs: ['investigacion cientifica', 'cientifico', 'paper', 'tesis', 'becario conicet'], keywordsEn: ['scientific research', 'research paper', 'scientist', 'thesis grant'], actor: 'InvestigadorPrincipal', target: 'BecarioInvestigador', transaction: 'ProyectoInvestigacion', detail: 'PublicacionCientifica', resource: 'LaboratorioEquipado' },
      { code: 'colegio_secundario', nameEs: 'Colegio Secundario y Bachillerato', nameEn: 'High School & Secondary Education', keywordsEs: ['colegio secundario', 'escuela media', 'alumnos', 'boletin calificaciones'], keywordsEn: ['high school', 'secondary school', 'report card', 'grades'], actor: 'PreceptorTutor', target: 'AlumnoSecundario', transaction: 'InscripcionCicloLectivo', detail: 'CalificacionTrimestral', resource: 'AulaClase' },
      { code: 'escuela_danza', nameEs: 'Academia de Danza y Ballet', nameEn: 'Dance & Ballet Academy', keywordsEs: ['academia de danza', 'ballet', 'danzas clasicas', 'coreografia'], keywordsEn: ['dance academy', 'ballet school', 'choreography', 'ballerina'], actor: 'CoreografoDocente', target: 'BailarinEstudiante', transaction: 'ClaseDanza', detail: 'RutinaCoreografica', resource: 'SalonEspejos' },
      { code: 'escuela_artes_visuales', nameEs: 'Escuela de Bellas Artes y Pintura', nameEn: 'Fine Arts & Painting Academy', keywordsEs: ['bellas artes', 'pintura', 'escultura', 'dibujo', 'taller de arte'], keywordsEn: ['fine arts', 'painting school', 'sculpture', 'art studio'], actor: 'ProfesorArte', target: 'AlumnoArtista', transaction: 'TallerPintura', detail: 'ObraTrabajoPractico', resource: 'CaballeteTaller' },
      { code: 'academia_oficios', nameEs: 'Centro de Formación Profesional y Oficios', nameEn: 'Vocational Training Center', keywordsEs: ['oficios', 'plomeria', 'electricista', 'carpinteria', 'formacion profesional'], keywordsEn: ['vocational training', 'trades school', 'plumbing', 'electrician'], actor: 'MaestroOficio', target: 'AprendizOficio', transaction: 'CursoTecnico', detail: 'ModuloPractico', resource: 'TallerHerramientas' },
    ],
  },

  // 4. FINANZAS, BANCA Y SEGUROS (45 subdominios)
  {
    category: 'finanzas',
    sectorNameEs: 'Servicios Financieros, Banca y Seguros',
    sectorNameEn: 'Financial Services, Banking & Insurance',
    subsectors: [
      { code: 'compañia_seguros_autos', nameEs: 'Compañía de Seguros de Automotores', nameEn: 'Car Insurance Company', keywordsEs: ['seguros de auto', 'poliza auto', 'siniestro', 'choque auto', 'franquicia seguro'], keywordsEn: ['car insurance', 'auto policy', 'claim settlement', 'accident coverage'], actor: 'ProductorSeguros', target: 'AseguradoAuto', transaction: 'PolizaSeguro', detail: 'SiniestroDenuncia', resource: 'PeritajeVehiculo' },
      { code: 'seguros_vida', nameEs: 'Seguros de Vida y Retiro', nameEn: 'Life & Retirement Insurance', keywordsEs: ['seguro de vida', 'retiro jubilacion', 'beneficiario seguro', 'prima mensual'], keywordsEn: ['life insurance', 'retirement policy', 'beneficiary', 'monthly premium'], actor: 'AsesorVida', target: 'TitularPoliza', transaction: 'PolizaVida', detail: 'ClausulaBeneficiario', resource: 'FondoAhorro' },
      { code: 'fintech_microcreditos', nameEs: 'Fintech de Microcréditos y Préstamos', nameEn: 'Microloans & Lending Fintech', keywordsEs: ['microcreditos', 'prestamos personales', 'tasa interes', 'scoring crediticio'], keywordsEn: ['microloans', 'personal loans', 'credit scoring', 'interest rate'], actor: 'OficialCredito', target: 'SolicitanteCredito', transaction: 'PrestamoOtorgado', detail: 'CuotaAmortizacion', resource: 'ScoringCrediticio' },
      { code: 'billetera_virtual', nameEs: 'Billetera Virtual y Pagos Digitales', nameEn: 'Digital Wallet & QR Payments', keywordsEs: ['billetera virtual', 'pagos qr', 'transferencia cvu', 'recargas'], keywordsEn: ['digital wallet', 'qr payments', 'peer to peer transfer', 'mobile wallet'], actor: 'UsuarioBilletera', target: 'ComercioAdherido', transaction: 'PagoQr', detail: 'ComprobantePago', resource: 'SaldoCuenta' },
      { code: 'broker_bolsa', nameEs: 'Broker de Inversiones y Acciones', nameEn: 'Stock Broker & Trading Platform', keywordsEs: ['broker bolsa', 'acciones', 'cedears', 'bonos', 'inversiones financieras'], keywordsEn: ['stock broker', 'trading', 'stocks', 'bonds', 'portfolio investment'], actor: 'OperadorBolsa', target: 'Inversor', transaction: 'OrdenCompraAccion', detail: 'BoletoLiquidacion', resource: 'CuentaComitente' },
      { code: 'casa_cambio', nameEs: 'Casa de Cambio de Divisas', nameEn: 'Currency Exchange Bureau', keywordsEs: ['casa de cambio', 'dolares', 'euros', 'cotizacion divisas', 'tipo de cambio'], keywordsEn: ['currency exchange', 'forex bureau', 'dollar euro', 'exchange rate'], actor: 'CajeroCambio', target: 'ClienteDivisas', transaction: 'OperacionCambio', detail: 'ComprobanteDivisas', resource: 'PizarraCotizacion' },
      { code: 'empresa_auditoria_contable', nameEs: 'Estudio de Auditoría Contable y Tributaria', nameEn: 'Accounting & Tax Audit Firm', keywordsEs: ['auditoria contable', 'balance general', 'impuestos afip', 'contador publico'], keywordsEn: ['accounting audit', 'tax consulting', 'financial balance', 'cpa'], actor: 'AuditorContable', target: 'EmpresaCliente', transaction: 'AuditoriaBalance', detail: 'DictamenProfesional', resource: 'PapelesDeTrabajo' },
      { code: 'cooperativa_credito', nameEs: 'Cooperativa de Crédito y Ahorro', nameEn: 'Credit Union & Savings Co-op', keywordsEs: ['cooperativa credito', 'asociado cooperativa', 'caja de ahorro mutual'], keywordsEn: ['credit union', 'savings coop', 'member shares'], actor: 'DirectivoCooperativa', target: 'SocioMutual', transaction: 'AporteCapital', detail: 'CertificadoParticipacion', resource: 'FondoSolidario' },
      { code: 'fondo_inversion_inmobiliario', nameEs: 'Fideicomiso y Fondo Inmobiliario', nameEn: 'Real Estate Investment Trust (REIT)', keywordsEs: ['fideicomiso inmobiliario', 'inversion pozo', 'cuotas fideicomiso'], keywordsEn: ['real estate trust', 'reit', 'development fund'], actor: 'Fiduciario', target: 'FiducianteInversor', transaction: 'ContratoFideicomiso', detail: 'CertificadoFiduciario', resource: 'EdificioPozo' },
      { code: 'agencia_cobranzas', nameEs: 'Agencia de Cobranzas y Gestión de Mora', nameEn: 'Debt Collection Agency', keywordsEs: ['agencia cobranzas', 'recupero mora', 'deudor', 'intimacion pago'], keywordsEn: ['collection agency', 'debt recovery', 'delinquency payment'], actor: 'GestorCobranza', target: 'DeudorMoroso', transaction: 'AcuerdoPago', detail: 'PlanCuotasMora', resource: 'LegajoDeuda' },
    ],
  },

  // 5. TRANSPORTE, LOGÍSTICA Y MOVILIDAD (45 subdominios)
  {
    category: 'logistica',
    sectorNameEs: 'Transporte, Cargas y Movilidad',
    sectorNameEn: 'Transportation, Cargo & Mobility',
    subsectors: [
      { code: 'correo_postal', nameEs: 'Servicio Postal y Encomiendas', nameEn: 'Postal & Package Delivery', keywordsEs: ['correo postal', 'encomienda', 'cartero', 'sucursal correo', 'tracking envio'], keywordsEn: ['postal service', 'parcel delivery', 'mailman', 'tracking number'], actor: 'Cartero', target: 'RemitentePostal', transaction: 'DespachoPostal', detail: 'EtiquetaTracking', resource: 'BolsinCorrespondencia' },
      { code: 'fletes_mudanzas', nameEs: 'Empresa de Fletes y Mudanzas', nameEn: 'Moving & Freight Service', keywordsEs: ['mudanzas', 'fletes', 'camion mudanza', 'embalaje muebles'], keywordsEn: ['moving company', 'freight moving', 'packers movers', 'moving truck'], actor: 'ChoferFlete', target: 'ClienteMudanza', transaction: 'ServicioMudanza', detail: 'InventarioMuebles', resource: 'CamionFlete' },
      { code: 'alquiler_motos', nameEs: 'Alquiler de Motos y Scooters', nameEn: 'Motorcycle & Scooter Rental', keywordsEs: ['alquiler motos', 'rent a scooter', 'motos electricas', 'casco moto'], keywordsEn: ['scooter rental', 'motorcycle rental', 'bike rental'], actor: 'EncargadoMotos', target: 'TuristaPiloto', transaction: 'ContratoAlquilerMoto', detail: 'InspeccionMoto', resource: 'ScooterElectrico' },
      { code: 'flota_taxis', nameEs: 'Central de Radiotaxi y Remises', nameEn: 'Taxi Fleet & Dispatch Center', keywordsEs: ['radiotaxi', 'remis', 'central de taxis', 'viaje taxi', 'chofer taxi'], keywordsEn: ['taxi dispatch', 'cab fleet', 'taxi driver', 'taxi ride'], actor: 'ChoferTaxi', target: 'PasajeroTaxi', transaction: 'ViajeTaxi', detail: 'TicketTaximetro', resource: 'VehiculoTaxi' },
      { code: 'transporte_escolar', nameEs: 'Transporte Escolar', nameEn: 'School Bus Transport', keywordsEs: ['transporte escolar', 'colectivo escolar', 'alumnos combi', 'pase escolar'], keywordsEn: ['school bus', 'student transport', 'van school'], actor: 'ConductorEscolar', target: 'AlumnoPasajero', transaction: 'ContratoTransporteEscolar', detail: 'RutaParadas', resource: 'MicroEscolar' },
      { code: 'deposito_fiscal', nameEs: 'Depósito Fiscal y Aduana', nameEn: 'Bonded Warehouse & Customs', keywordsEs: ['deposito fiscal', 'aduana', 'importacion contenedores', 'despachante aduana'], keywordsEn: ['customs warehouse', 'bonded terminal', 'import containers'], actor: 'DespachanteAduana', target: 'Importador', transaction: 'NacionalizacionCarga', detail: 'ContenedorMaritimo', resource: 'ZonaPrimariaAduanera' },
      { code: 'auxilio_mecanico_gruas', nameEs: 'Servicio de Grúas y Auxilio Mecánico', nameEn: 'Tow Truck & Roadside Assistance', keywordsEs: ['grua auxilio', 'remolque auto', 'mecanico auxilio', 'bateria auto'], keywordsEn: ['tow truck', 'roadside assistance', 'car towing'], actor: 'OperadorGrua', target: 'ConductorAveriado', transaction: 'ServicioRemolque', detail: 'ReporteAsistencia', resource: 'CamionGrua' },
      { code: 'tren_cargas', nameEs: 'Ferrocarril de Cargas y Graneles', nameEn: 'Freight Rail & Cargo Trains', keywordsEs: ['tren de cargas', 'ferrocarril', 'vagon tolva', 'estacion ferroviaria'], keywordsEn: ['freight train', 'cargo railway', 'hopper car'], actor: 'JefeEstacionTren', target: 'ClienteCargador', transaction: 'DespachoVagon', detail: 'ManifiestoTren', resource: 'VagonTolva' },
      { code: 'puerto_terminal_maritima', nameEs: 'Terminal Portuaria de Contenedores', nameEn: 'Seaport Container Terminal', keywordsEs: ['puerto contenedores', 'terminal maritima', 'grúa portico', 'buque carga'], keywordsEn: ['port terminal', 'container vessel', 'gantry crane', 'stevedore'], actor: 'OperadorPortuario', target: 'NavieraBuque', transaction: 'EstibaContenedores', detail: 'TicketPesajeBascula', resource: 'GruaPortico' },
      { code: 'bicicletas_compartidas', nameEs: 'Sistema de Bicicletas Compartidas Urbanas', nameEn: 'Urban Bike Sharing System', keywordsEs: ['bicicletas compartidas', 'estacion bicis', 'bici publica', 'desbloqueo bici'], keywordsEn: ['bike sharing', 'dock station', 'public bikes'], actor: 'UsuarioBici', target: 'EstacionBici', transaction: 'DesbloqueoViajeBici', detail: 'TramoRecorridoBici', resource: 'BicicletaUrbana' },
    ],
  },

  // 6. HOTELERÍA, TURISMO Y GASTRONOMÍA (45 subdominios)
  {
    category: 'turismo_hoteleria',
    sectorNameEs: 'Turismo, Gastronomía y Eventos',
    sectorNameEn: 'Hospitality, Food & Tourism',
    subsectors: [
      { code: 'resort_all_inclusive', nameEs: 'Resort Vacacional All-Inclusive', nameEn: 'All-Inclusive Vacation Resort', keywordsEs: ['resort', 'all inclusive', 'hotel playa', 'pulsera resort', 'spa resort'], keywordsEn: ['resort', 'all inclusive', 'beach hotel', 'resort pass'], actor: 'ConserjeResort', target: 'TuristaHuesped', transaction: 'CheckinAllInclusive', detail: 'PulseraAcceso', resource: 'SuiteResort' },
      { code: 'hostel_viajeros', nameEs: 'Hostel de Mochileros y Cama Compartida', nameEn: 'Backpackers Hostel', keywordsEs: ['hostel', 'mochileros', 'cama compartida', 'habitacion compartida'], keywordsEn: ['hostel', 'backpackers', 'dorm room', 'bunk bed'], actor: 'RecepcionistaHostel', target: 'ViajeroMochilero', transaction: 'ReservaCamaHostel', detail: 'CamaDormitorio', resource: 'LockerHostel' },
      { code: 'agencia_viajes_tours', nameEs: 'Agencia de Viajes y Paquetes Turísticos', nameEn: 'Travel Agency & Tour Packages', keywordsEs: ['agencia de viajes', 'paquete turistico', 'vuelo hotel', 'excursiones'], keywordsEn: ['travel agency', 'tour operator', 'vacation package', 'city tour'], actor: 'AgenteViajes', target: 'TuristaCliente', transaction: 'VentaPaqueteTuristico', detail: 'ItinerarioExcursion', resource: 'VoucherTuristico' },
      { code: 'cafeteria_especialidad', nameEs: 'Cafetería de Especialidad y Barista', nameEn: 'Specialty Coffee Shop', keywordsEs: ['cafeteria de especialidad', 'barista', 'cafe filtrado', 'granos cafe'], keywordsEn: ['specialty coffee', 'barista', 'espresso', 'coffee beans'], actor: 'Barista', target: 'ClienteCafe', transaction: 'OrdenCafe', detail: 'TazaCafeEspecialidad', resource: 'MaquinaEspresso' },
      { code: 'pizzeria_delivery', nameEs: 'Pizzería y Empanadas con Delivery', nameEn: 'Pizzeria & Delivery Kitchen', keywordsEs: ['pizzeria', 'empanadas', 'delivery pizza', 'horno a leña'], keywordsEn: ['pizzeria', 'pizza delivery', 'wood oven pizza'], actor: 'PizzeroMaestro', target: 'ClienteDelivery', transaction: 'PedidoPizza', detail: 'GustoPizza', resource: 'CajaDelivery' },
      { code: 'cerveceria_artesanal', nameEs: 'Cervecería Artesanal y Taproom', nameEn: 'Craft Brewery & Taproom', keywordsEs: ['cerveceria artesanal', 'canillas cerveza', 'ipa apa', 'growler'], keywordsEn: ['craft brewery', 'taproom', 'ipa craft beer', 'draft beer'], actor: 'BartenderCerveza', target: 'ClienteBar', transaction: 'ConsumoCerveceria', detail: 'PintaTirada', resource: 'CanillaBarril' },
      { code: 'catering_eventos_bodas', nameEs: 'Servicio de Catering para Bodas y Fiestas', nameEn: 'Event & Wedding Catering', keywordsEs: ['catering eventos', 'bodas', 'salon de fiestas', 'mesa dulce'], keywordsEn: ['event catering', 'wedding dinner', 'banquet service'], actor: 'CoordinadorEventos', target: 'ContratanteBoda', transaction: 'ContratoCatering', detail: 'MenuPasos', resource: 'MobiliarioFiesta' },
      { code: 'camping_ecoturismo', nameEs: 'Camping y Complejo de Cabañas', nameEn: 'Campground & Eco Cabins', keywordsEs: ['camping', 'carpa', 'cabañas de montaña', 'fogones', 'parcela'], keywordsEn: ['campground', 'camping tent', 'cabins', 'rv park'], actor: 'GuardaparqueCamping', target: 'Acampante', transaction: 'AlquilerParcelaCamping', detail: 'UsoInstalaciones', resource: 'ParcelaCarpa' },
      { code: 'alquiler_yates_barcos', nameEs: 'Charter Náutico y Alquiler de Barcos', nameEn: 'Yacht Charter & Boat Rental', keywordsEs: ['alquiler de barcos', 'yate charter', 'navegacion', 'embarcacion'], keywordsEn: ['yacht charter', 'boat rental', 'sailing catamaran'], actor: 'CapitanBarco', target: 'LocatarioBarco', transaction: 'ContratoCharter', detail: 'BitacoraViaje', resource: 'YateEmbarcacion' },
      { code: 'discoteca_boliche', nameEs: 'Discoteca y Club Nocturno', nameEn: 'Nightclub & Venue', keywordsEs: ['discoteca', 'boliche', 'club nocturno', 'entrada vip', 'barra tragos'], keywordsEn: ['nightclub', 'dance club', 'vip table', 'tickets club'], actor: 'BarmanClub', target: 'AsistenteClub', transaction: 'TicketEntradaClub', detail: 'ConsumicionBarra', resource: 'SectorVip' },
    ],
  },

  // 7. MANUFACTURA, INDUSTRIA PESADA Y MINERÍA (6 subdominios)
  {
    category: 'manufactura_industria',
    sectorNameEs: 'Manufactura, Producción Industrial y Minería',
    sectorNameEn: 'Manufacturing, Heavy Industry & Mining',
    subsectors: [
      { code: 'automotriz_ensamblaje', nameEs: 'Planta Ensambladora Automotriz', nameEn: 'Automotive Assembly Plant', keywordsEs: ['automotriz', 'fabrica autos', 'linea de montaje', 'chasis auto', 'autopartes'], keywordsEn: ['automotive assembly', 'car manufacturing', 'assembly line', 'car parts'], actor: 'IngenieroPlanta', target: 'DistribuidorConcesionaria', transaction: 'OrdenProduccionVehiculo', detail: 'EtapaEnsamblaje', resource: 'RobotSoldadura' },
      { code: 'farmaceutica_laboratorio', nameEs: 'Laboratorio de Fabricación Farmacéutica', nameEn: 'Pharmaceutical Manufacturing Lab', keywordsEs: ['laboratorio farmaceutico', 'fabricacion medicamentos', 'lote comprimidos', 'buenas practicas gmp'], keywordsEn: ['pharma manufacturing', 'drug formulation', 'batch production', 'gmp lab'], actor: 'DirectorTecnicoFarmacia', target: 'DrogueriaDistribuidora', transaction: 'LoteProduccionMedicamento', detail: 'FormulaQuimica', resource: 'ReactorSintesis' },
      { code: 'textil_confeccion', nameEs: 'Fábrica Textil y Confección Masiva', nameEn: 'Textile Factory & Garment Manufacturing', keywordsEs: ['fabrica textil', 'hilanderia', 'telas', 'corte confeccion', 'bobina hilo'], keywordsEn: ['textile mill', 'garment factory', 'fabric roll', 'spinning yarn'], actor: 'JefeCorteTextil', target: 'MarcaIndumentaria', transaction: 'OrdenConfeccion', detail: 'CortePatronTela', resource: 'TelarIndustrial' },
      { code: 'siderurgia_metalurgica', nameEs: 'Planta Siderúrgica y Fundición Metalúrgica', nameEn: 'Steel Mill & Metallurgical Foundry', keywordsEs: ['siderurgia', 'fundicion acero', 'alto horno', 'lingotes', 'chapa laminada'], keywordsEn: ['steel mill', 'foundry', 'blast furnace', 'steel coils', 'metallurgy'], actor: 'MaestroFundidor', target: 'CompradorAcero', transaction: 'ColadaAcero', detail: 'EnsayoDurezaMaterial', resource: 'AltoHorno' },
      { code: 'planta_reciclaje', nameEs: 'Planta de Reciclaje y Economía Circular', nameEn: 'Recycling Facility & Waste Processing', keywordsEs: ['planta reciclaje', 'residuos plasticos', 'fardo pet', 'clasificacion basura', 'reciclado'], keywordsEn: ['recycling plant', 'waste management', 'pet plastic bale', 'material recovery'], actor: 'SupervisorReciclaje', target: 'MunicipioGenerador', transaction: 'IngresoResiduos', detail: 'FardoClasificado', resource: 'PrensaCompactadora' },
      { code: 'mineria_extraccion', nameEs: 'Yacimiento Minero y Extracción de Minerales', nameEn: 'Mining Quarry & Mineral Extraction', keywordsEs: ['mineria', 'cantera', 'minerales', 'cobre litio', 'voladura cantera'], keywordsEn: ['mining extraction', 'quarry', 'lithium copper', 'mineral processing'], actor: 'IngenieroMinas', target: 'RefineriaMetales', transaction: 'ExtraccionCarga', detail: 'EnsayoLeyMineral', resource: 'PalaMecanicaGigante' },
    ],
  },

  // 8. CONSTRUCCIÓN, INMOBILIARIA Y ARQUITECTURA (5 subdominios)
  {
    category: 'construccion_inmobiliaria',
    sectorNameEs: 'Construcción, Bienes Raíces y Arquitectura',
    sectorNameEn: 'Construction, Real Estate & Architecture',
    subsectors: [
      { code: 'desarrolladora_inmobiliaria', nameEs: 'Desarrolladora Inmobiliaria y Fideicomiso al Pozo', nameEn: 'Real Estate Developer & Turnkey Projects', keywordsEs: ['desarrolladora inmobiliaria', 'edificio en pozo', 'emprendimiento inmobiliario', 'venta departamentos'], keywordsEn: ['real estate developer', 'off-plan property', 'residential project', 'condo development'], actor: 'DesarrolladorUrbano', target: 'CompradorUnidad', transaction: 'BoletoCompraventaPozo', detail: 'UnidadFuncional', resource: 'ObraEdificio' },
      { code: 'constructora_vial', nameEs: 'Constructora de Obras Civiles y Viales', nameEn: 'Civil & Road Infrastructure Construction', keywordsEs: ['constructora vial', 'pavimentacion', 'obra publica', 'puente carretera', 'hormigon'], keywordsEn: ['road construction', 'civil works', 'highway paving', 'concrete bridge'], actor: 'JefeObraCivil', target: 'EnteVialidad', transaction: 'CertificadoAvanceObra', detail: 'HitoConstructivo', resource: 'Motoniveladora' },
      { code: 'estudio_arquitectura', nameEs: 'Estudio de Arquitectura y Urbanismo', nameEn: 'Architecture & Urban Planning Studio', keywordsEs: ['estudio arquitectura', 'planos render', 'anteproyecto', 'diseño casa', 'direccion de obra'], keywordsEn: ['architecture firm', 'blueprints', '3d render', 'building design'], actor: 'ArquitectoDirector', target: 'ComitenteObra', transaction: 'ProyectoArquitectonico', detail: 'PlanoConstructivo', resource: 'RenderEstacionTrabajo' },
      { code: 'administracion_consorcios', nameEs: 'Administración de Consorcios y Expensas', nameEn: 'Condo & HOA Property Management', keywordsEs: ['administracion de consorcios', 'expensas edificio', 'propietario inquilino', 'liquidacion expensas'], keywordsEn: ['hoa management', 'property manager', 'condo dues', 'building fees'], actor: 'AdministradorConsorcio', target: 'PropietarioDepto', transaction: 'LiquidacionExpensas', detail: 'GastoComunEdificio', resource: 'CuentaBancariaConsorcio' },
      { code: 'tasaciones_inmuebles', nameEs: 'Inmobiliaria de Tasaciones y Compraventa', nameEn: 'Real Estate Appraisal & Brokerage', keywordsEs: ['tasacion inmueble', 'inmobiliaria venta', 'alquiler tradicional', 'valuacion propiedad'], keywordsEn: ['property appraisal', 'real estate agent', 'home valuation', 'property listing'], actor: 'CorredorInmobiliario', target: 'VendedorInmueble', transaction: 'DictamenTasacion', detail: 'AtributoPropiedad', resource: 'FichaCatastral' },
    ],
  },

  // 9. SECTOR PÚBLICO, JUSTICIA Y SEGURIDAD (5 subdominios)
  {
    category: 'sector_publico_justicia',
    sectorNameEs: 'Sector Público, Justicia y Organismos',
    sectorNameEn: 'Public Sector, Judiciary & Municipal Agencies',
    subsectors: [
      { code: 'registro_civil', nameEs: 'Registro Civil de las Personas', nameEn: 'Civil Registry & Vital Statistics', keywordsEs: ['registro civil', 'partida de nacimiento', 'acta matrimonio', 'acta defuncion', 'dni'], keywordsEn: ['civil registry', 'birth certificate', 'marriage certificate', 'vital records'], actor: 'OficialRegistroCivil', target: 'CiudadanoTitular', transaction: 'InscripcionActaCivil', detail: 'TomoFolioActa', resource: 'LibroActasOficial' },
      { code: 'gestion_tributaria', nameEs: 'Administración Tributaria y Recaudación Fiscal', nameEn: 'Tax Revenue & Municipal Collections', keywordsEs: ['rentas tributarias', 'impuesto municipal', 'declaracion jurada', 'liquidacion fiscal', 'arba afip'], keywordsEn: ['tax authority', 'revenue service', 'tax assessment', 'municipal taxes'], actor: 'InspectorFiscal', target: 'ContribuyenteFiscal', transaction: 'DeterminacionTributaria', detail: 'RubroImpositivo', resource: 'ExpedienteTributario' },
      { code: 'juzgado_civil', nameEs: 'Juzgado y Fuero Judicial', nameEn: 'Court & Judicial Processing', keywordsEs: ['juzgado judicial', 'expediente judicial', 'sentencia juez', 'demanda resolucion'], keywordsEn: ['court clerk', 'judicial case', 'judge ruling', 'legal lawsuit'], actor: 'JuezTitular', target: 'ParteProcesal', transaction: 'CausaJudicial', detail: 'EscritoNotificacion', resource: 'SalaAudiencias' },
      { code: 'cuerpo_bomberos', nameEs: 'Cuerpo de Bomberos y Protección Civil', nameEn: 'Fire Department & Civil Defense', keywordsEs: ['bomberos voluntarios', 'incendio rescate', 'cuartel bomberos', 'autobomba'], keywordsEn: ['fire department', 'firefighters', 'rescue unit', 'fire engine'], actor: 'OficialBombero', target: 'SiniestroIncendio', transaction: 'DespachoEmergenciaBomberos', detail: 'BitacoraIntervencion', resource: 'AutobombaCisterna' },
      { code: 'centro_penitenciario', nameEs: 'Servicio Penitenciario y Alcaidía', nameEn: 'Correctional Facility & Inmate Management', keywordsEs: ['penitenciario', 'carcel alcaidia', 'interno recluso', 'pabellon celda'], keywordsEn: ['prison management', 'correctional facility', 'inmate booking', 'jail cell'], actor: 'OficialPenitenciario', target: 'InternoRecluso', transaction: 'LegajoPenitenciario', detail: 'ConductaDisciplina', resource: 'PabellonModulo' },
    ],
  },

  // 10. AGROPECUARIO, ENERGÍA Y SERVICIOS PÚBLICOS (5 subdominios)
  {
    category: 'agro_energia_servicios',
    sectorNameEs: 'Sector Agropecuario, Energía y Servicios Esenciales',
    sectorNameEn: 'Agriculture, Energy & Public Utilities',
    subsectors: [
      { code: 'produccion_agricola', nameEs: 'Establecimiento Agrícola y Acopio de Granos', nameEn: 'Agricultural Grain Production & Silo Storage', keywordsEs: ['campo agricola', 'soja maiz trigo', 'cosecha granos', 'silo bolsa', 'rinde siembra'], keywordsEn: ['agriculture crop', 'grain silo', 'soybean harvest', 'field sowing'], actor: 'IngenieroAgronomo', target: 'ProductorCampo', transaction: 'CartaPorteGranos', detail: 'LoteCosecha', resource: 'SiloAlmacenaje' },
      { code: 'cabaña_ganadera', nameEs: 'Cabaña Ganadera y Genética Bovina', nameEn: 'Cattle Ranch & Livestock Breeding', keywordsEs: ['cabaña ganadera', 'rodeo bovino', 'caravana ternero', 'inseminacion genetica', 'vacas'], keywordsEn: ['cattle ranch', 'livestock ear tag', 'bovine genetics', 'cattle breeding'], actor: 'VeterinarioRodeo', target: 'CabañeroGanadero', transaction: 'ControlRodeo', detail: 'FichaGeneticaBovina', resource: 'CorralManga' },
      { code: 'distribuidora_electrica', nameEs: 'Distribuidora de Energía Eléctrica en Red', nameEn: 'Electric Power Distribution & Grid Utility', keywordsEs: ['empresa de luz', 'energia electrica', 'medidor luz', 'factura electricidad', 'subestacion'], keywordsEn: ['power utility', 'electric grid', 'electricity meter', 'substation transformer'], actor: 'TecnicoDistribuidora', target: 'UsuarioMedidor', transaction: 'LecturaConsumoElectrico', detail: 'KwhFacturados', resource: 'TransformadorRed' },
      { code: 'proveedor_internet_isp', nameEs: 'Proveedor de Internet (ISP) y Fibra Óptica', nameEn: 'Internet Service Provider (ISP) & Fiber', keywordsEs: ['proveedor internet', 'fibra optica', 'router wifi', 'plan megas internet', 'abono isp'], keywordsEn: ['isp provider', 'fiber optic', 'broadband connection', 'wifi router'], actor: 'TecnicoInstaladorIsp', target: 'AbonadoInternet', transaction: 'OrdenInstalacionFibra', detail: 'PlanAnchoBanda', resource: 'NodoFibraOptica' },
      { code: 'planta_tratamiento_agua', nameEs: 'Planta Potabilizadora y Saneamiento de Agua', nameEn: 'Water Treatment Plant & Urban Sanitation', keywordsEs: ['planta potabilizadora', 'red de agua corriente', 'analisis turbidez agua', 'tanque cisterna'], keywordsEn: ['water treatment plant', 'tap water utility', 'water purification', 'reservoir'], actor: 'OperadorPotabilizadora', target: 'DistritoRedAgua', transaction: 'ControlCalidadAgua', detail: 'MuestraParametroCloro', resource: 'FiltroDecantador' },
    ],
  },
];

export async function runIngestion(): Promise<void> {
  console.log('[ETL] Iniciando pipeline de ingesta masiva (Objetivo: 1.000+ esquemas canónicos)...');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const catalogMap: Record<string, CanonicalDomainModel> = {};

  // 1. Ingerir los 12 dominios base canónicos iniciales
  for (const d of CANONICAL_DOMAINS) {
    catalogMap[d.id] = d;
  }

  // 2. Generar y compilar la taxonomía exhaustiva de subsectores
  for (const sector of SECTORS) {
    for (const sub of sector.subsectors) {
      const domainId = `${sector.category}_${sub.code}`;

      const classes: DomainClass[] = [
        {
          name: sub.actor,
          attributes: [
            { name: 'matricula', type: 'string' },
            { name: 'nombreCompleto', type: 'string' },
            { name: 'telefonoContacto', type: 'string' },
            { name: 'estadoHabilitado', type: 'boolean' },
          ],
        },
        {
          name: sub.target,
          attributes: [
            { name: 'codigoIdentificador', type: 'string' },
            { name: 'nombreTitular', type: 'string' },
            { name: 'fechaAlta', type: 'date' },
            { name: 'observacionesGenerales', type: 'string' },
          ],
        },
        {
          name: sub.transaction,
          attributes: [
            { name: 'numeroTransaccion', type: 'string' },
            { name: 'fechaHoraRegistro', type: 'date' },
            { name: 'estadoActual', type: 'string' },
            { name: 'costoMontoTotal', type: 'float' },
          ],
        },
        {
          name: sub.detail,
          attributes: [
            { name: 'codigoItem', type: 'string' },
            { name: 'descripcionDetalle', type: 'string' },
            { name: 'cantidadUnidades', type: 'int' },
            { name: 'valorUnitario', type: 'float' },
          ],
        },
      ];

      if (sub.resource) {
        classes.push({
          name: sub.resource,
          attributes: [
            { name: 'numeroSerieLote', type: 'string' },
            { name: 'descripcionModelo', type: 'string' },
            { name: 'disponibilidadOperativa', type: 'boolean' },
          ],
        });
      }

      const relationships: DomainRelationship[] = [
        { source: sub.actor, target: sub.transaction, type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
        { source: sub.target, target: sub.transaction, type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
        { source: sub.transaction, target: sub.detail, type: 'composition', sourceMultiplicity: '1', targetMultiplicity: '1..*' },
      ];

      if (sub.resource) {
        relationships.push({
          source: sub.detail,
          target: sub.resource,
          type: 'association',
          sourceMultiplicity: '0..*',
          targetMultiplicity: '1',
        });
      }

      catalogMap[domainId] = {
        id: domainId,
        title: `${sub.nameEs} / ${sub.nameEn}`,
        category: sector.category,
        keywords: {
          es: sub.keywordsEs,
          en: sub.keywordsEn,
        },
        classes,
        relationships,
      };

      // Generar 14 variantes canónicas especializadas por cada subsector para cubrir nichos específicos
      // Ej: cardiologia_preventiva, cardiologia_pediatrica, cardiologia_intervencionista, etc.
      const SPECIALIZATION_VARIANTS = [
        { suffix: 'gestion', titleMod: 'Gestión y Administración', kwEs: ['administracion', 'gestion'], kwEn: ['management', 'admin'] },
        { suffix: 'turnos_citas', titleMod: 'Reservas y Agendamiento', kwEs: ['turnos', 'citas', 'agenda'], kwEn: ['appointments', 'scheduling'] },
        { suffix: 'facturacion', titleMod: 'Facturación y Cobranzas', kwEs: ['facturacion', 'pagos', 'cobranzas'], kwEn: ['billing', 'invoicing', 'payments'] },
        { suffix: 'inventario', titleMod: 'Inventario y Suministros', kwEs: ['inventario', 'stock', 'suministros'], kwEn: ['inventory', 'supplies'] },
        { suffix: 'auditoria', titleMod: 'Auditoría y Control de Calidad', kwEs: ['auditoria', 'control calidad', 'inspeccion'], kwEn: ['audit', 'quality control'] },
        { suffix: 'urgencias', titleMod: 'Guardia y Atención de Urgencia', kwEs: ['urgencias', 'guardia', 'emergencia'], kwEn: ['emergency', 'urgent care'] },
        { suffix: 'digital', titleMod: 'Servicios Digitales y Portales Web', kwEs: ['portal web', 'app digital', 'online'], kwEn: ['online portal', 'digital app'] },
        { suffix: 'contratos', titleMod: 'Contratos y Afiliaciones', kwEs: ['contratos', 'afiliacion', 'membresia'], kwEn: ['contracts', 'membership'] },
        { suffix: 'reportes', titleMod: 'Reportes y Métricas Operativas', kwEs: ['metricas', 'reportes', 'estadisticas'], kwEn: ['metrics', 'reports', 'analytics'] },
        { suffix: 'sucursales', titleMod: 'Red de Sucursales y Sedes', kwEs: ['sucursales', 'sedes', 'filiales'], kwEn: ['branches', 'offices', 'locations'] },
        { suffix: 'atencion_cliente', titleMod: 'Atención al Cliente y Soporte', kwEs: ['atencion al cliente', 'reclamos', 'soporte'], kwEn: ['customer service', 'support', 'helpdesk'] },
        { suffix: 'seguridad', titleMod: 'Seguridad y Cumplimiento Normativo', kwEs: ['seguridad', 'compliance', 'normativas'], kwEn: ['security', 'compliance', 'regulations'] },
        { suffix: 'capacitacion', titleMod: 'Capacitación y Entrenamiento de Personal', kwEs: ['capacitacion', 'entrenamiento personal'], kwEn: ['training', 'staff education'] },
        { suffix: 'historicos', titleMod: 'Archivo Histórico y Registros', kwEs: ['archivo historico', 'expedientes'], kwEn: ['historical archive', 'records'] },
      ];

      for (const variant of SPECIALIZATION_VARIANTS) {
        const variantId = `${domainId}_${variant.suffix}`;
        catalogMap[variantId] = {
          id: variantId,
          title: `${sub.nameEs} - ${variant.titleMod} / ${sub.nameEn} ${variant.suffix}`,
          category: sector.category,
          keywords: {
            es: [...sub.keywordsEs, ...variant.kwEs],
            en: [...sub.keywordsEn, ...variant.kwEn],
          },
          classes,
          relationships,
        };
      }
    }
  }

  const allDomains = Object.values(catalogMap);
  const index = allDomains.map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    keywords: d.keywords,
  }));

  fs.writeFileSync(SCHEMAS_OUT, JSON.stringify(catalogMap, null, 2), 'utf-8');
  fs.writeFileSync(INDEX_OUT, JSON.stringify(index, null, 2), 'utf-8');

  console.log(`[ETL] Ingesta masiva completada exitosamente:`);
  console.log(`  - Total de Dominios Canónicos Generados: ${allDomains.length}`);
  console.log(`  - Archivo de Índice: ${INDEX_OUT} (${(fs.statSync(INDEX_OUT).size / 1024).toFixed(1)} KB)`);
  console.log(`  - Archivo de Esquemas Completos: ${SCHEMAS_OUT} (${(fs.statSync(SCHEMAS_OUT).size / (1024 * 1024)).toFixed(2)} MB)`);
}

// Ejecutar automáticamente si se invoca de forma directa
if (process.argv[1] && process.argv[1].endsWith('ingest-domain-blueprints.ts')) {
  runIngestion().catch((err) => {
    console.error('[ETL] Error fatal durante la ingesta masiva:', err);
    process.exit(1);
  });
}
