# Dominio de esta extracción

GET /api/v1/fuels sólo lee datos existentes. No se agregan entidades, reglas de
precio ni validaciones de negocio artificiales. Su modelo de lectura y puertos
pertenecen a aplicación. Esta carpeta no depende de NestJS ni Prisma.
