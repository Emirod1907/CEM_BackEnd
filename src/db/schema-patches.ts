import type { Connection } from 'mysql2/promise';

type SqlParams = Array<string | number | null>;

const countRows = async (connection: Connection, sql: string, params: SqlParams = []): Promise<number> => {
  const [rows] = await connection.query(sql, params);
  const first = Array.isArray(rows) ? rows[0] as { total?: number } | undefined : undefined;
  return Number(first?.total ?? 0);
};

const tableExists = async (connection: Connection, tableName: string): Promise<boolean> => {
  const total = await countRows(connection, `
    SELECT COUNT(*) AS total
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
  `, [tableName]);

  return total > 0;
};

const columnExists = async (connection: Connection, tableName: string, columnName: string): Promise<boolean> => {
  const total = await countRows(connection, `
    SELECT COUNT(*) AS total
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
  `, [tableName, columnName]);

  return total > 0;
};

const constraintExists = async (connection: Connection, tableName: string, constraintName: string): Promise<boolean> => {
  const total = await countRows(connection, `
    SELECT COUNT(*) AS total
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND CONSTRAINT_NAME = ?
  `, [tableName, constraintName]);

  return total > 0;
};

const referencedForeignKeyExists = async (
  connection: Connection,
  tableName: string,
  columnName: string,
  referencedTableName: string,
  referencedColumnName: string,
): Promise<boolean> => {
  const total = await countRows(connection, `
    SELECT COUNT(*) AS total
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
      AND REFERENCED_TABLE_NAME = ?
      AND REFERENCED_COLUMN_NAME = ?
  `, [tableName, columnName, referencedTableName, referencedColumnName]);

  return total > 0;
};

const getForeignKeysForColumn = async (
  connection: Connection,
  tableName: string,
  columnName: string,
): Promise<string[]> => {
  const [rows] = await connection.query(`
    SELECT DISTINCT CONSTRAINT_NAME AS constraintName
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `, [tableName, columnName]);

  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => (row as { constraintName?: string }).constraintName)
    .filter((value): value is string => Boolean(value));
};

const logPatch = (message: string) => {
  console.log(`[DB][patch] ${message}`);
};

const runIfTableExists = async (
  connection: Connection,
  tableName: string,
  sql: string,
  label: string,
): Promise<void> => {
  if (!(await tableExists(connection, tableName))) return;
  await connection.query(sql);
  logPatch(label);
};

const renameTableIfOnlyLegacyExists = async (
  connection: Connection,
  legacyName: string,
  targetName: string,
): Promise<void> => {
  const hasLegacy = await tableExists(connection, legacyName);
  const hasTarget = await tableExists(connection, targetName);

  if (hasLegacy && !hasTarget) {
    await connection.query(`RENAME TABLE \`${legacyName}\` TO \`${targetName}\``);
    logPatch(`Tabla ${legacyName} renombrada a ${targetName}`);
  }
};

const addColumnIfMissing = async (
  connection: Connection,
  tableName: string,
  columnName: string,
  definition: string,
): Promise<void> => {
  if (!(await tableExists(connection, tableName))) return;
  if (await columnExists(connection, tableName, columnName)) return;

  await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${definition}`);
  logPatch(`${tableName}.${columnName} agregada`);
};

const modifyColumnIfExists = async (
  connection: Connection,
  tableName: string,
  columnName: string,
  definition: string,
): Promise<void> => {
  if (!(await tableExists(connection, tableName))) return;
  if (!(await columnExists(connection, tableName, columnName))) return;

  await connection.query(`ALTER TABLE \`${tableName}\` MODIFY COLUMN ${definition}`);
  logPatch(`${tableName}.${columnName} normalizada`);
};

const renameColumnIfNeeded = async (
  connection: Connection,
  tableName: string,
  legacyColumn: string,
  targetColumn: string,
  targetDefinition: string,
): Promise<void> => {
  if (!(await tableExists(connection, tableName))) return;
  const hasLegacy = await columnExists(connection, tableName, legacyColumn);
  const hasTarget = await columnExists(connection, tableName, targetColumn);

  if (hasLegacy && !hasTarget) {
    await connection.query(`ALTER TABLE \`${tableName}\` CHANGE COLUMN \`${legacyColumn}\` \`${targetColumn}\` ${targetDefinition}`);
    logPatch(`${tableName}.${legacyColumn} renombrada a ${targetColumn}`);
  }
};

const dropForeignKeysForColumn = async (
  connection: Connection,
  tableName: string,
  columnName: string,
): Promise<void> => {
  if (!(await tableExists(connection, tableName))) return;
  if (!(await columnExists(connection, tableName, columnName))) return;

  const fks = await getForeignKeysForColumn(connection, tableName, columnName);
  for (const fk of fks) {
    await connection.query(`ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${fk}\``);
    logPatch(`FK ${fk} eliminada de ${tableName}.${columnName}`);
  }
};

const addForeignKeyIfMissing = async (
  connection: Connection,
  tableName: string,
  columnName: string,
  constraintName: string,
  referencedTableName: string,
  referencedColumnName: string,
  onUpdate = 'CASCADE',
  onDelete = 'RESTRICT',
): Promise<void> => {
  if (!(await tableExists(connection, tableName))) return;
  if (!(await tableExists(connection, referencedTableName))) return;
  if (!(await columnExists(connection, tableName, columnName))) return;
  if (!(await columnExists(connection, referencedTableName, referencedColumnName))) return;
  if (await constraintExists(connection, tableName, constraintName)) return;
  if (await referencedForeignKeyExists(connection, tableName, columnName, referencedTableName, referencedColumnName)) return;

  await connection.query(`
    ALTER TABLE \`${tableName}\`
    ADD CONSTRAINT \`${constraintName}\`
    FOREIGN KEY (\`${columnName}\`) REFERENCES \`${referencedTableName}\` (\`${referencedColumnName}\`)
    ON UPDATE ${onUpdate} ON DELETE ${onDelete}
  `);
  logPatch(`FK ${constraintName} agregada`);
};

const addIndexIfMissing = async (
  connection: Connection,
  tableName: string,
  indexName: string,
  definition: string,
): Promise<void> => {
  if (!(await tableExists(connection, tableName))) return;

  const total = await countRows(connection, `
    SELECT COUNT(*) AS total
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND INDEX_NAME = ?
  `, [tableName, indexName]);

  if (total > 0) return;

  await connection.query(`ALTER TABLE \`${tableName}\` ADD ${definition}`);
  logPatch(`Índice ${indexName} agregado en ${tableName}`);
};

const renameLegacyTables = async (connection: Connection): Promise<void> => {
  await renameTableIfOnlyLegacyExists(connection, 'personas', 'Personas');
  await renameTableIfOnlyLegacyExists(connection, 'roles', 'Roles');
  await renameTableIfOnlyLegacyExists(connection, 'permisos', 'Permisos');
  await renameTableIfOnlyLegacyExists(connection, 'salones', 'Salones');
  await renameTableIfOnlyLegacyExists(connection, 'eventos', 'Eventos');
};

const normalizeBodegaToSalon = async (connection: Connection): Promise<void> => {
  await dropForeignKeysForColumn(connection, 'reservas', 'bodega_id');
  await dropForeignKeysForColumn(connection, 'Eventos', 'bodega_id');

  await renameColumnIfNeeded(connection, 'Salones', 'id_bodega', 'id_salon', 'INT NOT NULL AUTO_INCREMENT');
  await renameColumnIfNeeded(connection, 'reservas', 'bodega_id', 'salon_id', 'INT NOT NULL');
  await renameColumnIfNeeded(connection, 'Eventos', 'bodega_id', 'salon_id', 'INT NOT NULL');

  await addForeignKeyIfMissing(connection, 'reservas', 'salon_id', 'fk_reservas_salon', 'Salones', 'id_salon');
  await addForeignKeyIfMissing(connection, 'Eventos', 'salon_id', 'fk_eventos_salon', 'Salones', 'id_salon');
};

export const applyPreMigrationSchemaPatches = async (connection: Connection): Promise<void> => {
  await renameLegacyTables(connection);
  await normalizeBodegaToSalon(connection);
};

export const applyPostMigrationSchemaPatches = async (connection: Connection): Promise<void> => {
  await addColumnIfMissing(connection, 'invitaciones', 'telefono', 'telefono VARCHAR(30) NULL');
  await addColumnIfMissing(connection, 'invitaciones', 'num_invitados', 'num_invitados INT NOT NULL DEFAULT 1');
  await addColumnIfMissing(connection, 'invitaciones', 'accedida_en', 'accedida_en DATETIME NULL');
  await addColumnIfMissing(connection, 'invitaciones', 'persona_id', 'persona_id INT NULL');

  await addColumnIfMissing(connection, 'Personas', 'rol_id', 'rol_id INT NULL');
  await addColumnIfMissing(connection, 'Personas', 'perfil_completado', 'perfil_completado TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing(connection, 'Personas', 'categoria_servicio', 'categoria_servicio TEXT NULL');
  await addColumnIfMissing(connection, 'Personas', 'google_calendar_token', 'google_calendar_token TEXT NULL');
  await addColumnIfMissing(connection, 'Personas', 'google_calendar_id', 'google_calendar_id VARCHAR(255) NULL');
  // MercadoPago Marketplace (vendedor): tokens cifrados + collector_id
  await addColumnIfMissing(connection, 'Personas', 'mp_access_token', 'mp_access_token TEXT NULL');
  await addColumnIfMissing(connection, 'Personas', 'mp_refresh_token', 'mp_refresh_token TEXT NULL');
  await addColumnIfMissing(connection, 'Personas', 'mp_user_id', 'mp_user_id VARCHAR(50) NULL');
  await addForeignKeyIfMissing(connection, 'Personas', 'rol_id', 'fk_personas_rol', 'Roles', 'id_rol', 'CASCADE', 'SET NULL');

  await addColumnIfMissing(connection, 'Ordenes', 'tipo', "tipo ENUM('cliente','organizador') NOT NULL DEFAULT 'cliente'");
  await addColumnIfMissing(connection, 'Ordenes', 'reserva_id', 'reserva_id INT NULL');
  await addColumnIfMissing(connection, 'Ordenes', 'tipo_pago', "tipo_pago ENUM('seña','total') NULL");

  await addColumnIfMissing(connection, 'Contratos', 'comision_proveedor_porcentaje', 'comision_proveedor_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 3');
  await addColumnIfMissing(connection, 'Contratos', 'ambito', "ambito ENUM('salon','proveedor') NOT NULL DEFAULT 'salon'");
  // Ampliar el enum de ámbito para incluir 'consumidor' (aceptación de T&C en checkout)
  await modifyColumnIfExists(connection, 'Contratos', 'ambito', "ambito ENUM('salon','proveedor','consumidor') NOT NULL DEFAULT 'salon'");
  await renameColumnIfNeeded(connection, 'Contratos', 'comision_porcentaje', 'comision_cliente_porcentaje', 'DECIMAL(5,2) NOT NULL');

  await addColumnIfMissing(connection, 'reservas', 'estado', "estado ENUM('pendiente_pago','seña_abonada','confirmada','cancelada') NOT NULL DEFAULT 'confirmada'");
  await addColumnIfMissing(connection, 'reservas', 'datos_evento', 'datos_evento LONGTEXT NULL');
  await addColumnIfMissing(connection, 'reservas', 'monto_alquiler', 'monto_alquiler DECIMAL(10,2) NOT NULL DEFAULT 0');
  await addColumnIfMissing(connection, 'reservas', 'fecha_limite_pago', 'fecha_limite_pago DATETIME NULL');
  await modifyColumnIfExists(connection, 'reservas', 'evento_id', 'evento_id INT NULL');

  await addColumnIfMissing(connection, 'Facturas', 'orden_id', 'orden_id INT NOT NULL DEFAULT 0');
  await addForeignKeyIfMissing(connection, 'Facturas', 'orden_id', 'fk_facturas_orden', 'Ordenes', 'id_orden', 'CASCADE', 'RESTRICT');

  await modifyColumnIfExists(connection, 'Eventos', 'descripcion', 'descripcion TEXT NOT NULL');
  await addColumnIfMissing(connection, 'Eventos', 'estado', "estado ENUM('borrador','activo','cancelado') NOT NULL DEFAULT 'activo'");
  await addColumnIfMissing(connection, 'Eventos', 'es_publico', 'es_publico TINYINT(1) NOT NULL DEFAULT 1');
  await runIfTableExists(connection, 'Eventos', `
    UPDATE Eventos e
    INNER JOIN reservas r ON r.evento_id = e.id_evento
    SET e.es_publico = 0
    WHERE r.datos_evento LIKE '%"es_publico":false%'
      AND e.es_publico = 1
  `, 'Eventos privados retroactivos actualizados');

  await addColumnIfMissing(connection, 'Salones', 'precio_alquiler', 'precio_alquiler DECIMAL(10,2) NULL');
  await addColumnIfMissing(connection, 'Salones', 'servicios_incluidos', 'servicios_incluidos TEXT NULL');
  await addColumnIfMissing(connection, 'Salones', 'tipos_evento', 'tipos_evento TEXT NULL');
  await addColumnIfMissing(connection, 'Salones', 'dueno_id', 'dueno_id INT NULL');
  await addColumnIfMissing(connection, 'Salones', 'precios_config', 'precios_config TEXT NULL');
  await addColumnIfMissing(connection, 'Salones', 'tipo_salon', 'tipo_salon VARCHAR(30) NULL');
  await addColumnIfMissing(connection, 'Salones', 'departamento', 'departamento VARCHAR(255) NULL');
  await addColumnIfMissing(connection, 'Salones', 'localidad', 'localidad VARCHAR(255) NULL');
  await addColumnIfMissing(connection, 'Salones', 'provincia', 'provincia VARCHAR(255) NULL');

  await modifyColumnIfExists(connection, 'ServiciosAdicionales', 'categoria', "categoria ENUM('catering','decoracion','audio_video','seguridad','mobiliario','entretenimiento','personal','tortas','bebidas','comida','alimentos','cotillon','vajilla','otro') NOT NULL DEFAULT 'otro'");
  await addColumnIfMissing(connection, 'ServiciosAdicionales', 'tipo_precio', "tipo_precio ENUM('fijo','por_persona','por_hora','por_turno') NOT NULL DEFAULT 'fijo'");
  await addColumnIfMissing(connection, 'ServiciosAdicionales', 'imagen', 'imagen VARCHAR(255) NULL');
  await addColumnIfMissing(connection, 'ServiciosAdicionales', 'disponible', 'disponible TINYINT(1) NOT NULL DEFAULT 1');
  await addColumnIfMissing(connection, 'ServiciosAdicionales', 'proveedor_id', 'proveedor_id INT NULL');
  await addColumnIfMissing(connection, 'ServiciosAdicionales', 'capacidad_maxima', 'capacidad_maxima INT NULL');
  await addColumnIfMissing(connection, 'ServiciosAdicionales', 'dias_anticipacion', 'dias_anticipacion INT NOT NULL DEFAULT 0');
  await addColumnIfMissing(connection, 'ServiciosAdicionales', 'tipo_item', "tipo_item ENUM('producto','servicio') NOT NULL DEFAULT 'producto'");
  await addColumnIfMissing(connection, 'ServiciosAdicionales', 'precio_base', 'precio_base DECIMAL(10,2) NULL');
  await addColumnIfMissing(connection, 'ServiciosAdicionales', 'dias_disponibles', 'dias_disponibles TEXT NULL');
  await addColumnIfMissing(connection, 'ServiciosAdicionales', 'horario_inicio', 'horario_inicio VARCHAR(5) NULL');
  await addColumnIfMissing(connection, 'ServiciosAdicionales', 'horario_fin', 'horario_fin VARCHAR(5) NULL');
  await addColumnIfMissing(connection, 'ServiciosAdicionales', 'precios_tramos', 'precios_tramos TEXT NULL');
  await addColumnIfMissing(connection, 'ServiciosAdicionales', 'descuento_cantidad_min', 'descuento_cantidad_min INT NULL');
  await addColumnIfMissing(connection, 'ServiciosAdicionales', 'descuento_porcentaje', 'descuento_porcentaje DECIMAL(5,2) NULL');
  await addColumnIfMissing(connection, 'ServiciosAdicionales', 'subcategoria', 'subcategoria VARCHAR(30) NULL');
  await addForeignKeyIfMissing(connection, 'ServiciosAdicionales', 'proveedor_id', 'fk_servicios_proveedor', 'Personas', 'id_persona', 'CASCADE', 'SET NULL');
  await runIfTableExists(connection, 'ServiciosAdicionales', "UPDATE ServiciosAdicionales SET categoria='alimentos' WHERE categoria='comida'", 'ServiciosAdicionales categoría comida migrada a alimentos');
  await runIfTableExists(connection, 'ServiciosAdicionales', "UPDATE ServiciosAdicionales SET tipo_item='servicio' WHERE categoria IN ('decoracion','audio_video','seguridad','personal','mobiliario','entretenimiento','tortas')", 'ServiciosAdicionales tipo_item servicios alineado');
  await runIfTableExists(connection, 'ServiciosAdicionales', "UPDATE ServiciosAdicionales SET tipo_item='producto' WHERE categoria IN ('bebidas','comida','alimentos','catering','cotillon','vajilla')", 'ServiciosAdicionales tipo_item productos alineado');

  await addColumnIfMissing(connection, 'agenda_proveedor', 'motivo_cancelacion', 'motivo_cancelacion TEXT NULL');
  await addColumnIfMissing(connection, 'agenda_proveedor', 'detalle_pedido', 'detalle_pedido TEXT NULL');
  await addColumnIfMissing(connection, 'agenda_proveedor', 'monto_total', 'monto_total DECIMAL(10,2) NULL');
  await addColumnIfMissing(connection, 'agenda_proveedor', 'estado_pago', "estado_pago ENUM('sin_pago','seña_abonada','pagado_total','cancelado') NOT NULL DEFAULT 'sin_pago'");
  await addColumnIfMissing(connection, 'agenda_proveedor', 'fecha_limite', 'fecha_limite DATE NULL');
  await addColumnIfMissing(connection, 'agenda_proveedor', 'domicilio', 'domicilio TEXT NULL');

  await addIndexIfMissing(connection, 'OrdenDesglose', 'idx_desglose_estado', 'INDEX idx_desglose_estado (estado_liquidacion)');
  await addIndexIfMissing(connection, 'OrdenDesglose', 'idx_desglose_reserva', 'INDEX idx_desglose_reserva (reserva_id)');
  await addIndexIfMissing(connection, 'Facturas', 'idx_factura_orden', 'INDEX idx_factura_orden (orden_id)');
  await addIndexIfMissing(connection, 'Facturas', 'idx_factura_estado', 'INDEX idx_factura_estado (estado)');
};
