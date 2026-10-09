# Atribuciones y avisos

## Proyectos de referencia (solo ideas; no se ha copiado código)

Se estudiaron, clonando y leyendo su código real, estos dos repositorios, ambos con **licencia MIT**:

| Proyecto | Licencia | Qué se tomó |
|---|---|---|
| [srilakshmikanthanp/chatviewer](https://github.com/srilakshmikanthanp/chatviewer) © 2025 Sri Lakshmi Kanthan P | MIT | La idea de iterar los mensajes de un TXT/ZIP como secuencia y de relacionar el adjunto citado con su entrada del ZIP. |
| [ParasSharma2306/chatlume](https://github.com/ParasSharma2306/chatlume) © 2026 Paras Sharma | MIT | Ideas de diseño: análisis de la cabecera por etapas, normalización de dígitos/caracteres invisibles, inferencia del orden de fecha por puntuación, claves de adjuntos normalizadas, adjuntos descomprimidos bajo demanda y liberados fuera de pantalla, cierre del Service Worker por versión. |

Todo el código de este repositorio es de autoría propia (TypeScript, otra arquitectura). Al no haberse copiado
código, no se arrastran sus avisos de copyright; se citan aquí por cortesía y por transparencia.

## Dependencias en ejecución

| Paquete | Licencia |
|---|---|
| react, react-dom | MIT |
| @tanstack/react-virtual | MIT |
| @zip.js/zip.js | BSD-3-Clause |

Las dependencias de desarrollo (Vite, Vitest, Playwright, Testing Library, sharp, fflate, axe-core, etc.) no se distribuyen en la compilación.

## Marcas

«WhatsApp» es una marca de su titular. Este proyecto es independiente, no está afiliado ni respaldado por WhatsApp/Meta,
usa nombre, logotipo e iconos propios y solo reproduce el aspecto visual de una conversación con fines de lectura de
exportaciones. Se nombra WhatsApp únicamente para describir el formato de archivo que se lee.
