CREATE DATABASE CEM;
USE CEM;
CREATE TABLE personas(
id_persona INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
nombre VARCHAR(20),
apellido VARCHAR(20),
dni int(10),
fecha_nacimiento DATE,
email VARCHAR(40) NOT NULL UNIQUE,
nombre_usuario VARCHAR(15),
user_password VARCHAR(60),
createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)engine=innoDB; 

CREATE TABLE clientes(
id_cliente INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
persona_id INT NOT NULL,
domicilio VARCHAR (30),
telefono INT(20),
FOREIGN KEY (persona_id) REFERENCES personas(id_persona)
)engine=innoDB;

CREATE TABLE organizadores(
id_organizadores INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
persona_id INT NOT NULL,
cuit INT (20),
FOREIGN KEY (persona_id) REFERENCES personas(id_persona)
)engine=innoDB;

CREATE TABLE bodegas(
id_bodega INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
nombre VARCHAR (30),
domicilio VARCHAR (30),
descripcion VARCHAR(200),
imagen VARCHAR(30),
aforo INT NOT NULL
)engine=innoDB;

CREATE TABLE eventos(
id_evento INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
bodega_id INT NOT NULL,
nombre VARCHAR(30),
descripcion VARCHAR(200),
fecha DATE,
precio DOUBLE,
imagen VARCHAR(30),
cupo INT NOT NULL,
FOREIGN KEY (bodega_id) REFERENCES bodegas(id_bodega)
)engine=innoDB;

CREATE TABLE reservas(
id_reserva INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
evento_id INT NOT NULL,
bodega_id INT NOT NULL,
fecha DATETIME,
FOREIGN KEY (bodega_id) REFERENCES bodegas(id_bodega),
FOREIGN KEY (evento_id) REFERENCES eventos(id_evento)
)engine=innoDB;


CREATE TABLE roles(
id_rol INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
nombre VARCHAR(30)
)engine=innoDB;

CREATE TABLE roles_personas(
id INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
rol_id INT NOT NULL,
persona_id INT NOT NULL,
FOREIGN KEY (persona_id) REFERENCES personas(id_persona),
FOREIGN KEY (rol_id) REFERENCES roles(id_rol)
)engine=innoDB;

CREATE TABLE permisos(
id_permiso INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
nombre VARCHAR(30)
)engine=innoDB;

CREATE TABLE permisos_roles(
id INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
rol_id INT NOT NULL,
permiso_id INT NOT NULL,
FOREIGN KEY (rol_id) REFERENCES roles(id_rol),
FOREIGN KEY (permiso_id) REFERENCES permisos(id_permiso)
)engine=innoDB;

ALTER TABLE eventos ADD COLUMN creado_por INT NOT NULL;
ALTER TABLE eventos ADD FOREIGN KEY (creado_por) REFERENCES personas(id_persona);

show tables from CEM;
