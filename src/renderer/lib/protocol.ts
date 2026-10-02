import type { InventoryItem } from "./inventory";

export const scalarFields = ["inventory", "def_index", "level", "quality", "flags", "origin", "in_use", "rarity"] as const;
export type Command =
  | { type: "create" | "modify"; item: InventoryItem }
  | { type: "destroy"; id: string }
  | { type: "setId"; temporary: string; id: string }
  | { type: "snapshot" };

export function uint32(value: string): number {
  if (!/^\d+$/.test(value) || Number(value) > 0xffffffff) throw new Error(`Expected an unsigned 32-bit integer: ${value}`);
  return Number(value);
}

export function encodeCommands(commands: Command[]): ArrayBuffer {
  const bytes: number[] = [];
  const u32 = (value: string) => {
    const n = uint32(value);
    bytes.push(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24);
  };
  for (const command of commands) {
    if (command.type === "snapshot") { u32("4"); continue; }
    if (command.type === "setId") { u32("3"); u32(command.temporary); u32(command.id); continue; }
    if (command.type === "destroy") { u32("2"); u32(command.id); continue; }
    u32(command.type === "create" ? "0" : "1");
    u32(command.item.id);
    for (const field of scalarFields) u32(command.item[field]);
    const attributes = Object.entries(command.item.attributes);
    u32(String(attributes.length));
    for (const [id, value] of attributes) {
      u32(id);
      const encoded = new TextEncoder().encode(value);
      u32(String(encoded.length));
      for (const byte of encoded) bytes.push(byte);
    }
    const equips = Object.entries(command.item.equipped_state ?? {});
    u32(String(equips.length));
    for (const [team, slot] of equips) { u32(team); u32(slot); }
  }
  return new Uint8Array(bytes).buffer;
}

export function decodeCommands(buffer: ArrayBuffer): Command[] {
  const view = new DataView(buffer);
  let offset = 0;
  const requireBytes = (count: number) => {
    if (count > view.byteLength - offset) throw new Error("Truncated inventory message");
  };
  const u32 = () => { requireBytes(4); const value = view.getUint32(offset, true); offset += 4; return value; };
  const commands: Command[] = [];
  while (offset < view.byteLength) {
    const type = u32();
    if (type === 4) {
      if (commands.length) throw new Error("Snapshot marker must start the message");
      commands.push({ type: "snapshot" });
      continue;
    }
    if (type === 3) { commands.push({ type: "setId", temporary: String(u32()), id: String(u32()) }); continue; }
    if (type === 2) { commands.push({ type: "destroy", id: String(u32()) }); continue; }
    if (type !== 0 && type !== 1) throw new Error(`Unknown inventory command ${type}`);
    const item: InventoryItem = { id: String(u32()), inventory: "0", def_index: "0", level: "0", quality: "0", flags: "0", origin: "0", in_use: "0", rarity: "0", attributes: {}, equipped_state: {} };
    for (const field of scalarFields) item[field] = String(u32());
    const count = u32();
    requireBytes(count * 8);
    for (let i = 0; i < count; i++) {
      const id = String(u32());
      const length = u32();
      requireBytes(length);
      item.attributes[id] = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(buffer, offset, length));
      offset += length;
    }
    const equips = u32();
    requireBytes(equips * 8);
    for (let i = 0; i < equips; i++) { const team = String(u32()); item.equipped_state![team] = String(u32()); }
    commands.push({ type: type === 0 ? "create" : "modify", item });
  }
  return commands;
}
