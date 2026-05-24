"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

interface ShopFilterProps {
  shops: Array<{ id: string; name: string }>;
  currentShopId: string | null;
}

export function ShopFilter({ shops, currentShopId }: ShopFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params.toString());
    if (e.target.value === "all") {
      next.delete("shop");
    } else {
      next.set("shop", e.target.value);
    }
    const query = next.toString();
    router.push(`${pathname}${query ? `?${query}` : ""}`);
  }

  if (shops.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="shop-filter" className="text-sm text-muted-foreground">
        店舗:
      </label>
      <select
        id="shop-filter"
        value={currentShopId ?? "all"}
        onChange={onChange}
        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
      >
        <option value="all">全店舗</option>
        {shops.map((shop) => (
          <option key={shop.id} value={shop.id}>
            {shop.name}
          </option>
        ))}
      </select>
    </div>
  );
}
