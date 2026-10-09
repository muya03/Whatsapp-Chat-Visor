import type { DateOrderSetting } from '../parser/whatsapp/types';
import type { ChatStats } from '../parser/whatsapp/types';
import type { ParseResult } from './engine';

export type WorkerRequest =
  | { type: 'parse'; jobId: number; source: Blob; dateOrder: DateOrderSetting }
  | { type: 'search'; reqId: number; query: string }
  | { type: 'stats'; reqId: number }
  | { type: 'dispose' };

export type WorkerResponse =
  | { type: 'progress'; jobId: number; ratio: number }
  | { type: 'parsed'; jobId: number; result: ParseResult }
  | { type: 'parse-error'; jobId: number; code: string; detail?: Record<string, number | string> }
  | { type: 'searched'; reqId: number; hits: Int32Array }
  | { type: 'stats'; reqId: number; stats: ChatStats };
