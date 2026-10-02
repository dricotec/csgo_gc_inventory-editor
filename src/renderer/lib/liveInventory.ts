import type { InventoryDoc, InventoryItem } from "./inventory";
import { decodeCommands, encodeCommands, scalarFields, type Command } from "./protocol";

// InventoryUnacknowledged(UnacknowledgedDropped), matching gc_const_csgo.h.
const unacknowledgedDropped = String((1 << 30) | 1);

// Apply only the user's changes to the latest game item, including individual attributes.
export function mergeEdit(base: InventoryItem, edited: InventoryItem, latest: InventoryItem): InventoryItem {
  const result = { ...latest, attributes: { ...latest.attributes } };
  for (const field of scalarFields) if (base[field] !== edited[field]) result[field] = edited[field];
  for (const key of new Set([...Object.keys(base.attributes), ...Object.keys(edited.attributes)])) {
    if (base.attributes[key] === edited.attributes[key]) continue;
    if (key in edited.attributes) result.attributes[key] = edited.attributes[key];
    else delete result.attributes[key];
  }
  return result;
}

export class LiveInventory {
  doc: InventoryDoc = { rootKey: null, itemsKey: null, items: [] };
  ready = false;
  private nextTemporary = 1;
  private pending = new Map<string, InventoryItem>();
  private dirty = new Map<string, InventoryItem>();
  private removed = new Set<string>();

  constructor(private send: (buffer: ArrayBuffer) => void, private created: (id: string) => void) {}

  get creating(): boolean { return this.pending.size > 0; }

  // These IDs identify creation drafts only; they never enter doc.items.
  allocateId(): string { return `pending-${this.nextTemporary++}`; }

  edit(next: InventoryDoc) {
    if (!this.ready) throw new Error("The game inventory is not ready");
    const previous = new Map(this.doc.items.map(item => [item.id, item]));
    const ids = new Set(next.items.map(item => item.id));
    const commands: Command[] = [];
    for (const item of next.items) {
      const old = previous.get(item.id);
      if (!old) {
        if (!item.id.startsWith("pending-")) throw new Error("New live items must use temporary IDs");
        commands.push({ type: "create", item: { ...item, id: item.id.slice(8), inventory: unacknowledgedDropped, equipped_state: {} } });
      } else if (JSON.stringify(old) !== JSON.stringify(item)) {
        encodeCommands([{ type: "modify", item }]);
      }
    }
    for (const item of this.doc.items) {
      if (!ids.has(item.id)) commands.push({ type: "destroy", id: item.id });
    }
    // Validate the whole operation before changing local state or sending anything.
    const buffer = encodeCommands(commands);
    for (const item of next.items) {
      const old = previous.get(item.id);
      if (!old) this.pending.set(item.id, { ...item, inventory: unacknowledgedDropped, equipped_state: {} });
      else if (JSON.stringify(old) !== JSON.stringify(item) && !this.dirty.has(item.id)) this.dirty.set(item.id, old);
    }
    for (const item of this.doc.items) {
      if (!ids.has(item.id)) {
        this.dirty.delete(item.id);
        this.removed.add(item.id);
      }
    }
    this.doc = { ...next, items: next.items.filter(item => previous.has(item.id)) };
    if (commands.length) this.send(buffer);
  }

  flush() {
    const commands: Command[] = [];
    for (const item of this.doc.items) {
      if (this.dirty.has(item.id)) commands.push({ type: "modify", item });
    }
    if (commands.length) this.send(encodeCommands(commands));
    for (const command of commands) if (command.type === "modify") this.dirty.delete(command.item.id);
  }

  receive(buffer: ArrayBuffer) {
    const commands = decodeCommands(buffer);
    if (commands[0]?.type === "snapshot") {
      if (this.ready) throw new Error("Unexpected second inventory snapshot");
      if (commands.slice(1).some(command => command.type !== "create")) throw new Error("Invalid inventory snapshot");
      this.doc = { ...this.doc, items: [] };
      this.ready = true;
    }
    if (!this.ready) return; // Deltas queued before the snapshot are already included in it.
    for (const command of commands) {
      if (command.type === "snapshot") continue;
      if (command.type === "setId") {
        const temporary = `pending-${command.temporary}`;
        const original = this.pending.get(temporary);
        if (!original) throw new Error("Unknown temporary item ID");
        this.pending.delete(temporary);
        this.doc = { ...this.doc, items: [...this.doc.items, { ...original, id: command.id }] };
        this.created(command.id);
        continue;
      }
      if (command.type === "destroy") {
        this.dirty.delete(command.id);
        this.doc = { ...this.doc, items: this.doc.items.filter(item => item.id !== command.id) };
        continue;
      }
      const local = this.doc.items.find(item => item.id === command.item.id);
      if (this.removed.has(command.item.id)) continue;
      const base = this.dirty.get(command.item.id);
      const item = local && base ? mergeEdit(base, local, command.item) : command.item;
      if (base) this.dirty.set(item.id, command.item);
      this.doc = { ...this.doc, items: local ? this.doc.items.map(existing => existing.id === item.id ? item : existing) : [...this.doc.items, item] };
    }
  }
}
