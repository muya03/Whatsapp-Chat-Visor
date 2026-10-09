/** Límites explícitos de la aplicación. Se muestran al usuario cuando se superan. */
export const LIMITS = {
  /** Tamaño máximo de un TXT importado (se lee como cadena en memoria). */
  maxTxtBytes: 150 * 1024 * 1024,
  /** Tamaño máximo descomprimido del TXT de un ZIP. */
  maxChatEntryBytes: 150 * 1024 * 1024,
  /** A partir de aquí se avisa de que la importación puede ser lenta o consumir mucha memoria. */
  warnZipBytes: 1.5 * 1024 * 1024 * 1024,
  /** Máximo de entradas que se indexan de un ZIP. */
  maxZipEntries: 250_000,
  /** Adjunto individual más grande que se descomprime en memoria para mostrarlo. */
  maxMediaBytes: 1024 * 1024 * 1024,
  /**
   * Adjuntos que, por encima de este tamaño, NO se descomprimen solos al aparecer en pantalla:
   * se muestran como tarjeta con su tamaño y se cargan al tocarlos (evita descomprimir GB al hacer scroll).
   */
  autoLoadMaxBytes: { video: 48 * 1024 * 1024, image: 40 * 1024 * 1024, audio: 32 * 1024 * 1024 },
  /** Cuántos adjuntos se descomprimen a la vez. */
  mediaConcurrency: 3,
  /** Memoria que puede ocupar la caché de adjuntos que ya no están en pantalla. */
  idleMediaCacheBytes: 120 * 1024 * 1024,
  idleMediaCacheEntries: 120,
  /** Bytes máximos de un audio que se decodifica para dibujar la forma de onda. */
  maxWaveformBytes: 6 * 1024 * 1024,
} as const;
