import { useEffect, useRef, useState } from "react";
import type { InventoryDoc } from "./inventory";
import { LiveInventory } from "./liveInventory";

export type ConnectionState = "offline" | "connecting" | "connected" | "lost";

export function useInventory(initial: InventoryDoc, onCreated: (id: string) => void) {
  const [doc, renderDoc] = useState(initial);
  const docRef = useRef(initial);
  const [connection, renderConnection] = useState<ConnectionState>("offline");
  const state = useRef<ConnectionState>("offline");
  const [notice, setNotice] = useState("");
  const socket = useRef<WebSocket | null>(null);
  const session = useRef<LiveInventory | null>(null);
  const hasConnected = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const handshake = useRef<ReturnType<typeof setTimeout>>();
  const creationTimeout = useRef<ReturnType<typeof setTimeout>>();
  const created = useRef(onCreated);
  created.current = onCreated;
  const publish = (next: InventoryDoc) => { docRef.current = next; renderDoc(next); };
  const setState = (next: ConnectionState) => { state.current = next; renderConnection(next); };
  const fail = (message: string) => {
    clearTimeout(timer.current);
    clearTimeout(handshake.current);
    clearTimeout(creationTimeout.current);
    timer.current = undefined;
    setState(hasConnected.current ? "lost" : "offline");
    setNotice(hasConnected.current
      ? `${message} Reconnect to load a fresh inventory snapshot. Recent changes may not have reached the game.`
      : `${message} Offline inventory kept. Start the game and try again.`);
    if (socket.current) {
      socket.current.onmessage = socket.current.onerror = socket.current.onclose = null;
      socket.current.close();
      socket.current = null;
    }
  };
  const flushSoon = () => {
    // Fixed interval while dragging: coalesce updates without postponing indefinitely.
    if (timer.current !== undefined) return;
    timer.current = setTimeout(() => {
      timer.current = undefined;
      if (state.current !== "connected") return;
      try { session.current!.flush(); } catch (error) { fail(String(error)); }
    }, 100);
  };

  const updateCreationNotice = () => {
    if (session.current?.creating) {
      setNotice("Adding items to the game...");
      if (creationTimeout.current === undefined) {
        creationTimeout.current = setTimeout(() => fail("The game did not acknowledge item creation."), 10000);
      }
    } else {
      clearTimeout(creationTimeout.current);
      creationTimeout.current = undefined;
      setNotice("Connected to game. Changes are sent automatically.");
    }
  };

  const setDoc = (next: InventoryDoc) => {
    if (state.current === "offline") { setNotice(""); publish(next); return; }
    if (state.current !== "connected") return;
    try {
      session.current!.edit(next);
      publish(session.current!.doc);
      updateCreationNotice();
      flushSoon();
    } catch (error) {
      if (socket.current?.readyState !== WebSocket.OPEN) fail("Connection lost.");
      else setNotice(`Edit was not applied: ${String(error)}`);
    }
  };

  const connect = () => {
    if (state.current === "connecting" || state.current === "connected") return;
    setState("connecting");
    setNotice("Connecting to game and loading inventory…");
    let ws: WebSocket;
    try { ws = new WebSocket("ws://127.0.0.1:13001"); }
    catch (error) { fail(String(error)); return; }
    ws.binaryType = "arraybuffer";
    socket.current = ws;
    const live = new LiveInventory(buffer => {
      if (ws.readyState !== WebSocket.OPEN) throw new Error("Connection lost.");
      ws.send(buffer);
    }, id => {
      clearTimeout(creationTimeout.current);
      creationTimeout.current = undefined;
      created.current(id);
    });
    session.current = live;
    handshake.current = setTimeout(() => fail("The game did not send an inventory snapshot."), 10000);
    ws.onmessage = event => {
      if (state.current === "lost") return;
      try {
        if (!(event.data instanceof ArrayBuffer)) throw new Error("Expected a binary inventory message");
        live.receive(event.data);
        if (!live.ready) return;
        clearTimeout(handshake.current);
        hasConnected.current = true;
        publish(live.doc);
        if (state.current === "connecting") {
          setState("connected");
          setNotice("Connected to game. Changes are sent automatically.");
        }
        updateCreationNotice();
        flushSoon();
      } catch (error) { fail(`Inventory synchronization failed: ${String(error)}.`); }
    };
    ws.onerror = () => fail("Could not communicate with the game.");
    ws.onclose = () => { if (state.current !== "lost") fail("Connection lost."); };
  };

  useEffect(() => () => {
    clearTimeout(timer.current);
    clearTimeout(handshake.current);
    clearTimeout(creationTimeout.current);
    if (socket.current) {
      socket.current.onmessage = socket.current.onclose = socket.current.onerror = null;
      socket.current.close();
    }
  }, []);

  const allocateId = () => state.current === "connected"
    ? session.current!.allocateId()
    : String(docRef.current.items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1);

  return { inventoryDoc: doc, setInventoryDoc: setDoc, connection, notice, connect, allocateId };
}
