USE CEM;
CREATE TABLE roles(
id_rol INT PRIMARY KEY AUTO_INCREMENT,
nombre VARCHAR (20) NOT NULL UNIQUE);

CREATE TABLE permisos(
id_permiso INT PRIMARY KEY AUTO_INCREMENT,
nombre VARCHAR(20));

CREATE TABLE personas_roles(
id_persona INT,
id_rol INT,
FOREIGN KEY (id_persona) REFERENCES personas(id_persona),
FOREIGN KEY (id_rol) REFERENCES roles(id_rol),
PRIMARY KEY(id_persona, id_rol)
);

CREATE TABLE roles_permisos(
id_rol INT,
id_permiso INT,
FOREIGN KEY (id_rol) REFERENCES roles(id_rol),
FOREIGN KEY (id_permiso) REFERENCES permisos(id_permisos),
PRIMARY KEY ( id_rol, id_permiso)
);
