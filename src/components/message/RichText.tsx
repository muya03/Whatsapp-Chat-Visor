import { Fragment, memo, type ReactNode } from 'react';
import { parseRichText, type RichNode } from '../../parser/whatsapp/richText';
import { splitByQuery } from '../../features/search/highlight';

interface Props {
  text: string;
  /** Consulta ya plegada (minúsculas, sin tildes) a resaltar, o ''. */
  query?: string;
  current?: boolean;
}

function renderNodes(nodes: RichNode[], query: string, current: boolean, keyPrefix = ''): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}${i}`;
    switch (n.t) {
      case 'text':
        return <Fragment key={key}>{highlight(n.v, query, current)}</Fragment>;
      case 'bold':
        return <strong key={key}>{renderNodes(n.c, query, current, key + '.')}</strong>;
      case 'italic':
        return <em key={key}>{renderNodes(n.c, query, current, key + '.')}</em>;
      case 'strike':
        return <s key={key}>{renderNodes(n.c, query, current, key + '.')}</s>;
      case 'mono':
        return <code key={key}>{highlight(n.v, query, current)}</code>;
      case 'code':
        return (
          <pre key={key} className="code">
            {highlight(n.v, query, current)}
          </pre>
        );
      case 'quote':
        return <blockquote key={key}>{renderNodes(n.c, query, current, key + '.')}</blockquote>;
      case 'link':
        // Solo http(s) llega aquí (safeHref). No se abre nada automáticamente; el usuario hace clic.
        return (
          <a key={key} href={n.href} target="_blank" rel="noopener noreferrer nofollow" dir="ltr">
            {highlight(n.v, query, current)}
          </a>
        );
    }
  });
}

function highlight(text: string, query: string, current: boolean): ReactNode {
  if (!query) return text;
  const segs = splitByQuery(text, query);
  if (segs.length === 1 && !segs[0]!.hit) return text;
  return segs.map((s, i) =>
    s.hit ? (
      <mark key={i} data-current={current || undefined}>
        {s.text}
      </mark>
    ) : (
      s.text
    ),
  );
}

/** Texto de mensaje con formato de WhatsApp. React escapa todo: el contenido importado nunca se interpreta como HTML. */
export const RichText = memo(function RichText({ text, query = '', current = false }: Props) {
  return <>{renderNodes(parseRichText(text), query, current)}</>;
});
