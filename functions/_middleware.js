/* Cloudflare Pages publica la carpeta entera del repositorio, y no respeta
   .assetsignore (eso es de Workers). Sin este filtro quedaban accesibles en el
   dominio el plan de infraestructura de docs/ (39 KB), los tests y los
   manifiestos de pnpm.

   _routes.json limita la invocacion de Functions a estas rutas concretas, asi
   que el resto del sitio se sigue sirviendo como estatico puro, sin coste ni
   latencia adicional. */
const RUTAS_PRIVADAS = [
  /^\/docs(\/|$)/,
  /^\/test(\/|$)/,
  /^\/package\.json$/,
  /^\/pnpm-(lock|workspace)\.ya?ml$/,
  /^\/\.(gitignore|assetsignore)$/,
  /^\/\.dev\.vars(\.example)?$/
];

export async function onRequest(context) {
  const { pathname } = new URL(context.request.url);

  if (RUTAS_PRIVADAS.some((patron) => patron.test(pathname))) {
    return new Response('Not Found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex'
      }
    });
  }

  return context.next();
}
