import { Injectable, signal } from "@angular/core";
import {
  decodeErrorResult,
  decodeEventLog,
  encodeFunctionData,
  formatEther,
  getAddress,
  hexToBigInt,
  isAddress,
  parseEther,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { CHAINS, PAYLOCK_ABI, STATUS_LABEL, type ChainKey } from "./paylock.abi";

export type InvoiceView = {
  id: string;
  payer: string;
  payee: string;
  amountWei: bigint;
  amountLabel: string;
  memo: string;
  status: string;
  statusCode: number;
};

@Injectable({ providedIn: "root" })
export class PaylockService {
  readonly account = signal<string>("");
  readonly chainId = signal<number>(0);
  readonly contract = signal<string>("");
  readonly error = signal<string>("");
  readonly busy = signal(false);
  readonly invoices = signal<InvoiceView[]>([]);

  private addresses: Record<string, string> = {};

  async init(): Promise<void> {
    try {
      const res = await fetch("assets/deployed.json");
      if (res.ok) this.addresses = (await res.json()) as Record<string, string>;
    } catch {
      /* localStorage / manual address still work */
    }
    this.refreshContract();
    if (window.ethereum) {
      const accounts = (await window.ethereum.request({
        method: "eth_accounts",
      })) as string[];
      if (accounts[0]) this.account.set(getAddress(accounts[0]));
      const cid = (await window.ethereum.request({ method: "eth_chainId" })) as string;
      this.chainId.set(Number.parseInt(cid, 16));
      this.refreshContract();
      window.ethereum.on?.("chainChanged", (cid) => {
        this.chainId.set(Number.parseInt(String(cid), 16));
        this.refreshContract();
      });
      window.ethereum.on?.("accountsChanged", (accounts) => {
        const list = accounts as string[];
        this.account.set(list[0] ? getAddress(list[0]) : "");
      });
    }
  }

  hasWallet(): boolean {
    return Boolean(window.ethereum);
  }

  chainKey(): ChainKey | null {
    const id = this.chainId();
    const found = (Object.keys(CHAINS) as ChainKey[]).find((k) => CHAINS[k].id === id);
    return found ?? null;
  }

  chainMeta() {
    const key = this.chainKey();
    return key ? CHAINS[key] : null;
  }

  setManualContract(addr: string): void {
    const trimmed = addr.trim();
    if (!isAddress(trimmed)) {
      throw new Error("Contract address is not valid.");
    }
    const id = String(this.chainId() || 0);
    const checksum = getAddress(trimmed);
    this.addresses[id] = checksum;
    localStorage.setItem(`paylock.contract.${id}`, checksum);
    this.contract.set(checksum);
    this.error.set("");
  }

  private refreshContract(): void {
    const id = String(this.chainId() || 0);
    const stored = localStorage.getItem(`paylock.contract.${id}`);
    const fromFile = this.addresses[id] || "";
    // Do not fall back to Monad (10143) on other chains — that made Arbitrum
    // look unchanged (same 0x132f… address) when the chip was clicked.
    const addr = stored || fromFile || "";
    this.contract.set(addr && isAddress(addr) ? getAddress(addr) : "");
  }

  async connect(): Promise<void> {
    this.error.set("");
    if (!window.ethereum) {
      this.error.set("Install a browser wallet (MetaMask, Rabby, or Phantom EVM).");
      return;
    }
    const accounts = (await window.ethereum.request({
      method: "eth_requestAccounts",
    })) as string[];
    this.account.set(getAddress(accounts[0]));
    const cid = (await window.ethereum.request({ method: "eth_chainId" })) as string;
    this.chainId.set(Number.parseInt(cid, 16));
    this.refreshContract();
    await this.reloadInvoices();
  }

  /** Re-read invoices from the current contract (survives page reload). */
  async reloadInvoices(): Promise<void> {
    if (!window.ethereum || !this.contract() || !isAddress(this.contract())) {
      this.invoices.set([]);
      return;
    }
    try {
      const nextData = encodeFunctionData({ abi: PAYLOCK_ABI, functionName: "nextId" });
      const nextRaw = (await window.ethereum.request({
        method: "eth_call",
        params: [{ to: this.contract(), data: nextData }, "latest"],
      })) as Hex;
      const next = Number(hexToBigInt(nextRaw));
      const loaded: InvoiceView[] = [];
      for (let id = next - 1; id >= 1 && loaded.length < 8; id--) {
        try {
          loaded.push(await this.refreshInvoice(String(id)));
        } catch {
          /* skip gaps */
        }
      }
      // refreshInvoice already updates signal; keep newest-first unique
      const byId = new Map(loaded.map((x) => [x.id, x]));
      this.invoices.set([...byId.values()].sort((a, b) => Number(b.id) - Number(a.id)));
    } catch {
      /* leave list as-is */
    }
  }

  async switchChain(key: ChainKey): Promise<void> {
    if (!window.ethereum) return;
    this.invoices.set([]);
    const chain = CHAINS[key];
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chain.hexId }],
      });
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 4902 || code === -32603) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: chain.hexId,
              chainName: chain.name,
              nativeCurrency: { name: chain.symbol, symbol: chain.symbol, decimals: 18 },
              rpcUrls: [chain.rpc],
              blockExplorerUrls: chain.explorer ? [chain.explorer] : undefined,
            },
          ],
        });
      } else {
        throw err;
      }
    }
    const cid = (await window.ethereum.request({ method: "eth_chainId" })) as string;
    this.chainId.set(Number.parseInt(cid, 16));
    this.refreshContract();
    await this.reloadInvoices();
  }

  async lock(payee: string, amount: string, memo: string): Promise<string> {
    this.assertReady();
    if (!isAddress(payee)) throw new Error("Payee must be a 0x address.");
    const value = parseEther(amount);
    if (value <= 0n) throw new Error("Amount must be greater than 0.");
    const data = encodeFunctionData({
      abi: PAYLOCK_ABI,
      functionName: "lock",
      args: [getAddress(payee) as Address, this.toMemo(memo)],
    });
    return this.withBusy(async () => {
      const hash = await this.send({
        to: this.contract() as Address,
        data,
        value: toHex(value),
      });
      const id = await this.idFromReceipt(hash);
      await this.refreshInvoice(id);
      return id;
    });
  }

  async release(id: string, expectedPayee: string, amountEth: string): Promise<void> {
    this.assertReady();
    const data = encodeFunctionData({
      abi: PAYLOCK_ABI,
      functionName: "release",
      args: [BigInt(id), getAddress(expectedPayee) as Address, parseEther(amountEth)],
    });
    await this.withBusy(async () => {
      await this.simulate({ to: this.contract() as Address, data });
      await this.send({ to: this.contract() as Address, data });
      await this.refreshInvoice(id);
    });
  }

  async refund(id: string): Promise<void> {
    this.assertReady();
    const data = encodeFunctionData({
      abi: PAYLOCK_ABI,
      functionName: "refund",
      args: [BigInt(id)],
    });
    await this.withBusy(async () => {
      await this.send({ to: this.contract() as Address, data });
      await this.refreshInvoice(id);
    });
  }

  async refreshInvoice(id: string): Promise<InvoiceView> {
    const data = encodeFunctionData({
      abi: PAYLOCK_ABI,
      functionName: "get",
      args: [BigInt(id)],
    });
    const raw = (await window.ethereum!.request({
      method: "eth_call",
      params: [{ to: this.contract(), data }, "latest"],
    })) as Hex;
    const decoded = this.decodeInvoice(raw);
    const view: InvoiceView = {
      id,
      payer: decoded.payer,
      payee: decoded.payee,
      amountWei: decoded.amount,
      amountLabel: formatEther(decoded.amount),
      memo: decoded.memo,
      status: STATUS_LABEL[decoded.status] ?? String(decoded.status),
      statusCode: decoded.status,
    };
    const rest = this.invoices().filter((x) => x.id !== id);
    this.invoices.set([view, ...rest]);
    return view;
  }

  decodeRevert(err: unknown, fallback?: string): string {
    const blob = this.collectErrorText(err);
    const fromAbi = this.decodeRevertData(blob);
    if (fromAbi) return fromAbi;
    const mapped = this.mapRevertHex(blob);
    if (mapped) return mapped;
    if (/payee.?mismatch/i.test(blob)) {
      return "held · payee_mismatch — funds stayed in the lock";
    }
    if (/amount.?mismatch/i.test(blob)) {
      return "held · amount_mismatch — funds stayed in the lock";
    }
    if (/already.?settled/i.test(blob)) {
      return "already_settled — this invoice cannot pay twice";
    }
    if (/user rejected|user denied/i.test(blob)) {
      return "Wallet rejected the request.";
    }
    if (fallback && /transaction reverted|execution reverted|internal json-rpc/i.test(blob)) {
      return fallback;
    }
    const anyErr = err as { message?: string; shortMessage?: string };
    const text = anyErr?.shortMessage || anyErr?.message || String(err);
    return text.slice(0, 280);
  }

  private collectErrorText(err: unknown): string {
    const parts: string[] = [];
    const walk = (value: unknown, depth: number): void => {
      if (value == null || depth > 5) return;
      if (typeof value === "string" || typeof value === "number") {
        parts.push(String(value));
        return;
      }
      if (typeof value !== "object") return;
      const obj = value as Record<string, unknown>;
      for (const key of ["message", "shortMessage", "reason", "data"]) {
        if (key in obj) walk(obj[key], depth + 1);
      }
      if ("cause" in obj) walk(obj["cause"], depth + 1);
    };
    walk(err, 0);
    try {
      parts.push(JSON.stringify(err));
    } catch {
      parts.push(String(err));
    }
    return parts.join(" ");
  }

  private decodeRevertData(blob: string): string | null {
    const hexes = blob.match(/0x[0-9a-fA-F]{8,}/g) ?? [];
    for (const hex of hexes) {
      try {
        const decoded = decodeErrorResult({ abi: PAYLOCK_ABI, data: hex as Hex });
        return this.labelError(decoded.errorName);
      } catch {
        /* next hex, including tx hashes */
      }
    }
    return null;
  }

  private labelError(name: string): string | null {
    switch (name) {
      case "PayeeMismatch":
        return "held · payee_mismatch — funds stayed in the lock";
      case "AmountMismatch":
        return "held · amount_mismatch — funds stayed in the lock";
      case "AlreadySettled":
        return "already_settled — this invoice cannot pay twice";
      case "NotPayer":
        return "Only the payer who locked this invoice can settle it.";
      case "NotFound":
        return "Invoice not found on this contract.";
      case "WrongStatus":
        return "Invoice is not funded — lock payment first.";
      case "ZeroPayee":
        return "Payee cannot be the zero address.";
      case "ZeroAmount":
        return "Amount must be greater than 0.";
      case "TransferFailed":
        return "Token transfer failed.";
      default:
        return name;
    }
  }

  private mapRevertHex(blob: string): string | null {
    const hex = blob.toLowerCase();
    if (hex.includes("0xd89fe5b3")) return this.labelError("PayeeMismatch");
    if (hex.includes("0xce6b173b")) return this.labelError("AmountMismatch");
    if (hex.includes("0x560ff900")) return this.labelError("AlreadySettled");
    return null;
  }

  private isKnownRevert(msg: string): boolean {
    return (
      msg.startsWith("held ·") ||
      msg.startsWith("already_settled") ||
      msg.startsWith("Only the payer") ||
      msg.startsWith("Invoice ") ||
      msg.startsWith("Payee cannot") ||
      msg.startsWith("Amount must") ||
      msg.startsWith("Token transfer") ||
      msg === "Wallet rejected the request."
    );
  }

  private async simulate(tx: { to: Address; data: Hex }): Promise<void> {
    try {
      await window.ethereum!.request({
        method: "eth_call",
        params: [{ from: this.account(), to: tx.to, data: tx.data }, "latest"],
      });
    } catch (err) {
      const mapped = this.decodeRevert(err);
      if (this.isKnownRevert(mapped)) throw new Error(mapped);
      throw err;
    }
  }

  private async withBusy<T>(fn: () => Promise<T>): Promise<T> {
    this.busy.set(true);
    try {
      return await fn();
    } finally {
      this.busy.set(false);
    }
  }

  private assertReady(): void {
    if (!this.account()) throw new Error("Connect a wallet first.");
    if (!this.contract()) throw new Error("Paste the Paylock contract address for this network.");
  }

  private toMemo(memo: string): Hex {
    const bytes = new TextEncoder().encode(memo).slice(0, 32);
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `0x${hex.padEnd(64, "0")}` as Hex;
  }

  private async send(tx: { to?: Address; data: Hex; value?: string }): Promise<Hex> {
    const params: Record<string, string> = {
      from: this.account(),
      data: tx.data,
    };
    if (tx.to) params["to"] = tx.to;
    if (tx.value) params["value"] = tx.value;
    const hash = (await window.ethereum!.request({
      method: "eth_sendTransaction",
      params: [params],
    })) as Hex;
    await this.wait(hash);
    return hash;
  }

  async deploy(): Promise<string> {
    if (!this.account()) throw new Error("Connect a wallet first.");
    const key = this.chainKey();
    if (key !== "monadTestnet" && key !== "arbitrumSepolia" && key !== "xLayerTestnet") {
      throw new Error("Click Monad Testnet, Arbitrum Sepolia, or X Layer Testnet first.");
    }
    await this.switchChain(key);
    const { PAYLOCK_BYTECODE } = await import("./paylock.bytecode");
    return this.withBusy(async () => {
      const hash = await this.send({ data: PAYLOCK_BYTECODE });
      const receipt = (await window.ethereum!.request({
        method: "eth_getTransactionReceipt",
        params: [hash],
      })) as { contractAddress?: string; status?: string };
      const addr = receipt?.contractAddress;
      if (!addr) throw new Error("Deploy succeeded but no contract address in the receipt.");
      this.setManualContract(addr);
      return getAddress(addr);
    });
  }

  private async wait(hash: Hex): Promise<Record<string, unknown>> {
    for (let i = 0; i < 80; i++) {
      const receipt = (await window.ethereum!.request({
        method: "eth_getTransactionReceipt",
        params: [hash],
      })) as Record<string, unknown> | null;
      if (receipt) {
        if (receipt["status"] === "0x0") throw new Error("Transaction reverted.");
        return receipt;
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    throw new Error("Timed out waiting for the transaction.");
  }

  private async idFromReceipt(hash: Hex): Promise<string> {
    const receipt = (await window.ethereum!.request({
      method: "eth_getTransactionReceipt",
      params: [hash],
    })) as { logs: { topics: Hex[]; data: Hex }[] };
    for (const log of receipt.logs) {
      try {
        const parsed = decodeEventLog({
          abi: PAYLOCK_ABI,
          data: log.data,
          topics: log.topics as [Hex, ...Hex[]],
        });
        if (parsed.eventName === "Created") {
          const args = parsed.args as { id: bigint };
          return args.id.toString();
        }
      } catch {
        /* next log */
      }
    }
    throw new Error("Could not read invoice id from the receipt.");
  }

  private decodeInvoice(data: Hex): {
    payer: string;
    payee: string;
    amount: bigint;
    memo: string;
    status: number;
  } {
    const hex = data.slice(2);
    const word = (i: number) => hex.slice(i * 64, i * 64 + 64);
    const addr = (i: number) => getAddress(`0x${word(i).slice(24)}`);
    const memoHex = word(3);
    const memoBytes = memoHex.match(/.{2}/g)?.map((b) => Number.parseInt(b, 16)) ?? [];
    const memo = new TextDecoder().decode(Uint8Array.from(memoBytes)).replace(/\0/g, "");
    return {
      payer: addr(0),
      payee: addr(1),
      amount: hexToBigInt(`0x${word(2)}`),
      memo,
      status: Number(hexToBigInt(`0x${word(4)}`)),
    };
  }
}
