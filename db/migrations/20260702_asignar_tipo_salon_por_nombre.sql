-- Asigna tipo_salon a los salones que no lo tienen, deduciéndolo del nombre.
-- Útil para salones cargados antes de que existiera la columna tipo_salon.
UPDATE Salones
SET tipo_salon = CASE
    WHEN LOWER(nombre) LIKE '%bodega%'   THEN 'Bodega'
    WHEN LOWER(nombre) LIKE '%quincho%'  THEN 'Quincho'
    WHEN LOWER(nombre) LIKE '%quinta%'   THEN 'Quinta'
    WHEN LOWER(nombre) LIKE '%finca%'    THEN 'Finca'
    WHEN LOWER(nombre) LIKE '%terraza%'  THEN 'Terraza'
    WHEN LOWER(nombre) LIKE '%pelotero%' THEN 'Pelotero'
    WHEN LOWER(nombre) LIKE '%salon%' OR LOWER(nombre) LIKE '%salón%' THEN 'Salón'
    ELSE tipo_salon
END
WHERE tipo_salon IS NULL;
