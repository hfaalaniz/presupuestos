# Presupuestos

Aplicación para crear, guardar y enviar presupuestos. Corre en Cloudflare Workers con base de datos D1, sin dependencias en producción.

- Inicio de sesión con correo y contraseña.
- Lista de presupuestos: abrir, buscar, duplicar y eliminar.
- Totales automáticos, numeración correlativa y PDF generado en el navegador.
- Envío por WhatsApp o correo con un enlace privado que el cliente abre sin cuenta.

## Publicar en Cloudflare

```bash
npm install
npx wrangler login
npx wrangler d1 create presupuestos
```

Copiá el `database_id` que devuelve el último comando en `wrangler.jsonc`. Después:

```bash
npm run db:remote
npm run deploy
npm run user:add -- tu@correo.com "Tu nombre" --remote
```

El último comando pide la contraseña (mínimo 10 caracteres). Si el correo ya existe, cambia la contraseña y cierra sus sesiones. No hay registro público: las cuentas se crean solo con este comando.

Para publicar con cada push, conectá el repo en Workers & Pages → Create → Import a repository, con el comando de deploy `npx wrangler deploy`.

## Desarrollo local

```bash
npm install
npm run db:local
npm run user:add -- tu@correo.com "Tu nombre"
npm run dev
npm test
```

## Cómo funciona el envío

- **Enviar** guarda el presupuesto y crea un enlace `/p/<token>` con una copia de esa versión. Los cambios posteriores no llegan al cliente hasta que vuelvas a abrir **Enviar**. El enlace se mantiene y se puede desactivar.
- **WhatsApp** abre `wa.me` con el mensaje y el enlace. Los números sin código de país se toman como de Argentina.
- **Correo** abre tu programa de correo con el mensaje y el enlace.
- **Compartir PDF** adjunta el archivo directamente y aparece solo en navegadores que lo permiten, como los de celular.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `src/` | Worker: API, sesiones y permisos |
| `migrations/` | Esquema de D1 |
| `scripts/user-add.mjs` | Alta de usuarios y cambio de contraseña |
| `public/js/calc.js` | Cálculos compartidos entre navegador y Worker |
| `public/js/` | Interfaz: lista, editor, PDF, envío y vista pública |
| `public/vendor/`, `public/fonts/` | jsPDF, jsPDF-AutoTable (MIT), Barlow Condensed e IBM Plex Sans (OFL) |
