import type { MediaKind, SystemKind } from './types';

/**
 * Reconocimiento de avisos del sistema y marcadores de contenido, por idioma.
 * Solo se clasifica lo que se reconoce: lo demás queda como `other`/texto sin tocar.
 * Idiomas con patrones: es, en, pt, fr, de, it. Otros idiomas siguen funcionando, pero los
 * avisos aparecerán como mensaje de sistema genérico (sin icono específico).
 */

const SYSTEM_PATTERNS: [SystemKind, RegExp][] = [
  ['encryption', /end-to-end encrypt|cifrad[oa]s? de extremo a extremo|criptografad[oa]s? de ponta a ponta|chiffr[ée]s? de bout en bout|ende-zu-ende-verschl|crittografat[oi]? end-to-end/i],
  ['security-code', /security code .*changed|c[oó]digo de seguridad .*(cambi|modific)|c[oó]digo de seguran[cç]a .*(mudou|alterou)|code de s[ée]curit[ée] .*chang|sicherheitsnummer .*ge[äa]ndert|codice di sicurezza .*cambiat/i],
  ['group-created', /created (this )?group|cre[oó] el grupo|creaste el grupo|criou o grupo|voc[eê] criou o grupo|a cr[ée][ée] le groupe|vous avez cr[ée][ée] le groupe|hat die gruppe .*erstellt|du hast die gruppe .*erstellt|ha creato il gruppo|hai creato il gruppo/i],
  ['subject-changed', /changed the (group )?(subject|name)|cambi[oó] el (asunto|nombre)|cambiaste el (asunto|nombre)|alterou o (assunto|nome)|a chang[ée] l['’]objet|hat den (betreff|gruppennamen)|ha cambiato (l['’]oggetto|il nome)|you changed the subject/i],
  ['icon-changed', /changed (this group['’]s|the group) icon|cambi[oó] el icono|cambi[oó] la imagen del grupo|eliminó el icono|deleted this group['’]s icon|alterou o [ií]cone|a chang[ée] l['’]ic[oô]ne|hat das gruppenbild|ha cambiato l['’]icona/i],
  ['description-changed', /changed the group description|cambi[oó] la descripci[oó]n|alterou a descri[cç][aã]o|a chang[ée] la description|hat die gruppenbeschreibung|ha cambiato la descrizione/i],
  ['joined-link', /joined using (this group['’]s )?(invite|group) link|se uni[oó] (usando|con) el enlace|entrou usando o link|a rejoint (le groupe )?(avec|via) le lien|ist .* beigetreten|[eè] entrato .* link/i],
  ['participant-added', /\badded\b|a[ñn]adi[oó](?=\s|$)|agreg[oó](?=\s|$)|adicionou|a ajout[ée]|hat .* hinzugef[üu]gt|ha aggiunto|you were added|te a[ñn]adi[oó]|fuiste a[ñn]adid/i],
  ['participant-removed', /\bremoved\b|elimin[oó] a\b|removeu|a retir[ée]|hat .* entfernt|ha rimosso/i],
  ['participant-left', /\bleft$|sali[oó] del grupo|(?:^|\s)sali[oó]$|abandon[oó]|saiu|a quitt[ée]|hat die gruppe verlassen|ha lasciato/i],
  ['settings-changed', /changed (the )?(group )?(settings|admin)|cambi[oó] (la configuraci[oó]n|los ajustes)|only admins|solo los administradores|now an admin|es ahora administrador|ahora eres administrador/i],
];

export function classifySystemText(text: string): SystemKind {
  const flat = text.length > 400 ? text.slice(0, 400) : text;
  for (const [kind, re] of SYSTEM_PATTERNS) if (re.test(flat)) return kind;
  return 'other';
}

/** ¿Este "remitente" candidato (texto antes de los dos puntos) es en realidad un aviso del sistema? */
export function candidateLooksLikeSystem(candidate: string): boolean {
  for (const [kind, re] of SYSTEM_PATTERNS) {
    if (kind === 'participant-left') continue; // «left$» no puede aparecer antes de «:»
    if (re.test(candidate)) return true;
  }
  return false;
}

const DELETED_RE = new RegExp(
  '^(?:' +
    [
      'this message was deleted',
      'you deleted this message',
      'se elimin[oó] este mensaje',
      'eliminaste este mensaje',
      'mensaje eliminado',
      'esta mensagem foi apagada',
      'voc[eê] apagou esta mensagem',
      'ce message a [ée]t[ée] supprim[ée]',
      'vous avez supprim[ée] ce message',
      'diese nachricht wurde gel[öo]scht',
      'du hast diese nachricht gel[öo]scht',
      'questo messaggio [èe] stato eliminato',
      'hai eliminato questo messaggio',
    ].join('|') +
    ')\\.?$',
  'i',
);
export const isDeletedText = (t: string) => DELETED_RE.test(t.trim());

// «Llamada perdida», «Voice call, 2 min», con posible segunda línea «Tap to call back».
const CALL_RE = new RegExp(
  '^(?:missed (?:voice|video) call|(?:voice|video) call(?:,\\s*.+)?|llamada perdida|videollamada perdida|llamada(?: de voz)?(?:,\\s*.+)?|videollamada(?:,\\s*.+)?|chamada (?:de voz |de v[ií]deo )?perdida|chamada(?: de voz| de v[ií]deo)?(?:,\\s*.+)?|appel (?:vocal|vid[ée]o) manqu[ée]|appel (?:vocal|vid[ée]o)(?:,\\s*.+)?|verpasster (?:sprach|video)anruf|(?:sprach|video)anruf(?:,\\s*.+)?|chiamata (?:vocale |video )?persa|chiamata(?: vocale| video)?(?:,\\s*.+)?)(?:\\n.*)?$',
  'i',
);
export const isCallText = (t: string) => CALL_RE.test(t.trim());
export const isMissedCall = (t: string) => /missed|perdida|perdue|manqu|verpasst|persa/i.test(t);

const OMITTED_WORDS: [MediaKind, string][] = [
  ['image', 'image|imagen|imagem|image|bild|immagine|foto'],
  ['video', 'video|v[ií]deo|vid[ée]o'],
  ['audio', 'audio|[aá]udio|audio'],
  ['sticker', 'sticker|autocollant|adesivo|figurinha'],
  ['gif', 'gif'],
  ['document', 'document|documento|dokument'],
  ['contact', 'contact card|tarjeta de contacto|cart[aã]o de contato|carte de contact|kontaktkarte|scheda contatto'],
];
const OMITTED_SUFFIX = 'omitted|omitid[oa]|omis[ea]?|weggelassen|omess[oa]|ausgeschlossen|omitido';
const OMITTED_RE = new RegExp(`^(${OMITTED_WORDS.map(([, w]) => w).join('|')})\\s+(?:${OMITTED_SUFFIX})$`, 'i');
// Androids: «<Media omitted>», «<Multimedia omitido>», «<Medien ausgeschlossen>», «<Mídia oculta>»
const GENERIC_OMITTED_RE = /^<?(?:media omitted|multimedia omitido|contenido multimedia omitido|medien ausgeschlossen|m[ií]dia (?:omitida|oculta)|m[ée]dias? omis(?:es?)?|file multimediali omessi|media weggelassen)>?$/i;

/** Marcador de contenido omitido ("image omitted", "<Media omitted>"…) → tipo (o 'unknown'), o null. */
export function matchOmittedMarker(text: string): MediaKind | null {
  const t = text.trim().replace(/^<|>$/g, '').trim();
  if (!t) return null;
  if (GENERIC_OMITTED_RE.test(text.trim())) return 'unknown';
  const m = t.match(OMITTED_RE);
  if (!m) return null;
  const word = (m[1] ?? '').toLowerCase();
  for (const [kind, words] of OMITTED_WORDS) if (new RegExp(`^(?:${words})$`, 'i').test(word)) return kind;
  return 'unknown';
}

const LOCATION_RE = /(?:location|ubicaci[oó]n|localiza[cç][aã]o|position|standort|posizione)\s*:?\s*(https?:\/\/(?:maps\.google\.com|www\.google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)\S*)/i;
export function matchLocation(text: string): string | null {
  const m = text.match(LOCATION_RE);
  return m?.[1] ?? null;
}
