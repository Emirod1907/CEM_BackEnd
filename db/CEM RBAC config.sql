use CEM;
select * from personas;

INSERT INTO roles (nombre) VALUES 
('cliente'),
('organizador'),
('admin');


INSERT INTO permisos (nombre) VALUES 
('crear_evento'),
('editar_evento_propio'),
('eliminar_evento_propio'),
('crear_bodega'),
('editar_bodega_propia'),
('eliminar_bodega_propia'),
('leer_eventos'),
('comprar_entradas');

-- Asignar permisos a roles
-- Organizador
INSERT INTO permisos_roles (rol_id, permiso_id) VALUES 
(2,1),(2,2),(2,3),(2,4),(2,5),(2,6),(2,7);


-- Cliente
INSERT INTO permisos_roles (rol_id, permiso_id) VALUES 
(1,7),(1,8);

-- Admin (todos los permisos)