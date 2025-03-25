/* tslint:disable */
/* eslint-disable */
export function wasm_log(s: string): void;
export class QuoridorGame {
  free(): void;
  constructor(size: number, walls: number);
  set_strategy(player_number: number, strategy_name: string, opening_name: string): boolean;
  get_ai_move(): string;
  make_move(move_str: string): boolean;
  get_legal_moves(): string[];
  get_legal_walls(): string[];
  get_game_state(): string;
  check_win(move_str: string): boolean;
  get_active_player(): number;
  reset_game(): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly wasm_log: (a: number, b: number) => void;
  readonly __wbg_quoridorgame_free: (a: number, b: number) => void;
  readonly quoridorgame_new: (a: number, b: number) => number;
  readonly quoridorgame_set_strategy: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
  readonly quoridorgame_get_ai_move: (a: number) => [number, number];
  readonly quoridorgame_make_move: (a: number, b: number, c: number) => number;
  readonly quoridorgame_get_legal_moves: (a: number) => [number, number];
  readonly quoridorgame_get_legal_walls: (a: number) => [number, number];
  readonly quoridorgame_get_game_state: (a: number) => [number, number];
  readonly quoridorgame_check_win: (a: number, b: number, c: number) => number;
  readonly quoridorgame_get_active_player: (a: number) => number;
  readonly quoridorgame_reset_game: (a: number) => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __externref_drop_slice: (a: number, b: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
