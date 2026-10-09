import { describe, expect, it } from 'vitest';
import { parseChat } from '../../parser/whatsapp/parser';
import { fixture } from '../../tests/helpers/fixtures';
import { generateChat } from '../../tests/helpers/synthetic';
import { buildRows, nearestDay } from './rows';

describe('buildRows', () => {
  const chat = parseChat(fixture('android-es-group.txt'));
  const model = buildRows(chat.messages);

  it('inserta un separador por cada día con mensajes, antes de sus mensajes', () => {
    const dates = model.rows.filter((r) => r.t === 'date').map((r) => (r.t === 'date' ? r.dayKey : 0));
    expect(dates).toEqual([20221214, 20221215, 20221231, 20230101]);
    expect(model.days).toEqual(dates);
    for (const [day, idx] of model.dayToRow) expect(model.rows[idx]).toMatchObject({ t: 'date', dayKey: day });
  });

  it('msgToRow apunta a la fila del mensaje', () => {
    chat.messages.forEach((m, i) => {
      const row = model.rows[model.msgToRow[i]!]!;
      expect(row).toMatchObject({ msg: i });
      expect(row.t).toBe(m.kind === 'system' ? 'sys' : 'msg');
    });
  });

  it('agrupa solo mensajes consecutivos del mismo remitente y día; nunca cruza días ni avisos', () => {
    const msgRows = model.rows.filter((r): r is Extract<typeof r, { t: 'msg' }> => r.t === 'msg');
    for (let i = 1; i < model.rows.length; i++) {
      const r = model.rows[i]!;
      if (r.t !== 'msg' || r.first) continue;
      const before = model.rows[i - 1]!;
      expect(before.t).toBe('msg'); // continúa tras otro mensaje, no tras fecha/aviso
      if (before.t === 'msg') {
        expect(chat.messages[before.msg]!.sender).toBe(chat.messages[r.msg]!.sender);
        expect(chat.messages[before.msg]!.dayKey).toBe(chat.messages[r.msg]!.dayKey);
        expect(before.last).toBe(false);
      }
    }
    expect(msgRows.some((r) => !r.first)).toBe(true); // el fixture sí contiene mensajes encadenados
  });

  it('tras una pausa larga se abre un grupo nuevo', () => {
    const c = parseChat('01/01/23, 10:00 - Ana: a\n01/01/23, 10:05 - Ana: b\n01/01/23, 10:40 - Ana: c\n');
    const m = buildRows(c.messages);
    const flags = m.rows.filter((r) => r.t === 'msg').map((r) => (r.t === 'msg' ? r.first : null));
    expect(flags).toEqual([true, false, true]);
  });

  it('escala a 100k mensajes y conserva el orden', () => {
    const big = parseChat(generateChat({ messages: 100_000 }));
    const t = performance.now();
    const m = buildRows(big.messages);
    const ms = performance.now() - t;
    expect(m.rows.length).toBeGreaterThanOrEqual(100_000);
    expect(ms).toBeLessThan(1500);
    let last = -1;
    for (const r of m.rows) if (r.t !== 'date') { expect(r.msg).toBeGreaterThan(last); last = r.msg; }
  });
});

describe('nearestDay', () => {
  const days = [20230101, 20230105, 20230110];
  it('exacto, siguiente y último anterior', () => {
    expect(nearestDay(days, 20230105)).toBe(20230105);
    expect(nearestDay(days, 20230102)).toBe(20230105);
    expect(nearestDay(days, 20240101)).toBe(20230110);
    expect(nearestDay([], 20230101)).toBeNull();
  });
});
