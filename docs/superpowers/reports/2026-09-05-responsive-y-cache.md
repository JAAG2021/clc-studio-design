# Responsive del hero, widget de Turnstile en producción, y un hallazgo crítico de caché — 5-6 de septiembre de 2026

> Continuación de [`2026-09-05-auditoria-produccion.md`](./2026-09-05-auditoria-produccion.md)
> y [`2026-09-05-turnstile.md`](./2026-09-05-turnstile.md). Registra tres PRs adicionales
> (#2 Turnstile, #3 responsive del hero, #4 hotfix de caché) y, sobre todo, **por qué
> ninguno de los cambios del día llegó a un visitante real hasta el último commit**.

## 1. Bug real de responsive en el hero (reportado por el usuario con capturas de un dispositivo real)

`.slider .card` (400×300px) y `.slider-contact-btn` eran los únicos elementos del sitio
sin ajuste en ningún breakpoint — confirmado comparando contra `.images .img`, el
carrusel de video hermano en "Thinking", que sí se reduce en cada uno. En móvil, una
tarjeta llenaba casi toda la pantalla y el botón "Hablemos" (centrado en absoluto sobre
el carrusel, diseño pensado para escritorio) quedaba encima de la imagen.

**Primer intento (insuficiente):** reducir tarjeta y botón en la misma proporción en los
5 breakpoints. No resolvía el problema real — el botón seguía centrado en absoluto, así
que con menos "hueco" disponible en móvil, seguía cayendo sobre alguna tarjeta.

**Fix real:** sacar `.slider-contact-btn` del posicionamiento absoluto. `.wrapper` pasa a
`display:flex; flex-direction:column` en los 5 breakpoints — carrusel arriba, botón
debajo, como bloques propios en el flujo, sin animación flotante.

## 2. Bug de responsive en el H1 (encontrado al conseguir por fin capturas headless reales)

Verificado con capturas reales del deployment de vista previa: a 480px "marcas que
lideran" cabía, a 414px se cortaba a la mitad, a 360px desaparecía — los tres anchos
usan la misma regla CSS, lo que descartaba un problema de breakpoints mal definidos.

**Causa:** en los 4 breakpoints móviles del H1, el `clamp()` de `font-size` alcanzaba su
techo máximo muy por debajo del propio piso de cada tramo (ej. el tramo `≤480px`, rango
real 361-480px, clampeaba desde los 346px) — la fuente quedaba en un tamaño **fijo** en
todo el tramo, calibrado para el extremo ancho y desbordando en el angosto, justo donde
vive la mayoría de los teléfonos reales.

**Dos intentos insuficientes**, documentados para que quede el rastro de qué no funcionó
y por qué:
1. Recalcular los 4 coeficientes `vw` para que cada `clamp()` alcanzara su techo justo en
   el borde de su propio tramo — corrigió la curva, pero el valor *en* ese borde no
   cambiaba respecto a antes, que es justo donde se había probado el desborde.
2. Reducir el techo de los tramos `≤480px`/`≤360px` y quitar el `+6pt` extra que la
   palabra rotativa llevaba desde escritorio — mejoró pero seguía fallando en el rango
   340-400px.

**Fix real:** las 4 reglas de `font-size` independientes se reemplazan por **una sola
fórmula continua** para todo el rango móvil (320-768px):
```css
font-size: calc(clamp(26px, 7.6vw + 9.7px, 68px) - 6pt);
```
Calculada para dar ~26px efectivos a 320px (con margen) y ~60px a 768px, interpolando
linealmente. Sin fronteras de tramo que recalibrar. Verificado con captura real en 7
anchos (320 a 480px): el título cabe completo con margen visible en todos.

**Lección para este archivo:** un `clamp(min, Xvw, max)` acotado por un breakpoint debe
alcanzar su `max` *en* el borde superior de ese breakpoint, no antes — de lo contrario la
fuente queda fija (no responsive) en todo el tramo. Vale la pena auditar el resto de
`clamp()` del archivo con esta misma regla si aparecen más reportes de este tipo.

## 3. La sección "Desde 2023" — descartado como bug

El usuario reportó margen crema visible a los costados del video en sus capturas.
Verificado directamente con captura real (390px, producción): el video ocupa el 100%
del ancho, borde a borde, sin margen lateral. El margen que aparecía en las fotos del
usuario era casi seguro del propio recorte/marco de su captura de pantalla, no de la
página. Sin cambios de código.

## 4. Turnstile activado en producción (PR #2)

Ver [`2026-09-05-turnstile.md`](./2026-09-05-turnstile.md) para el detalle completo.
Confirmado en producción con captura real: el widget renderiza y pasa por su estado
"Verificando..." antes del botón Enviar.

## 5. Hallazgo crítico: caché de borde stale (PR #4, hotfix)

**Verificando producción después de fusionar los PR #1-#3**, una captura real de
`clcolor.com` seguía mostrando el bug *original* del botón superpuesto — pese a que
`style.css` en el origen de Cloudflare Pages ya tenía el fix, confirmado con diff byte a
byte contra el repositorio.

`curl -I` reveló la causa: `cf-cache-status: HIT` para `style.css?v=20260905`.
`_headers` fija `Cache-Control: max-age=604800` (7 días) para `/style.css` y
`/script.js`, y **ese parámetro de versión nunca cambió** durante toda la sesión de
hoy, pese a que ambos archivos recibieron numerosos commits (hero, H1, Turnstile). El
borde de Cloudflare llevaba sirviendo, con estado HIT, la copia cacheada de *antes* de
todos los cambios del día — ninguno había llegado a un solo visitante real hasta este
punto, aunque el origen (y cualquier verificación contra la URL sin `?v=`, o contra un
deployment de vista previa distinto) mostrara el contenido correcto.

**Fix:** subir `?v=` a `20260906` en las 7 páginas, tanto para `style.css` como para
`script.js`. Verificado: la nueva URL responde `cf-cache-status: MISS` (fetch fresco), y
una captura real post-fix confirma el hero, el H1 y el formulario funcionando
correctamente en `clcolor.com`.

**Por qué importa para trabajo futuro en este proyecto:** cualquier cambio a
`style.css` o `script.js` que no venga acompañado de subir el `?v=` en las 7 páginas
HTML **no llegará a ningún visitante real durante 7 días**, sin importar cuántas veces
se verifique el origen o un deployment de vista previa — solo la URL exacta con el
parámetro de versión importa para el borde de cache. Verificar el *origen* no es
suficiente; hay que verificar la URL versionada real que usan las páginas.

## Verificación final en producción (`clcolor.com`, post-hotfix)

- Captura real a 390px: tarjetas del hero reducidas, botón debajo sin superposición,
  "marcas que lideran" completo con margen.
- Video de "Desde 2023": borde a borde, sin margen lateral.
- Formulario: campos con etiquetas "(opcional)" correctas, widget de Turnstile
  renderizando ("Verificando..."), botón Enviar presente.
- `POST /api/contact` sin `turnstile_token` → `403` (enforcement activo).
- `cf-cache-status: MISS` en la URL versionada nueva.

## Pull requests de esta sesión

| PR | Título | Estado |
|---|---|---|
| #2 | Activar Cloudflare Turnstile en el formulario de contacto | Fusionado |
| #3 | Fix responsive: tarjetas y botón flotante del hero en móvil (+ fix del H1) | Fusionado |
| #4 | Hotfix: romper caché de borde stale | Fusionado |
