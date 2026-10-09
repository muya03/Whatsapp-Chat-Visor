import { buildRows } from '../../features/conversation/rows';
import { importFile } from '../../features/import/importer';
import type { Session } from '../../app/state/store';

/** Crea una Session real (importando un TXT en memoria) para pruebas de componentes y exportación. */
export async function makeSession(text: string, name = '_chat.txt'): Promise<Session> {
  const imported = await importFile(new File([text], name, { type: 'text/plain' }));
  return {
    id: 's-test',
    imported,
    chat: imported.chat,
    rows: buildRows(imported.chat.messages),
    me: null,
    customTitle: null,
    avatarUrl: null,
    dateOrderSetting: 'auto',
    importedAt: 0,
    stats: null,
  };
}
