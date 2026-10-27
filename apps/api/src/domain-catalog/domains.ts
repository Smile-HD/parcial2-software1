import type { CanonicalDomainModel } from './types.js';

export const CANONICAL_DOMAINS: CanonicalDomainModel[] = [
  {
    id: 'veterinary_clinic',
    title: 'Clínica Veterinaria / Veterinary Clinic',
    category: 'health',
    keywords: {
      es: ['veterinaria', 'mascota', 'animal', 'veterinario', 'consulta veterinaria', 'vacunacion', 'vacuna', 'perro', 'gato'],
      en: ['veterinary', 'pet', 'animal', 'vet', 'clinic', 'vaccination', 'vaccine', 'dog', 'cat'],
    },
    classes: [
      {
        name: 'Cliente',
        attributes: [
          { name: 'nombre', type: 'string' },
          { name: 'telefono', type: 'string' },
          { name: 'email', type: 'string' },
        ],
      },
      {
        name: 'Mascota',
        attributes: [
          { name: 'nombre', type: 'string' },
          { name: 'especie', type: 'string' },
          { name: 'raza', type: 'string' },
          { name: 'fechaNacimiento', type: 'date' },
        ],
      },
      {
        name: 'Veterinario',
        attributes: [
          { name: 'nombre', type: 'string' },
          { name: 'matricula', type: 'string' },
          { name: 'especialidad', type: 'string' },
        ],
      },
      {
        name: 'ConsultaVeterinaria',
        attributes: [
          { name: 'fecha', type: 'date' },
          { name: 'diagnostico', type: 'string' },
          { name: 'costoTotal', type: 'float' },
        ],
      },
      {
        name: 'Vacuna',
        attributes: [
          { name: 'nombre', type: 'string' },
          { name: 'lote', type: 'string' },
          { name: 'fechaAplicacion', type: 'date' },
        ],
      },
    ],
    relationships: [
      { source: 'Cliente', target: 'Mascota', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '1..*' },
      { source: 'Veterinario', target: 'ConsultaVeterinaria', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
      { source: 'Mascota', target: 'ConsultaVeterinaria', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
      { source: 'ConsultaVeterinaria', target: 'Vacuna', type: 'composition', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
    ],
  },
  {
    id: 'ecommerce_store',
    title: 'Comercio Electrónico / E-Commerce Store',
    category: 'commerce',
    keywords: {
      es: ['ecommerce', 'tienda', 'comercio', 'carrito', 'pedido', 'compra', 'ventas', 'productos', 'catalogo', 'tienda online'],
      en: ['ecommerce', 'shop', 'store', 'cart', 'order', 'purchase', 'sales', 'products', 'checkout', 'online store'],
    },
    classes: [
      {
        name: 'Cliente',
        attributes: [
          { name: 'nombre', type: 'string' },
          { name: 'email', type: 'string' },
          { name: 'direccionEnvio', type: 'string' },
        ],
      },
      {
        name: 'Producto',
        attributes: [
          { name: 'codigo', type: 'string' },
          { name: 'nombre', type: 'string' },
          { name: 'precio', type: 'float' },
          { name: 'stock', type: 'int' },
        ],
      },
      {
        name: 'Pedido',
        attributes: [
          { name: 'numeroPedido', type: 'string' },
          { name: 'fecha', type: 'date' },
          { name: 'estado', type: 'string' },
          { name: 'total', type: 'float' },
        ],
      },
      {
        name: 'DetallePedido',
        attributes: [
          { name: 'cantidad', type: 'int' },
          { name: 'precioUnitario', type: 'float' },
          { name: 'subtotal', type: 'float' },
        ],
      },
      {
        name: 'Pago',
        attributes: [
          { name: 'transaccionId', type: 'string' },
          { name: 'metodoPago', type: 'string' },
          { name: 'monto', type: 'float' },
          { name: 'fecha', type: 'date' },
        ],
      },
    ],
    relationships: [
      { source: 'Cliente', target: 'Pedido', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
      { source: 'Pedido', target: 'DetallePedido', type: 'composition', sourceMultiplicity: '1', targetMultiplicity: '1..*' },
      { source: 'Producto', target: 'DetallePedido', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
      { source: 'Pedido', target: 'Pago', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..1' },
    ],
  },
  {
    id: 'university_system',
    title: 'Sistema Universitario / Academic System',
    category: 'education',
    keywords: {
      es: ['universidad', 'facultad', 'estudiante', 'profesor', 'curso', 'materia', 'matricula', 'inscripcion', 'carrera', 'academico'],
      en: ['university', 'college', 'student', 'professor', 'course', 'enrollment', 'academic', 'classroom'],
    },
    classes: [
      {
        name: 'Estudiante',
        attributes: [
          { name: 'legajo', type: 'string' },
          { name: 'nombre', type: 'string' },
          { name: 'carrera', type: 'string' },
        ],
      },
      {
        name: 'Profesor',
        attributes: [
          { name: 'id', type: 'string' },
          { name: 'nombre', type: 'string' },
          { name: 'departamento', type: 'string' },
        ],
      },
      {
        name: 'Curso',
        attributes: [
          { name: 'codigo', type: 'string' },
          { name: 'nombre', type: 'string' },
          { name: 'creditos', type: 'int' },
        ],
      },
      {
        name: 'Matricula',
        attributes: [
          { name: 'fecha', type: 'date' },
          { name: 'calificacionFinal', type: 'float' },
          { name: 'estado', type: 'string' },
        ],
      },
      {
        name: 'Aula',
        attributes: [
          { name: 'numero', type: 'string' },
          { name: 'edificio', type: 'string' },
          { name: 'capacidad', type: 'int' },
        ],
      },
    ],
    relationships: [
      { source: 'Profesor', target: 'Curso', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '1..*' },
      { source: 'Estudiante', target: 'Matricula', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
      { source: 'Curso', target: 'Matricula', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
      { source: 'Curso', target: 'Aula', type: 'association', sourceMultiplicity: '0..*', targetMultiplicity: '1' },
    ],
  },
  {
    id: 'hospital_clinic',
    title: 'Hospital y Clínica Médica / Healthcare Clinic',
    category: 'health',
    keywords: {
      es: ['hospital', 'clinica', 'medico', 'paciente', 'doctor', 'salud', 'receta', 'cita', 'historia clinica', 'turno'],
      en: ['hospital', 'clinic', 'doctor', 'patient', 'health', 'prescription', 'appointment', 'medical record'],
    },
    classes: [
      {
        name: 'Paciente',
        attributes: [
          { name: 'dni', type: 'string' },
          { name: 'nombre', type: 'string' },
          { name: 'fechaNacimiento', type: 'date' },
          { name: 'grupoSanguineo', type: 'string' },
        ],
      },
      {
        name: 'Medico',
        attributes: [
          { name: 'matricula', type: 'string' },
          { name: 'nombre', type: 'string' },
          { name: 'especialidad', type: 'string' },
        ],
      },
      {
        name: 'CitaMedica',
        attributes: [
          { name: 'fecha', type: 'date' },
          { name: 'motivo', type: 'string' },
          { name: 'estado', type: 'string' },
        ],
      },
      {
        name: 'HistoriaClinica',
        attributes: [
          { name: 'numeroHistorial', type: 'string' },
          { name: 'diagnostico', type: 'string' },
          { name: 'antecedentes', type: 'string' },
        ],
      },
      {
        name: 'Receta',
        attributes: [
          { name: 'medicamento', type: 'string' },
          { name: 'dosis', type: 'string' },
          { name: 'indicaciones', type: 'string' },
        ],
      },
    ],
    relationships: [
      { source: 'Paciente', target: 'CitaMedica', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
      { source: 'Medico', target: 'CitaMedica', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
      { source: 'Paciente', target: 'HistoriaClinica', type: 'composition', sourceMultiplicity: '1', targetMultiplicity: '1' },
      { source: 'CitaMedica', target: 'Receta', type: 'composition', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
    ],
  },
  {
    id: 'banking_core',
    title: 'Sistema Bancario y Financiero / Banking Core',
    category: 'finance',
    keywords: {
      es: ['banco', 'bancario', 'cuenta', 'transaccion', 'transferencia', 'tarjeta', 'finanzas', 'saldo', 'cajero'],
      en: ['bank', 'banking', 'account', 'transaction', 'transfer', 'card', 'finance', 'balance', 'credit card'],
    },
    classes: [
      {
        name: 'Cliente',
        attributes: [
          { name: 'cuit', type: 'string' },
          { name: 'nombre', type: 'string' },
          { name: 'email', type: 'string' },
        ],
      },
      {
        name: 'CuentaBancaria',
        attributes: [
          { name: 'cbu', type: 'string' },
          { name: 'tipo', type: 'string' },
          { name: 'saldo', type: 'float' },
          { name: 'moneda', type: 'string' },
        ],
      },
      {
        name: 'Transaccion',
        attributes: [
          { name: 'id', type: 'string' },
          { name: 'fecha', type: 'date' },
          { name: 'monto', type: 'float' },
          { name: 'tipoOperacion', type: 'string' },
        ],
      },
      {
        name: 'Tarjeta',
        attributes: [
          { name: 'numero', type: 'string' },
          { name: 'tipo', type: 'string' },
          { name: 'limiteCredito', type: 'float' },
          { name: 'fechaVencimiento', type: 'date' },
        ],
      },
    ],
    relationships: [
      { source: 'Cliente', target: 'CuentaBancaria', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '1..*' },
      { source: 'CuentaBancaria', target: 'Transaccion', type: 'composition', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
      { source: 'CuentaBancaria', target: 'Tarjeta', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
    ],
  },
  {
    id: 'hotel_reservation',
    title: 'Gestión Hotelera y Reservas / Hotel & Lodging',
    category: 'hospitality',
    keywords: {
      es: ['hotel', 'hospedaje', 'reserva', 'habitacion', 'huesped', 'alojamiento', 'estancia', 'checkin', 'checkout'],
      en: ['hotel', 'lodging', 'reservation', 'room', 'guest', 'accommodation', 'booking'],
    },
    classes: [
      {
        name: 'Huesped',
        attributes: [
          { name: 'pasaporte', type: 'string' },
          { name: 'nombre', type: 'string' },
          { name: 'nacionalidad', type: 'string' },
        ],
      },
      {
        name: 'Habitacion',
        attributes: [
          { name: 'numero', type: 'int' },
          { name: 'tipo', type: 'string' },
          { name: 'precioNoche', type: 'float' },
          { name: 'disponible', type: 'boolean' },
        ],
      },
      {
        name: 'Reserva',
        attributes: [
          { name: 'codigo', type: 'string' },
          { name: 'fechaIngreso', type: 'date' },
          { name: 'fechaSalida', type: 'date' },
          { name: 'estado', type: 'string' },
        ],
      },
      {
        name: 'FacturaHotel',
        attributes: [
          { name: 'numeroFactura', type: 'string' },
          { name: 'montoTotal', type: 'float' },
          { name: 'fechaEmision', type: 'date' },
        ],
      },
    ],
    relationships: [
      { source: 'Huesped', target: 'Reserva', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
      { source: 'Habitacion', target: 'Reserva', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
      { source: 'Reserva', target: 'FacturaHotel', type: 'composition', sourceMultiplicity: '1', targetMultiplicity: '1' },
    ],
  },
  {
    id: 'logistics_shipping',
    title: 'Logística y Envíos / Logistics & Shipping',
    category: 'logistics',
    keywords: {
      es: ['logistica', 'envio', 'paquete', 'transporte', 'ruta', 'camion', 'vehiculo', 'entrega', 'despacho'],
      en: ['logistics', 'shipping', 'package', 'parcel', 'transport', 'route', 'vehicle', 'delivery'],
    },
    classes: [
      {
        name: 'Remitente',
        attributes: [
          { name: 'nombre', type: 'string' },
          { name: 'direccion', type: 'string' },
        ],
      },
      {
        name: 'Destinatario',
        attributes: [
          { name: 'nombre', type: 'string' },
          { name: 'direccionEntrega', type: 'string' },
          { name: 'telefono', type: 'string' },
        ],
      },
      {
        name: 'Paquete',
        attributes: [
          { name: 'numeroGuia', type: 'string' },
          { name: 'peso', type: 'float' },
          { name: 'dimensiones', type: 'string' },
          { name: 'estado', type: 'string' },
        ],
      },
      {
        name: 'Vehiculo',
        attributes: [
          { name: 'patente', type: 'string' },
          { name: 'modelo', type: 'string' },
          { name: 'capacidadCarga', type: 'float' },
        ],
      },
      {
        name: 'Ruta',
        attributes: [
          { name: 'origen', type: 'string' },
          { name: 'destino', type: 'string' },
          { name: 'distanciaKm', type: 'float' },
        ],
      },
    ],
    relationships: [
      { source: 'Remitente', target: 'Paquete', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '1..*' },
      { source: 'Destinatario', target: 'Paquete', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '1..*' },
      { source: 'Vehiculo', target: 'Ruta', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '1..*' },
      { source: 'Paquete', target: 'Ruta', type: 'association', sourceMultiplicity: '0..*', targetMultiplicity: '1' },
    ],
  },
  {
    id: 'library_system',
    title: 'Biblioteca y Préstamos / Library System',
    category: 'education',
    keywords: {
      es: ['biblioteca', 'libro', 'prestamo', 'lector', 'editorial', 'autor', 'ejemplar', 'devolucion', 'multa'],
      en: ['library', 'book', 'loan', 'reader', 'author', 'copy', 'fine'],
    },
    classes: [
      {
        name: 'Lector',
        attributes: [
          { name: 'numeroSocio', type: 'string' },
          { name: 'nombre', type: 'string' },
          { name: 'email', type: 'string' },
        ],
      },
      {
        name: 'Libro',
        attributes: [
          { name: 'isbn', type: 'string' },
          { name: 'titulo', type: 'string' },
          { name: 'autor', type: 'string' },
          { name: 'genero', type: 'string' },
        ],
      },
      {
        name: 'Ejemplar',
        attributes: [
          { name: 'codigoBarras', type: 'string' },
          { name: 'estado', type: 'string' },
          { name: 'ubicacionEstante', type: 'string' },
        ],
      },
      {
        name: 'Prestamo',
        attributes: [
          { name: 'fechaInicio', type: 'date' },
          { name: 'fechaLimite', type: 'date' },
          { name: 'fechaDevolucion', type: 'date' },
        ],
      },
    ],
    relationships: [
      { source: 'Libro', target: 'Ejemplar', type: 'composition', sourceMultiplicity: '1', targetMultiplicity: '1..*' },
      { source: 'Lector', target: 'Prestamo', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
      { source: 'Ejemplar', target: 'Prestamo', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
    ],
  },
  {
    id: 'airline_flights',
    title: 'Aerolíneas y Vuelos / Airline & Flights',
    category: 'logistics',
    keywords: {
      es: ['aerolinea', 'vuelo', 'avion', 'aeropuerto', 'pasajero', 'boleto', 'reserva vuelo', 'pasaje', 'escala'],
      en: ['airline', 'flight', 'airplane', 'airport', 'passenger', 'ticket', 'boarding'],
    },
    classes: [
      {
        name: 'Pasajero',
        attributes: [
          { name: 'pasaporte', type: 'string' },
          { name: 'nombre', type: 'string' },
          { name: 'nacionalidad', type: 'string' },
        ],
      },
      {
        name: 'Vuelo',
        attributes: [
          { name: 'numeroVuelo', type: 'string' },
          { name: 'horaSalida', type: 'date' },
          { name: 'horaLlegada', type: 'date' },
          { name: 'estado', type: 'string' },
        ],
      },
      {
        name: 'Aeropuerto',
        attributes: [
          { name: 'codigoIATA', type: 'string' },
          { name: 'nombre', type: 'string' },
          { name: 'ciudad', type: 'string' },
        ],
      },
      {
        name: 'Boleto',
        attributes: [
          { name: 'asiento', type: 'string' },
          { name: 'clase', type: 'string' },
          { name: 'precio', type: 'float' },
        ],
      },
    ],
    relationships: [
      { source: 'Pasajero', target: 'Boleto', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '1..*' },
      { source: 'Vuelo', target: 'Boleto', type: 'composition', sourceMultiplicity: '1', targetMultiplicity: '1..*' },
      { source: 'Vuelo', target: 'Aeropuerto', type: 'association', sourceMultiplicity: '0..*', targetMultiplicity: '1', label: 'origen' },
      { source: 'Vuelo', target: 'Aeropuerto', type: 'association', sourceMultiplicity: '0..*', targetMultiplicity: '1', label: 'destino' },
    ],
  },
  {
    id: 'restaurant_pos',
    title: 'Restaurante y Punto de Venta / Restaurant POS',
    category: 'hospitality',
    keywords: {
      es: ['restaurante', 'bar', 'mozo', 'mesa', 'comanda', 'plato', 'menu', 'pedido restaurante', 'cuenta'],
      en: ['restaurant', 'bar', 'waiter', 'table', 'order', 'dish', 'menu', 'bill'],
    },
    classes: [
      {
        name: 'Mesa',
        attributes: [
          { name: 'numero', type: 'int' },
          { name: 'capacidad', type: 'int' },
          { name: 'estado', type: 'string' },
        ],
      },
      {
        name: 'Mozo',
        attributes: [
          { name: 'legajo', type: 'string' },
          { name: 'nombre', type: 'string' },
        ],
      },
      {
        name: 'Plato',
        attributes: [
          { name: 'nombre', type: 'string' },
          { name: 'categoria', type: 'string' },
          { name: 'precio', type: 'float' },
        ],
      },
      {
        name: 'Comanda',
        attributes: [
          { name: 'codigo', type: 'string' },
          { name: 'horaApertura', type: 'date' },
          { name: 'total', type: 'float' },
        ],
      },
      {
        name: 'ItemComanda',
        attributes: [
          { name: 'cantidad', type: 'int' },
          { name: 'observaciones', type: 'string' },
          { name: 'subtotal', type: 'float' },
        ],
      },
    ],
    relationships: [
      { source: 'Mozo', target: 'Comanda', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
      { source: 'Mesa', target: 'Comanda', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
      { source: 'Comanda', target: 'ItemComanda', type: 'composition', sourceMultiplicity: '1', targetMultiplicity: '1..*' },
      { source: 'Plato', target: 'ItemComanda', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
    ],
  },
  {
    id: 'gym_fitness',
    title: 'Gimnasio y Membresías / Gym & Fitness',
    category: 'health',
    keywords: {
      es: ['gimnasio', 'gym', 'socio', 'entrenador', 'membresia', 'rutina', 'ejercicio', 'cuota'],
      en: ['gym', 'fitness', 'member', 'trainer', 'membership', 'workout', 'exercise'],
    },
    classes: [
      {
        name: 'Socio',
        attributes: [
          { name: 'dni', type: 'string' },
          { name: 'nombre', type: 'string' },
          { name: 'fechaAlta', type: 'date' },
        ],
      },
      {
        name: 'Entrenador',
        attributes: [
          { name: 'nombre', type: 'string' },
          { name: 'especialidad', type: 'string' },
        ],
      },
      {
        name: 'Membresia',
        attributes: [
          { name: 'tipo', type: 'string' },
          { name: 'precioMensual', type: 'float' },
          { name: 'accesoTotal', type: 'boolean' },
        ],
      },
      {
        name: 'Rutina',
        attributes: [
          { name: 'objetivo', type: 'string' },
          { name: 'nivel', type: 'string' },
          { name: 'diasPorSemana', type: 'int' },
        ],
      },
    ],
    relationships: [
      { source: 'Socio', target: 'Membresia', type: 'association', sourceMultiplicity: '1..*', targetMultiplicity: '1' },
      { source: 'Entrenador', target: 'Rutina', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
      { source: 'Socio', target: 'Rutina', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
    ],
  },
  {
    id: 'real_estate',
    title: 'Inmobiliaria y Alquileres / Real Estate',
    category: 'commerce',
    keywords: {
      es: ['inmobiliaria', 'inmueble', 'propiedad', 'alquiler', 'propietario', 'inquilino', 'contrato', 'departamento', 'casa'],
      en: ['real estate', 'property', 'rental', 'landlord', 'tenant', 'lease', 'apartment', 'house'],
    },
    classes: [
      {
        name: 'Propietario',
        attributes: [
          { name: 'nombre', type: 'string' },
          { name: 'telefono', type: 'string' },
        ],
      },
      {
        name: 'Inquilino',
        attributes: [
          { name: 'nombre', type: 'string' },
          { name: 'dni', type: 'string' },
          { name: 'reciboSueldo', type: 'string' },
        ],
      },
      {
        name: 'Inmueble',
        attributes: [
          { name: 'direccion', type: 'string' },
          { name: 'tipo', type: 'string' },
          { name: 'ambientes', type: 'int' },
          { name: 'precio', type: 'float' },
        ],
      },
      {
        name: 'ContratoAlquiler',
        attributes: [
          { name: 'fechaInicio', type: 'date' },
          { name: 'fechaFin', type: 'date' },
          { name: 'montoMensual', type: 'float' },
          { name: 'depositoGarantia', type: 'float' },
        ],
      },
    ],
    relationships: [
      { source: 'Propietario', target: 'Inmueble', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '1..*' },
      { source: 'Inmueble', target: 'ContratoAlquiler', type: 'composition', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
      { source: 'Inquilino', target: 'ContratoAlquiler', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
    ],
  },
];
