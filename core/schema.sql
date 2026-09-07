-- Esquema de la base de datos de conciliación de compras de crudo.
-- SQLite, un solo archivo local (data/conciliacion.db).

CREATE TABLE IF NOT EXISTS entregas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    proveedor TEXT NOT NULL,
    contrato_oc TEXT,
    remito TEXT,
    producto TEXT NOT NULL,
    volumen REAL NOT NULL,
    unidad_volumen TEXT NOT NULL DEFAULT 'm3',
    punto_entrega TEXT,
    periodo_contable TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'Recibida sin facturar',
    creado_por TEXT,
    creado_en TEXT,
    modificado_por TEXT,
    modificado_en TEXT
);

-- Los precios nunca se pisan: cada carga es una fila nueva (historial completo).
CREATE TABLE IF NOT EXISTS precios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    periodo TEXT NOT NULL,
    producto TEXT NOT NULL,
    proveedor TEXT NOT NULL,
    precio REAL NOT NULL,
    moneda TEXT NOT NULL DEFAULT 'USD',
    tipo TEXT NOT NULL CHECK (tipo IN ('estimado', 'final')),
    fuente TEXT,
    fecha_carga TEXT NOT NULL,
    creado_por TEXT
);

CREATE TABLE IF NOT EXISTS documentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK (tipo IN ('FACTURA', 'ND', 'NC')),
    numero TEXT NOT NULL,
    fecha TEXT NOT NULL,
    proveedor TEXT NOT NULL,
    neto_sin_iva REAL NOT NULL,
    moneda TEXT NOT NULL DEFAULT 'USD',
    tipo_cambio REAL,
    volumen_facturado REAL,
    precio_unitario REAL,
    referencia TEXT,
    origen TEXT NOT NULL DEFAULT 'manual',
    creado_por TEXT,
    creado_en TEXT
);

-- Tabla puente muchos a muchos entre entregas y documentos.
CREATE TABLE IF NOT EXISTS imputaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrega_id INTEGER NOT NULL REFERENCES entregas(id),
    documento_id INTEGER NOT NULL REFERENCES documentos(id),
    monto_imputado REAL NOT NULL,
    volumen_imputado REAL,
    metodo TEXT NOT NULL DEFAULT 'manual' CHECK (metodo IN ('exacto', 'aproximado', 'manual')),
    confianza REAL,
    creado_por TEXT,
    creado_en TEXT
);

CREATE TABLE IF NOT EXISTS cierres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    periodo TEXT NOT NULL UNIQUE,
    fecha_cierre TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    cerrado_por TEXT
);

-- Cuando un precio pasa de estimado a final DESPUÉS de cerrado el período,
-- el ajuste no toca el período cerrado: se registra como movimiento del mes corriente.
CREATE TABLE IF NOT EXISTS ajustes_posteriores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrega_id INTEGER NOT NULL REFERENCES entregas(id),
    periodo_original TEXT NOT NULL,
    periodo_ajuste TEXT NOT NULL,
    delta_ajuste REAL NOT NULL,
    motivo TEXT,
    fecha TEXT NOT NULL
);

-- Tipo de cambio de referencia por período, usado para separar delta de
-- precio del delta de tipo de cambio cuando la factura viene en otra moneda.
CREATE TABLE IF NOT EXISTS tipos_cambio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    periodo TEXT NOT NULL,
    moneda TEXT NOT NULL DEFAULT 'ARS',
    tasa REAL NOT NULL,
    fecha_carga TEXT NOT NULL,
    UNIQUE(periodo, moneda)
);

CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT
);

CREATE TABLE IF NOT EXISTS tolerancias_proveedor (
    proveedor TEXT PRIMARY KEY,
    tolerancia REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS sap_mapeos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    mapeo_json TEXT NOT NULL,
    fecha_carga TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auditoria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    usuario TEXT,
    tabla TEXT NOT NULL,
    registro_id INTEGER,
    accion TEXT NOT NULL,
    detalle TEXT
);

CREATE INDEX IF NOT EXISTS idx_entregas_periodo ON entregas(periodo_contable);
CREATE INDEX IF NOT EXISTS idx_entregas_proveedor ON entregas(proveedor);
CREATE INDEX IF NOT EXISTS idx_precios_busqueda ON precios(periodo, producto, proveedor);
CREATE INDEX IF NOT EXISTS idx_documentos_proveedor ON documentos(proveedor);
CREATE INDEX IF NOT EXISTS idx_imputaciones_entrega ON imputaciones(entrega_id);
CREATE INDEX IF NOT EXISTS idx_imputaciones_documento ON imputaciones(documento_id);
