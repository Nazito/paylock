import { Component, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { PaylockService } from "./paylock.service";
import { CHAINS, type ChainKey } from "./paylock.abi";

const ATTACKER = "0x0000000000000000000000000000000000000bAD";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [FormsModule],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
})
export class AppComponent implements OnInit {
  readonly chains = CHAINS;
  payee = "";
  amount = "0.05";
  memo = "INV-1001";
  contractInput = "";
  lastMessage = "";
  lastKind: "ok" | "held" | "err" | "" = "";

  constructor(readonly pay: PaylockService) {}

  async ngOnInit(): Promise<void> {
    await this.pay.init();
    this.contractInput = this.pay.contract();
    window.ethereum?.on?.("chainChanged", () => {
      this.contractInput = this.pay.contract();
    });
  }

  chainKeys(): ChainKey[] {
    return ["monadTestnet", "arbitrumSepolia"];
  }

  deployLabel(): string {
    return this.pay.chainId() === CHAINS.arbitrumSepolia.id ? "Deploy on Arbitrum" : "Deploy on Monad";
  }

  async connect(): Promise<void> {
    try {
      await this.pay.connect();
      this.contractInput = this.pay.contract();
      if (!this.payee && this.pay.account()) this.payee = this.pay.account();
    } catch (e) {
      this.fail(e);
    }
  }

  async deploy(): Promise<void> {
    try {
      const addr = await this.pay.deploy();
      this.contractInput = addr;
      this.note("ok", `Deployed ${addr}. Next: lock an invoice.`);
    } catch (e) {
      this.fail(e);
    }
  }

  async useChain(key: ChainKey): Promise<void> {
    try {
      await this.pay.switchChain(key);
      this.contractInput = this.pay.contract();
      const name = CHAINS[key].name;
      if (this.pay.contract()) {
        this.note("ok", `On ${name}. Using saved contract.`);
      } else {
        this.note("ok", `On ${name}. No contract yet — click Deploy.`);
      }
    } catch (e) {
      this.fail(e);
    }
  }

  saveContract(): void {
    try {
      this.pay.setManualContract(this.contractInput);
      this.note("ok", "Contract saved for this network.");
    } catch (e) {
      this.fail(e);
    }
  }

  async lockPayment(): Promise<void> {
    try {
      const id = await this.pay.lock(this.payee.trim(), this.amount.trim(), this.memo.trim());
      this.note("ok", `Invoice ${id} funded. Status: funded.`);
    } catch (e) {
      this.fail(e);
    }
  }

  async tryAttacker(): Promise<void> {
    const inv = this.pay.invoices()[0];
    if (!inv) {
      this.note("err", "Lock an invoice first.");
      return;
    }
    try {
      await this.pay.release(inv.id, ATTACKER, inv.amountLabel);
      this.note("err", "Attacker was paid — that should not happen.");
    } catch (e) {
      this.note("held", this.pay.decodeRevert(e, "held · payee_mismatch — funds stayed in the lock"));
    }
  }

  async payInvoice(): Promise<void> {
    const inv = this.pay.invoices()[0];
    if (!inv) {
      this.note("err", "Lock an invoice first.");
      return;
    }
    try {
      await this.pay.release(inv.id, inv.payee, inv.amountLabel);
      this.note("ok", `Invoice ${inv.id} released to the listed payee.`);
    } catch (e) {
      this.fail(e);
    }
  }

  async payAgain(): Promise<void> {
    const inv = this.pay.invoices()[0];
    if (!inv) {
      this.note("err", "Lock an invoice first.");
      return;
    }
    try {
      await this.pay.release(inv.id, inv.payee, inv.amountLabel);
      this.note("err", "Second payout succeeded — that should not happen.");
    } catch (e) {
      this.note("held", this.pay.decodeRevert(e, "already_settled — this invoice cannot pay twice"));
    }
  }

  short(addr: string): string {
    if (!addr) return "—";
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  }

  private fail(e: unknown): void {
    this.note("err", this.pay.decodeRevert(e));
  }

  private note(kind: "ok" | "held" | "err", text: string): void {
    this.lastKind = kind;
    this.lastMessage = text;
  }
}
