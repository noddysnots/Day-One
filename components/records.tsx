import { longDate } from '@/lib/format';
import type { GoodsReceipt, PurchaseOrder, Vendor } from '@/lib/rows';
import { Amount, Label, Notice } from './primitives';

function Panel({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <div className="border border-rule">
      <div className="flex items-baseline justify-between gap-3 border-b border-rule px-3 py-2">
        <Label>{title}</Label>
        {meta ? <span className="font-mono text-micro opacity-70">{meta}</span> : null}
      </div>
      <div className="px-3 py-2">{children}</div>
    </div>
  );
}

export function PoRecord({ po, poNumber }: { po: PurchaseOrder | null; poNumber: string | null }) {
  if (!poNumber) {
    return (
      <Notice
        what="No purchase order is quoted on this invoice."
        fix="Nothing was raised against it, so there is nothing to match to. Somebody bought this off-process."
      />
    );
  }
  if (!po) {
    return (
      <Notice
        what={`${poNumber} is quoted on the invoice but is not in the ledger.`}
        fix="Either the number is wrong or the order was never raised. Check with procurement before paying anything."
      />
    );
  }
  return (
    <Panel title="Purchase order" meta={po.po_number}>
      <ul className="divide-y divide-rule">
        {po.line_items.map((l) => (
          <li key={l.sku} className="flex items-baseline justify-between gap-3 py-1.5">
            <span className="min-w-0">
              <span className="block truncate text-small">{l.description}</span>
              <span className="font-mono text-micro opacity-60">
                {l.sku} · {l.qty} × {l.unit_price.toFixed(2)}
              </span>
            </span>
            <Amount value={l.qty * l.unit_price} className="text-small" />
          </li>
        ))}
      </ul>
      <p className="mt-2 flex items-baseline justify-between border-t border-rule pt-2">
        <span className="font-mono text-micro">
          {po.status} · cut {longDate(po.po_date)}
        </span>
        <Amount value={po.total} className="text-small" />
      </p>
    </Panel>
  );
}

/** The vendor master. Its free-text notes carry the carve-outs that override the general rules. */
export function VendorRecord({ vendor }: { vendor: Vendor | null }) {
  if (!vendor) return null;
  return (
    <Panel title="Vendor terms" meta={vendor.payment_terms ?? undefined}>
      <p className="font-mono text-micro opacity-70">
        tolerance {vendor.tolerance_pct === null ? 'unset' : `${vendor.tolerance_pct}%`}
        {vendor.risk_flags?.length ? ` · ${vendor.risk_flags.join(', ')}` : ''}
      </p>
      {vendor.contract_notes ? <p className="mt-2 text-small">{vendor.contract_notes}</p> : null}
    </Panel>
  );
}

export function ReceiptRecord({ receipt }: { receipt: GoodsReceipt | null }) {
  if (!receipt) {
    return (
      <Notice
        what="Nothing was ever booked in against this order."
        fix="The dock has no record of receiving it. Do not pay until goods-in confirms, or the order is cancelled."
      />
    );
  }
  return (
    <Panel title="Goods receipt" meta={longDate(receipt.received_at)}>
      <ul className="divide-y divide-rule">
        {receipt.received_lines.map((l) => (
          <li key={l.sku} className="flex items-baseline justify-between gap-3 py-1.5 font-mono text-small">
            <span>{l.sku}</span>
            <span className="tabular-nums">{l.qty_received} received</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
