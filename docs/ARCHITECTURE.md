# Arquitectura y decisiones técnicas

## 1. Auditoría de los repositorios de referencia

Se clonaron y leyeron (README, estructura, código, historial, licencias). Ambos son MIT.

**Chat Viewer** (`srilakshmikanthanp/chatviewer`): monorepo Nx con SPA React + Redux/MUI y un backend Express con MySQL/PostgreSQL, cuentas, JWT, Google Drive y compartir. Interpreta con `whatsapp-chat-parser` y abre el ZIP completo con **JSZip** (`loadAsync(file)`), un único TXT por ZIP (regex `/.txt/`) y localiza adjuntos con `RegExp(nombre$)`.
→ *Descartado como base*: exige servidor y cuentas (contradice «sin backend, procesamiento local»), carga todo el ZIP en memoria, falla con varios TXT y con nombres con caracteres regex, no virtualiza ni tiene PWA.

**ChatLume** (`ParasSharma2306/chatlume`): JavaScript sin build, parser por etapas (`whatsapp-parser.js`), lista virtualizada propia (ventana deslizante), `zip.js` con `DecompressionStream`, adjuntos descomprimidos con `IntersectionObserver` y liberados, SW con caché por versión, exportación, pruebas con `node --test`.
→ *Ideas adoptadas* (sin copiar código): análisis por etapas; normalización de dígitos y caracteres invisibles; inferencia del orden de fecha por puntuación; clave normalizada de adjuntos; acceso diferido a entradas ZIP; cierre del SW por versión.
→ *Descartado*: dependencias desde CDN (`cdn.jsdelivr.net`: rompe offline y privacidad), JS sin tipos, ventana deslizante manual (se usa `@tanstack/react-virtual`).

## 2. Capas

```
src/
  parser/whatsapp/   Analizador puro (sin DOM, sin React): cabeceras, fechas, remitentes, adjuntos, avisos, estadísticas, formato de texto
  services/          zipReader (zip.js, lectura perezosa), mediaStore (ciclo de vida de URLs), fileValidation, importStore (IndexedDB opcional), limits
  workers/           engine.ts (lógica) + parsing.worker.ts (envoltorio). Un worker por conversación: parse + índice de búsqueda
  features/          importer (orquesta), conversation (filas/agrupación/título), search, media, export, preferences
  app/               estado (sesiones, preferencias), navegación con historial, App
  components/        UI: layout, chat, message, media, dialogs, search, import
  styles/            tokens.css (medidas) · themes.css (colores) · base/layout/chat/import/responsive.css · doodle.svg
  pwa/               sw.js (plantilla), vitePlugin.ts (precache + versión), pwa.ts (registro, instalación, actualización)
```

- **Modelo** (`parser/whatsapp/types.ts`): `ChatMessage {id, line, ts, dayKey, rawTime, sender, text, kind, system?, attachments[], locationUrl?}`. El parser nunca produce HTML; la UI nunca ve líneas crudas.
- **Fechas**: `ts` es «hora de pared» codificada como UTC (`Date.UTC(y,m,d,h,mi,s)`); nunca se convierte de zona, así que la hora mostrada es la escrita por WhatsApp. `rawTime` solo se conserva cuando la fecha no se pudo interpretar.
- **Orden de fecha** (`formatDetector.ts`): año primero → AAAA-MM-DD; algún valor >12 decide DMY/MDY; si todo cabe en ambos, se desempata por violaciones de cronología y por «el mes cambia más despacio» y se marca `ambiguous` para ofrecer corrección en Ajustes. Cambiarlo vuelve a analizar el TXT retenido, sin reabrir el archivo.
- **Mensajes del sistema**: una línea sin remitente es aviso; el primer «: » solo separa remitente si lo anterior parece un nombre (≤64 caracteres, ≤7 palabras, sin comillas y sin pinta de aviso). Los tipos (cifrado, grupo creado, altas/bajas, asunto, icono…) se reconocen en es/en/pt/fr/de/it; lo desconocido queda como aviso genérico sin inventar tipo.
- **Virtualización**: `buildRows` crea una lista plana (separador de día / aviso / burbuja con `first`/`last`) y mapas `msgToRow`/`dayToRow`. La agrupación nunca mezcla remitentes ni días (tope de 10 min entre mensajes). `MessageList` usa `@tanstack/react-virtual` con alturas dinámicas; el posicionamiento (final, fecha, resultado de búsqueda) es propio y se **cancela ante cualquier gesto del usuario** (el reconciliado interno de `scrollToIndex` podía devolver la lista al final hasta 5 s).
- **Búsqueda**: índice de texto plegado (minúsculas, sin tildes) de remitente + texto + nombres de adjunto, construido una vez y vivo en el worker; la consulta no toca el hilo principal. El resaltado usa un plegado que conserva índices.
- **Adjuntos**: `MediaIndex` empareja nombre citado ↔ entrada del ZIP (clave exacta y, si es única, clave laxa sin tildes/espacios/guiones). `MediaStore` descomprime bajo demanda (3 a la vez, descarta peticiones cuyo elemento ya salió de pantalla), crea la URL una vez, cuenta referencias y mantiene una caché LRU acotada (120 MB / 120 entradas) de adjuntos inactivos. Los adjuntos pesados (>48 MB vídeo, >40 MB imagen, >32 MB audio) no se descomprimen solos: se cargan al tocarlos.
- **Navegación**: pila sincronizada con `history` (`nav.tsx`). «Atrás» cierra visor → diálogos → panel de datos → conversación (móvil) → lista, como WhatsApp.
- **Skins**: `data-skin = web | android | ios` redefine solo tokens (tipografía, radios, anchos, cabeceras). Automático según dispositivo; elegible en Ajustes.

## 3. Seguridad y privacidad (defensa en profundidad)

1. Todo el contenido se pinta con React (escapa por construcción); no existe `dangerouslySetInnerHTML`. El formato de texto produce un árbol de nodos, no HTML. Solo enlaces `http(s)` (`safeHref`), con `rel="noopener noreferrer nofollow"`, nunca abiertos automáticamente.
2. ZIP: se lee el directorio central con `Blob.slice` (sin cargar el archivo); se ignoran entradas con `..`, rutas absolutas o NUL; se limita el TXT descomprimido (con tope también durante el flujo, no solo el tamaño declarado) y el número de entradas.
3. **CSP** en el HTML compilado: `default-src 'self'; script-src 'self'; connect-src 'self' blob: data:; object-src 'none'; form-action 'none'…`. La página no puede enviar datos a otros orígenes aunque hubiera un fallo.
4. Sin telemetría, sin fuentes ni scripts remotos, sin backend. El Service Worker solo guarda el app shell listado en build (ver `sw.js`); un test comprueba que tras importar la caché no contiene nada del chat.
5. Persistencia opcional (IndexedDB) desactivada por defecto, con consentimiento informado, listado, borrado individual y total, y manejo de cuota. Sin consentimiento no se crea ni la base de datos (comprobado en test).
6. La URL nunca recibe contenido del chat.

## 4. PWA

`manifest.webmanifest` (standalone, `scope`/`start_url` relativos, iconos 192/512/maskable propios), `sw.js` con precache versionado por hash del contenido **y** del propio SW, navegación siempre desde el `index.html` de la misma versión (no mezcla versiones), actualización controlada (la versión nueva espera hasta «Actualizar»; no se recarga sola, para no interrumpir una lectura), limpieza de cachés antiguas, `ignoreVary` (servidores con `Vary: Origin` rompían el offline). Instalación con `beforeinstallprompt` y ayuda manual para Safari en iOS.

## 5. Decisiones y compromisos

- **Un worker por conversación**: cancelar = terminar; el índice vive allí. A cambio, los mensajes se clonan (structured clone) al hilo principal: 100 000 mensajes ≈ 0,5–0,8 s hasta el primer bloque legible (medido).
- **Estadísticas diferidas**: se calculan tras mostrar el chat (no retrasan la primera pantalla).
- **zip.js sin Web Workers propios**: usa `DecompressionStream` nativo cuando existe; sin él, descomprime en el hilo principal (más lento, funciona).
- **Bundle**: ~600 kB (206 kB gzip), de los que la mayor parte es zip.js. Podría dividirse en un chunk perezoso; no se ha hecho por no complicar la ruta offline.
